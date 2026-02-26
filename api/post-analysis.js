import * as redis from './_lib/redis.js';
import { KEY, TTL, TUSHARE_DELAY_MS } from './_lib/constants.js';
import { getDailyRange, getWeeklyRange } from './_lib/tushare.js';
import { shortTrendLine, bullBearLine } from './_lib/indicators.js';

const TIMEOUT_MS = 50000;

// ---- K线 Redis 缓存层 ----

async function getKlinesWithCache(tsCode, klt, startDate, endDate) {
  const cacheKey = KEY.kline(tsCode, klt);
  const cached = await redis.get(cacheKey);

  if (cached && cached.length > 0) {
    const first = cached[0].trade_date;
    const last = cached[cached.length - 1].trade_date;
    if (first <= startDate && last >= endDate) {
      return cached.filter(k => k.trade_date >= startDate && k.trade_date <= endDate);
    }
  }

  // cache miss or range not covered — call Tushare
  await new Promise(r => setTimeout(r, TUSHARE_DELAY_MS));
  const fn = klt === 'weekly' ? getWeeklyRange : getDailyRange;
  const klines = await fn(tsCode, startDate, endDate);

  if (klines && klines.length > 0) {
    // merge with existing cache to expand coverage
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

// ---- 量价分析 ----

function computeVolumeFlags(klines, screenIdx) {
  const start = Math.max(0, screenIdx - 30);
  const bars = klines.slice(start, screenIdx + 1);

  // 1. closeAboveShort
  const closesUpToScreen = klines.slice(0, screenIdx + 1).map(k => k.close);
  const st = shortTrendLine(closesUpToScreen);
  const closeAboveShort = st != null && bars[bars.length - 1].close > st;

  // 2. hasVolumeDouble — 任意一天 vol >= 2x 前一天
  let hasVolumeDouble = false;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].vol > 0 && bars[i].vol >= 2 * bars[i - 1].vol) {
      hasVolumeDouble = true;
      break;
    }
  }

  // 3. hasShrinkingPullback — 高点后阴线缩量
  let peakIdx = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[peakIdx].close) peakIdx = i;
  }
  let maxBullVol = 0;
  for (let i = 0; i <= peakIdx; i++) {
    if (bars[i].close > bars[i].open && bars[i].vol > maxBullVol)
      maxBullVol = bars[i].vol;
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

  // 4. hasConsecutiveShrink — 连续3天 close↓ AND vol↓
  let hasConsecutiveShrink = false, streak = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close < bars[i - 1].close && bars[i].vol < bars[i - 1].vol) {
      if (++streak >= 3) { hasConsecutiveShrink = true; break; }
    } else { streak = 0; }
  }

  return { closeAboveShort, hasVolumeDouble, hasShrinkingPullback, hasConsecutiveShrink };
}

// ---- handler ----

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
      progress = {
        date, klt, window: win,
        tsCodes,
        idx: 0,
        results: [],
      };
      await redis.set(KEY.PA_PROGRESS, progress, TTL.PROGRESS);
    }

    // date range: screenDate - 180d ~ screenDate + 90d
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
  const screenIdx = klines.findIndex(k => k.trade_date === screenYmd);
  if (screenIdx < 0) return null;

  const entryIdx = screenIdx + 1;
  if (entryIdx >= klines.length) return null;

  const entryBar = klines[entryIdx];
  const entryDate = entryBar.trade_date;
  const entryOpen = entryBar.open;
  const entryLow = entryBar.low;

  // build future bars with indicators + vol
  const futureBars = [];
  const maxIdx = Math.min(entryIdx + window, klines.length);

  for (let i = entryIdx; i < maxIdx; i++) {
    const bar = klines[i];
    const closesSlice = klines.slice(0, i + 1).map(k => k.close);
    const st = shortTrendLine(closesSlice);
    const bb = bullBearLine(closesSlice);

    futureBars.push({
      date: bar.trade_date,
      open: round2(bar.open),
      high: round2(bar.high),
      low: round2(bar.low),
      close: round2(bar.close),
      vol: bar.vol,
      shortTrend: st != null ? round2(st) : null,
      bullBear: bb != null ? round2(bb) : null,
    });
  }

  if (futureBars.length === 0) return null;

  // compute volume flags
  const flags = computeVolumeFlags(klines, screenIdx);

  return {
    tsCode: meta.tsCode,
    code: meta.code,
    name: meta.name,
    industry: meta.industry || '',
    entryDate,
    entryOpen: round2(entryOpen),
    entryLow: round2(entryLow),
    futureBars,
    ...flags,
  };
}
