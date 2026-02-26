import * as redis from './_lib/redis.js';
import { KEY, TTL, TUSHARE_DELAY_MS } from './_lib/constants.js';
import { getDailyRange, getWeeklyRange } from './_lib/tushare.js';
import { shortTrendLine, bullBearLine } from './_lib/indicators.js';

const TIMEOUT_MS = 50000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const body = req.body || {};
  const { date, klt = 'daily', window: win = 30, tsCodes, reset } = body;

  if (!date || !tsCodes?.length) {
    return res.status(400).json({ error: '缺少 date 或 tsCodes 参数' });
  }

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    const cacheKey = KEY.postAnalysis(date, klt, win);

    // check cache
    if (!reset) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ done: true, data: cached });
      }
    }

    // check in-progress
    let progress = await redis.get(KEY.PA_PROGRESS);

    if (reset || !progress || progress.date !== date || progress.klt !== klt || progress.window !== win) {
      // start fresh
      progress = {
        date, klt, window: win,
        tsCodes,
        idx: 0,
        results: [],
      };
      await redis.set(KEY.PA_PROGRESS, progress, TTL.PROGRESS);
    }

    // date range: screenDate - 180d ~ screenDate + 90d (covers ~120 history + ~60 future bars)
    const baseDate = new Date(date + 'T12:00:00Z');
    const startMs = baseDate.getTime() - 180 * 86400000;
    const endMs = baseDate.getTime() + 90 * 86400000;
    const startDate = new Date(startMs).toISOString().slice(0, 10).replace(/-/g, '');
    const endDate = new Date(endMs).toISOString().slice(0, 10).replace(/-/g, '');
    const screenYmd = date.replace(/-/g, '');

    const fn = klt === 'weekly' ? getWeeklyRange : getDailyRange;
    let idx = progress.idx || 0;
    const results = progress.results || [];

    while (idx < progress.tsCodes.length) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const { tsCode, code, name, industry } = progress.tsCodes[idx];

      try {
        const klines = await fn(tsCode, startDate, endDate);
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

      await new Promise(r => setTimeout(r, TUSHARE_DELAY_MS));
    }

    progress.idx = idx;
    progress.results = results;

    const done = idx >= progress.tsCodes.length;

    if (done) {
      await redis.set(cacheKey, results, TTL.POST_ANALYSIS);
      await redis.del(KEY.PA_PROGRESS);
    } else {
      await redis.set(KEY.PA_PROGRESS, progress, TTL.PROGRESS);

      // self-call to continue
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const selfUrl = `${proto}://${req.headers.host}/api/post-analysis`;
      fetch(selfUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, klt, window: win, tsCodes: progress.tsCodes }),
      }).catch(() => {});
    }

    return res.json({
      done,
      idx,
      total: progress.tsCodes.length,
      data: done ? results : null,
    });
  } catch (err) {
    console.error('post-analysis error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function buildStockRecord(klines, screenYmd, window, meta) {
  // find screen date index
  const screenIdx = klines.findIndex(k => k.trade_date === screenYmd);
  if (screenIdx < 0) return null;

  // entry = next trading day after screen date
  const entryIdx = screenIdx + 1;
  if (entryIdx >= klines.length) return null;

  const entryBar = klines[entryIdx];
  const entryDate = entryBar.trade_date;
  const entryOpen = entryBar.open;
  const entryLow = entryBar.low;

  // build future bars with indicators
  const futureBars = [];
  const maxIdx = Math.min(entryIdx + window, klines.length);

  for (let i = entryIdx; i < maxIdx; i++) {
    const bar = klines[i];
    // use all closes up to and including this bar for indicator calculation
    const closesSlice = klines.slice(0, i + 1).map(k => k.close);
    const st = shortTrendLine(closesSlice);
    const bb = bullBearLine(closesSlice);

    futureBars.push({
      date: bar.trade_date,
      open: round2(bar.open),
      high: round2(bar.high),
      low: round2(bar.low),
      close: round2(bar.close),
      shortTrend: st != null ? round2(st) : null,
      bullBear: bb != null ? round2(bb) : null,
    });
  }

  if (futureBars.length === 0) return null;

  return {
    tsCode: meta.tsCode,
    code: meta.code,
    name: meta.name,
    industry: meta.industry || '',
    entryDate,
    entryOpen: round2(entryOpen),
    entryLow: round2(entryLow),
    futureBars,
  };
}
