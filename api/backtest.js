import { getStockList } from './_lib/tushare.js';
import { screenStock } from './_lib/screener.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL, DEFAULT_J, DEFAULT_TOLERANCE, DEFAULT_KLT, MARKET_BOARDS, TUSHARE_BULK, snapToFriday } from './_lib/constants.js';
import { filterResults } from './_lib/screener.js';
import { bulkScan } from './_lib/bulk-scan.js';
import { requireRole } from './_lib/auth.js';
import { recordEvent } from './_lib/stats.js';
import { PERMISSIONS } from './_lib/permissions.js';

const SCREEN_TTL = { daily: TTL.SCREEN_RESULT_DAILY, weekly: TTL.SCREEN_RESULT_WEEKLY };
const TIMEOUT_MS = 50000;

export default async function handler(req, res) {
  const session = await requireRole(req, res, PERMISSIONS.tab_backtest);
  if (!session) return;
  const { email } = session;

  // ── GET：读取回测结果 ──
  if (req.method === 'GET') {
    return handleGetResults(req, res, session);
  }

  // ── POST：触发回测扫描 ──
  if (req.method === 'POST') {
    recordEvent(email, 'backtest');
    return handlePostScan(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── GET handler（原 backtest-results.js）──
async function handleGetResults(req, res, session) {
  try {
    const rawDate = req.query.date;
    if (!rawDate) {
      return res.status(400).json({ error: '缺少 date 参数' });
    }

    const canJ = can(session.role, 'param_jThreshold');
    const j = canJ ? Number(req.query.j ?? DEFAULT_J) : 13;
    const tolerance = canJ ? Number(req.query.tolerance ?? DEFAULT_TOLERANCE) : DEFAULT_TOLERANCE;
    const klt = req.query.klt || DEFAULT_KLT;
    const date = klt === 'weekly' ? snapToFriday(rawDate) : rawDate;
    const sort = req.query.sort || 'j';
    const order = req.query.order || 'asc';
    const industries = req.query.industries ? req.query.industries.split(',').filter(Boolean) : [];
    const excludeBoards = req.query.excludeBoards ? req.query.excludeBoards.split(',').filter(Boolean) : [];
    const concepts = req.query.concepts ? req.query.concepts.split(',').filter(Boolean) : [];
    const dynamicJ = canJ && req.query.dynamicJ === '1';
    const strategies = req.query.strategies ? req.query.strategies.split(',').filter(Boolean) : [];
    const combinator = req.query.combinator || undefined;
    const line = req.query.line || undefined;
    const closeAboveShort = req.query.closeAboveShort === '1';
    const hasVolumeDouble = req.query.hasVolumeDouble === '1';
    const hasShrinkingPullback = req.query.hasShrinkingPullback === '1';
    const hasConsecutiveShrink = req.query.hasConsecutiveShrink === '1';
    const whiteBelowTwenty = req.query.whiteBelowTwenty === '1';

    if (!redis.isConfigured()) {
      return res.json({ data: [], meta: { error: 'Redis 未配置' } });
    }

    const raw = await redis.get(KEY.screenResult(date, klt));
    const data = Array.isArray(raw) ? raw : (raw?.hits || null);

    if (!data) {
      return res.json({
        data: [],
        meta: { total: 0, message: '暂无回测数据，请先执行回测', klt, date },
      });
    }

    try {
      const conceptsMap = await redis.get(KEY.CONCEPTS_MAP);
      if (conceptsMap) {
        for (const r of data) r.concepts = conceptsMap[r.ts_code] || [];
      }
    } catch {}

    try {
      const jProfileMap = await redis.get(KEY.JPROFILE_MAP);
      if (jProfileMap) {
        for (const r of data) r.sensitiveJ = jProfileMap[r.ts_code] ?? null;
      }
    } catch {}

    const allIndustries = [...new Set(data.map(r => r.industry).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'zh-CN')
    );
    const allConcepts = [...new Set(data.flatMap(r => r.concepts || []))].sort(
      (a, b) => a.localeCompare(b, 'zh-CN')
    );

    const filtered = filterResults(data, {
      jThreshold: j, tolerance, industries, excludeBoards, concepts, dynamicJ,
      strategies: strategies.length ? strategies : undefined,
      combinator, line,
      closeAboveShort, hasVolumeDouble, hasShrinkingPullback, hasConsecutiveShrink, whiteBelowTwenty,
    });

    filtered.sort((a, b) => {
      const va = a[sort] ?? 0;
      const vb = b[sort] ?? 0;
      return order === 'asc' ? va - vb : vb - va;
    });

    return res.json({
      data: filtered,
      meta: {
        total: filtered.length,
        wideTotal: data.length,
        scanDate: date,
        klt,
        industries: allIndustries,
        concepts: allConcepts,
        boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
      },
    });
  } catch (err) {
    console.error('backtest-results error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── POST handler（原 backtest.js）──
async function handlePostScan(req, res) {
  const startTime = Date.now();
  const body = req.body || {};
  const { date: rawDate, klt = 'daily', reset } = body;

  if (!rawDate) {
    return res.status(400).json({ error: '缺少 date 参数' });
  }

  let date = klt === 'weekly' ? snapToFriday(rawDate) : rawDate;

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    let progress = await redis.get(KEY.BACKTEST_PROGRESS);

    const scanningThis = progress && progress.date === date && progress.klt === klt;
    if (!reset && !scanningThis) {
      const cached = await redis.get(KEY.screenResult(date, klt));
      const hits = Array.isArray(cached) ? cached : (cached?.hits || null);
      if (hits) {
        const stillActive = !!(progress && (progress.stocks || progress.phase));
        return res.json({
          processed: hits.length, total: hits.length, idx: hits.length,
          done: true,
          needContinue: stillActive,
          hits: hits.length,
          currentDate: progress?.date,
          queue: progress?.queue || [],
        });
      }
    }

    if (TUSHARE_BULK) {
      return await handleBulk(req, res, { date, klt, reset, rawDate, startTime, progress });
    }

    const forceReset = reset === true;

    if (forceReset || !progress || !progress.stocks) {
      let stocks = await getStockList();
      stocks = stocks.filter(s => !s.name.includes('ST') && !s.name.includes('退'));
      await redis.set(KEY.STOCKS, stocks, TTL.STOCKS);
      progress = { date, klt, stocks, idx: 0, hits: [], queue: [] };
      await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
    } else if (progress.date !== date || progress.klt !== klt) {
      const queue = progress.queue || [];
      if (!queue.some(q => q.date === date && q.klt === klt)) {
        const cached = await redis.get(KEY.screenResult(date, klt));
        if (!(Array.isArray(cached) ? cached.length : cached?.hits?.length)) {
          queue.push({ date, klt });
          progress.queue = queue;
          await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
        }
      }
      return res.json({
        queued: true,
        currentDate: progress.date,
        idx: progress.idx,
        total: progress.stocks.length,
        hits: progress.hits.length,
        done: false,
        needContinue: true,
        queue: progress.queue || [],
      });
    }

    let idx = progress.idx || 0;
    const hits = progress.hits || [];
    let processed = 0;

    const endDate = date.replace(/-/g, '');
    const lookbackDays = klt === 'weekly' ? 900 : 280;
    const startMs = new Date(date).getTime() - lookbackDays * 86400000;
    const startDate = new Date(startMs).toISOString().slice(0, 10).replace(/-/g, '');

    let conceptsMap = null;
    try { conceptsMap = await redis.get(KEY.CONCEPTS_MAP); } catch {}

    const { getDailyRange, getWeeklyRange } = await import('./_lib/tushare.js');
    const fn = klt === 'weekly' ? getWeeklyRange : getDailyRange;

    while (idx < progress.stocks.length) {
      if (Date.now() - startTime > TIMEOUT_MS) break;
      const stock = progress.stocks[idx];
      try {
        const klines = await fn(stock.ts_code, startDate, endDate);
        const result = screenStock({ ...stock, klines }, { noFilter: true });
        if (result) {
          result.concepts = conceptsMap?.[stock.ts_code] || [];
          hits.push(result);
        }
      } catch { /* skip */ }
      idx++;
      processed++;
      if (processed % 50 === 0) {
        progress.idx = idx;
        progress.hits = hits;
        await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
        await redis.set(KEY.screenResult(date, klt), hits, SCREEN_TTL[klt]);
      }
      await new Promise(r => setTimeout(r, 150));
    }

    progress.idx = idx;
    progress.hits = hits;
    const done = idx >= progress.stocks.length;

    if (done) {
      await redis.set(KEY.screenResult(date, klt), hits, SCREEN_TTL[klt]);
      const queue = progress.queue || [];
      if (queue.length > 0) {
        const next = queue.shift();
        progress.date = next.date;
        progress.klt = next.klt;
        progress.idx = 0;
        progress.hits = [];
        progress.queue = queue;
        await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
      } else {
        await redis.del(KEY.BACKTEST_PROGRESS);
      }
    } else {
      await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
    }

    const hasMore = !done || (progress.queue?.length > 0);
    if (hasMore) {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      fetch(`${proto}://${req.headers.host}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: progress.date, klt: progress.klt }),
      }).catch(() => {});
    }

    return res.json({
      processed,
      total: progress.stocks?.length || 0,
      idx,
      hits: hits.length,
      done,
      needContinue: !done || !!(progress.queue?.length),
      currentDate: progress.date,
      queue: progress.queue || [],
      adjustedDate: date !== rawDate ? date : undefined,
    });
  } catch (err) {
    console.error('backtest error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function bulkCompat(result) {
  return { idx: result.dateIdx || result.totalDates || 0, total: result.totalDates || 0, processed: result.dateIdx || 0 };
}

async function handleBulk(req, res, { date, klt, reset, rawDate, startTime, progress }) {
  const forceReset = reset === true;

  if (!forceReset && progress && progress.phase && progress.date !== date) {
    const queue = progress.queue || [];
    if (!queue.some(q => q.date === date && q.klt === klt)) {
      const cached = await redis.get(KEY.screenResult(date, klt));
      if (!(Array.isArray(cached) ? cached.length : cached?.hits?.length)) {
        queue.push({ date, klt });
        progress.queue = queue;
        await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
      }
    }
    return res.json({
      queued: true,
      currentDate: progress.date,
      done: false,
      needContinue: true,
      queue: progress.queue || [],
      idx: progress.dateIdx || 0,
      total: progress.tradingDates?.length || 0,
    });
  }

  const result = await bulkScan({
    klt, today: date, startTime, singleKlt: true, forceReset,
    progressKey: KEY.BACKTEST_PROGRESS, skipScanDates: true,
  });

  if (result.done) {
    const prog = await redis.get(KEY.BACKTEST_PROGRESS);
    const queue = (progress?.queue || prog?.queue || []);
    if (queue.length > 0) {
      const next = queue.shift();
      await redis.set(KEY.BACKTEST_PROGRESS, {
        date: next.date, klt: next.klt, singleKlt: true,
        phase: 'fetch', dateIdx: 0, tradingDates: null,
        startedAt: new Date().toISOString(), queue,
      }, TTL.PROGRESS);
      const proto = req.headers['x-forwarded-proto'] || 'https';
      fetch(`${proto}://${req.headers.host}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: next.date, klt: next.klt }),
      }).catch(() => {});
      return res.json({
        ...result, ...bulkCompat(result),
        needContinue: true, currentDate: next.date, queue,
        adjustedDate: date !== rawDate ? date : undefined,
      });
    }
  }

  if (result.done) await redis.del(KEY.BACKTEST_PROGRESS);

  if (!result.done) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    fetch(`${proto}://${req.headers.host}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, klt }),
    }).catch(() => {});
  }

  return res.json({
    ...result, ...bulkCompat(result),
    needContinue: !result.done,
    currentDate: date,
    queue: progress?.queue || [],
    adjustedDate: date !== rawDate ? date : undefined,
  });
}
