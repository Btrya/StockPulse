import { getStockList } from './_lib/tushare.js';
import { screenStock } from './_lib/screener.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL } from './_lib/constants.js';

const SCREEN_TTL = { daily: TTL.SCREEN_RESULT_DAILY, weekly: TTL.SCREEN_RESULT_WEEKLY };

const TIMEOUT_MS = 50000;

// 将日期调整到该周的周五（周线数据以周五为基准）
function snapToFriday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
  const diff = day === 0 ? -2 : day === 6 ? -1 : 5 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const body = req.body || {};
  const { date: rawDate, klt = 'daily', reset } = body;

  if (!rawDate) {
    return res.status(400).json({ error: '缺少 date 参数' });
  }

  // 周线回测：自动调整到该周周五
  const date = klt === 'weekly' ? snapToFriday(rawDate) : rawDate;

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    // 读取进度（独立于日常扫描）
    let progress = await redis.get(KEY.BACKTEST_PROGRESS);

    // 检查缓存 — 仅在该日期无进行中扫描时命中（否则中间写入会被误判为完成）
    const scanningThis = progress && progress.date === date && progress.klt === klt;
    if (!reset && !scanningThis) {
      const cached = await redis.get(KEY.screenResult(date, klt));
      const hits = Array.isArray(cached) ? cached : (cached?.hits || null);
      if (hits) {
        return res.json({ processed: hits.length, total: hits.length, idx: hits.length, done: true, needContinue: false, hits: hits.length });
      }
    }

    const forceReset = reset === true;
    let needNew = forceReset || !progress || progress.date !== date || progress.klt !== klt || !progress.stocks;

    if (needNew) {
      let stocks = await getStockList();
      stocks = stocks.filter(s => !s.name.includes('ST') && !s.name.includes('退'));

      // 写入 stocks:list 供查询 tab 使用
      await redis.set(KEY.STOCKS, stocks, TTL.STOCKS);

      progress = {
        date,
        klt,
        stocks,
        idx: 0,
        hits: [],
      };
      await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
    }

    let idx = progress.idx || 0;
    const hits = progress.hits || [];
    let processed = 0;

    const endDate = date.replace(/-/g, '');
    const lookbackDays = klt === 'weekly' ? 900 : 280;
    const startMs = new Date(date).getTime() - lookbackDays * 86400000;
    const startDate = new Date(startMs).toISOString().slice(0, 10).replace(/-/g, '');

    // 读取概念映射表
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
        // 中间结果写到 screenResult，供前端实时渲染
        await redis.set(KEY.screenResult(date, klt), hits, SCREEN_TTL[klt]);
      }

      await new Promise(r => setTimeout(r, 150));
    }

    progress.idx = idx;
    progress.hits = hits;

    const done = idx >= progress.stocks.length;

    if (done) {
      // 存全量指标数据（无预筛选），查询时由 filterResults 按用户参数过滤
      await redis.set(KEY.screenResult(date, klt), hits, SCREEN_TTL[klt]);
      await redis.del(KEY.BACKTEST_PROGRESS);
    } else {
      await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
    }

    return res.json({
      processed,
      total: progress.stocks.length,
      idx,
      hits: hits.length,
      done,
      needContinue: !done,
      adjustedDate: date !== rawDate ? date : undefined,
    });
  } catch (err) {
    console.error('backtest error:', err);
    return res.status(500).json({ error: err.message });
  }
}
