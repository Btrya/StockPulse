import * as redis from './_lib/redis.js';
import { KEY, TTL, TUSHARE_DELAY_MS, hashCodes } from './_lib/constants.js';
import { getDailyRange, getWeeklyRange } from './_lib/tushare.js';
import { shortTrendLine, bullBearLine } from './_lib/indicators.js';
import { requireRole } from './_lib/auth.js';

const TIMEOUT_MS = 50000;

export default async function handler(req, res) {
  const role = await requireRole(req, res, 'premium');
  if (!role) return;

  // ── GET：读取复盘数据（原 post-analysis-data.js）──
  if (req.method === 'GET') {
    return handleGetData(req, res);
  }

  // ── POST：触发复盘计算 ──
  if (req.method === 'POST') {
    return handlePostTrigger(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── GET handler ──
async function handleGetData(req, res) {
  const { date, klt = 'daily', window: win = '30', codesHash = '' } = req.query || {};

  if (!date) {
    return res.status(400).json({ error: '缺少 date 参数' });
  }

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    const cacheKey = KEY.postAnalysis(date, klt, Number(win), codesHash);
    const data = await redis.get(cacheKey);

    if (data) {
      return res.json({ done: true, data, codesHash });
    }

    const progress = await redis.get(KEY.PA_PROGRESS);
    if (progress && progress.date === date && progress.klt === klt && progress.codesHash === codesHash) {
      return res.json({
        done: false,
        idx: progress.idx || 0,
        total: progress.tsCodes?.length || 0,
        codesHash,
      });
    }

    return res.json({ done: false, data: null, codesHash });
  } catch (err) {
    console.error('post-analysis-data error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── POST handler ──
async function handlePostTrigger(req, res) {
  const startTime = Date.now();
  const body = req.body || {};
  const { date, klt = 'daily', window: win = 30, tsCodes, reset } = body;
  const codesHash = body.codesHash || (tsCodes ? hashCodes(tsCodes) : '');

  if (!date || !tsCodes?.length) {
    return res.status(400).json({ error: '缺少 date 或 tsCodes 参数' });
  }

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    const cacheKey = KEY.postAnalysis(date, klt, win, codesHash);

    if (!reset) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ done: true, data: cached, codesHash });
      }
    }

    let progress = await redis.get(KEY.PA_PROGRESS);

    if (reset || !progress || progress.date !== date || progress.klt !== klt || progress.window !== win || progress.codesHash !== codesHash) {
      if (reset && progress?.codesHash) {
        await redis.del(KEY.postAnalysis(date, klt, win, progress.codesHash));
      }
      progress = { date, klt, window: win, codesHash, tsCodes, idx: 0, results: [] };
      await redis.set(KEY.PA_PROGRESS, progress, TTL.PROGRESS);
    }

    const baseDate = new Date(date + 'T12:00:00Z');
    const startMs = baseDate.getTime() - 180 * 86400000;
    const endMs = baseDate.getTime() + 90 * 86400000;
    const startDate = new Date(startMs).toISOString().slice(0, 10).replace(/-/g, '');
    const endDate = new Date(endMs).toISOString().slice(0, 10).replace(/-/g, '');
    const screenYmd = date.replace(/-/g, '');

    let idx = progress.idx || 0;
    const results = progress.results || [];

    while (idx < progress.tsCodes.length) {
      if (Date.now() - startTime > TIMEOUT_MS) break;
      const { tsCode, code, name, industry } = progress.tsCodes[idx];
      try {
        const klines = await getKlinesWithCache(tsCode, klt, startDate, endDate);
        if (klines && klines.length > 0) {
          const record = buildStockRecord(klines, screenYmd, win, { tsCode, code, name, industry });
          if (record) results.push(record);
        }
      } catch { /* skip */ }
      idx++;
      if (idx % 20 === 0) {
        progress.idx = idx;
        progress.results = results;
        await redis.set(KEY.PA_PROGRESS, progress, TTL.PROGRESS);
      }
    }

    progress.idx = idx;
    progress.results = results;
    const done = idx >= progress.tsCodes.length;

    if (done) {
      await redis.set(cacheKey, results, TTL.POST_ANALYSIS);
      await redis.del(KEY.PA_PROGRESS);
    } else {
      await redis.set(KEY.PA_PROGRESS, progress, TTL.PROGRESS);
      const proto = req.headers['x-forwarded-proto'] || 'https';
      fetch(`${proto}://${req.headers.host}/api/post-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, klt, window: win, tsCodes: progress.tsCodes, codesHash }),
      }).catch(() => {});
    }

    return res.json({ done, idx, total: progress.tsCodes.length, data: done ? results : null, codesHash });
  } catch (err) {
    console.error('post-analysis error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ---- K线缓存层 ----

async function getKlinesWithCache(tsCode, klt, startDate, endDate) {
  const cacheKey = KEY.kline(tsCode, klt);
  const cached = await redis.get(cacheKey);
  const fn = klt === 'weekly' ? getWeeklyRange : getDailyRange;

  if (cached && cached.length > 0) {
    const first = cached[0].trade_date;
    const last = cached[cached.length - 1].trade_date;
    if (first <= startDate && last >= endDate) {
      return cached.filter(k => k.trade_date >= startDate && k.trade_date <= endDate);
    }
    if (first <= startDate && last >= startDate) {
      const gapStart = incrementDate(last);
      if (gapStart <= endDate) {
        await new Promise(r => setTimeout(r, TUSHARE_DELAY_MS));
        let extra = [];
        try { extra = await fn(tsCode, gapStart, endDate) || []; } catch { /* ok */ }
        const map = new Map();
        for (const k of cached) map.set(k.trade_date, k);
        for (const k of extra) map.set(k.trade_date, k);
        const merged = [...map.values()].sort((a, b) => a.trade_date < b.trade_date ? -1 : 1);
        await redis.set(cacheKey, merged, TTL.KLINE);
        return merged.filter(k => k.trade_date >= startDate && k.trade_date <= endDate);
      }
      return cached.filter(k => k.trade_date >= startDate && k.trade_date <= endDate);
    }
  }

  await new Promise(r => setTimeout(r, TUSHARE_DELAY_MS));
  const klines = await fn(tsCode, startDate, endDate);
  if (klines && klines.length > 0) {
    if (cached && cached.length > 0) {
      const map = new Map();
      for (const k of cached) map.set(k.trade_date, k);
      for (const k of klines) map.set(k.trade_date, k);
      const merged = [...map.values()].sort((a, b) => a.trade_date < b.trade_date ? -1 : 1);
      await redis.set(cacheKey, merged, TTL.KLINE);
    } else {
      await redis.set(cacheKey, klines, TTL.KLINE);
    }
  }
  return klines;
}

function incrementDate(ymd) {
  const y = +ymd.slice(0, 4), m = +ymd.slice(4, 6) - 1, d = +ymd.slice(6, 8);
  const dt = new Date(Date.UTC(y, m, d + 1));
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
}

// ---- 量价分析 ----

function computeVolumeFlags(klines, screenIdx) {
  const start = Math.max(0, screenIdx - 30);
  const bars = klines.slice(start, screenIdx + 1);

  const closesUpToScreen = klines.slice(0, screenIdx + 1).map(k => k.close);
  const st = shortTrendLine(closesUpToScreen);
  const closeAboveShort = st != null && bars[bars.length - 1].close > st;

  let hasVolumeDouble = false;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].vol > 0 && bars[i].vol >= 2 * bars[i - 1].vol) { hasVolumeDouble = true; break; }
  }

  let peakIdx = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[peakIdx].close) peakIdx = i;
  }
  let maxBullVol = 0;
  for (let i = 0; i <= peakIdx; i++) {
    if (bars[i].close > bars[i].open && bars[i].vol > maxBullVol) maxBullVol = bars[i].vol;
  }
  let hasShrinkingPullback = false;
  if (maxBullVol > 0) {
    let bearCount = 0, allShrink = true;
    for (let i = peakIdx + 1; i < bars.length && bearCount < 2; i++) {
      if (bars[i].close < bars[i].open) {
        bearCount++;
        if (bars[i].vol >= maxBullVol * 0.75) { allShrink = false; break; }
      }
    }
    hasShrinkingPullback = bearCount > 0 && allShrink;
  }

  let hasConsecutiveShrink = false, streak = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close < bars[i - 1].close && bars[i].vol < bars[i - 1].vol) {
      if (++streak >= 3) { hasConsecutiveShrink = true; break; }
    } else { streak = 0; }
  }

  return { closeAboveShort, hasVolumeDouble, hasShrinkingPullback, hasConsecutiveShrink };
}

function round2(n) { return Math.round(n * 100) / 100; }

function buildStockRecord(klines, screenYmd, window, meta) {
  const screenIdx = klines.findIndex(k => k.trade_date === screenYmd);
  if (screenIdx < 0) return null;
  const entryIdx = screenIdx + 1;
  if (entryIdx >= klines.length) return null;

  const entryBar = klines[entryIdx];
  const futureBars = [];
  const maxIdx = Math.min(entryIdx + window, klines.length);

  for (let i = entryIdx; i < maxIdx; i++) {
    const bar = klines[i];
    const closesSlice = klines.slice(0, i + 1).map(k => k.close);
    const st = shortTrendLine(closesSlice);
    const bb = bullBearLine(closesSlice);
    futureBars.push({
      date: bar.trade_date,
      open: round2(bar.open), high: round2(bar.high),
      low: round2(bar.low), close: round2(bar.close),
      vol: bar.vol,
      shortTrend: st != null ? round2(st) : null,
      bullBear: bb != null ? round2(bb) : null,
    });
  }

  if (futureBars.length === 0) return null;

  return {
    tsCode: meta.tsCode, code: meta.code, name: meta.name, industry: meta.industry || '',
    entryDate: entryBar.trade_date,
    entryOpen: round2(entryBar.open),
    entryLow: round2(entryBar.low),
    futureBars,
    ...computeVolumeFlags(klines, screenIdx),
  };
}
