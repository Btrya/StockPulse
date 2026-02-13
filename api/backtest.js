import { getStockList } from './_lib/tushare.js';
import { screenStock } from './_lib/screener.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL } from './_lib/constants.js';

const TIMEOUT_MS = 50000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const body = req.body || {};
  const { date, klt = 'daily', industries, concepts, reset } = body;

  if (!date) {
    return res.status(400).json({ error: '缺少 date 参数' });
  }

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    // 检查缓存
    const cached = await redis.get(KEY.backtestResult(date, klt));
    if (cached && !reset) {
      return res.json({ processed: cached.length, total: cached.length, idx: cached.length, done: true, needContinue: false, hits: cached.length });
    }

    // 读取进度（独立于日常扫描）
    let progress = await redis.get(KEY.BACKTEST_PROGRESS);

    const forceReset = reset === true;

    if (forceReset || !progress || progress.date !== date || progress.klt !== klt || !progress.stocks) {
      let stocks = await getStockList();
      stocks = stocks.filter(s => !s.name.includes('ST') && !s.name.includes('退'));

      // 按行业/概念缩小范围
      if (industries && industries.length) {
        stocks = stocks.filter(s => industries.includes(s.industry));
      }

      // 概念过滤需要 concepts map
      if (concepts && concepts.length) {
        const conceptsMap = await redis.get(KEY.CONCEPTS_MAP);
        if (conceptsMap) {
          stocks = stocks.filter(s => {
            const sc = conceptsMap[s.ts_code] || [];
            return concepts.some(c => sc.includes(c));
          });
        }
      }

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

    // endDate 格式化
    const endDate = date.replace(/-/g, '');
    // startDate = date - 280 天
    const startMs = new Date(date).getTime() - 280 * 86400000;
    const startDate = new Date(startMs).toISOString().slice(0, 10).replace(/-/g, '');

    const { getDailyRange, getWeeklyRange } = await import('./_lib/tushare.js');
    const fn = klt === 'weekly' ? getWeeklyRange : getDailyRange;

    while (idx < progress.stocks.length) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const stock = progress.stocks[idx];
      try {
        const klines = await fn(stock.ts_code, startDate, endDate);
        const result = screenStock({ ...stock, klines });
        if (result) hits.push(result);
      } catch { /* skip */ }

      idx++;
      processed++;

      if (processed % 50 === 0) {
        progress.idx = idx;
        progress.hits = hits;
        await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
      }

      await new Promise(r => setTimeout(r, 150));
    }

    progress.idx = idx;
    progress.hits = hits;

    const done = idx >= progress.stocks.length;

    if (done) {
      await redis.set(KEY.backtestResult(date, klt), hits, TTL.BACKTEST_RESULT);
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
    });
  } catch (err) {
    console.error('backtest error:', err);
    return res.status(500).json({ error: err.message });
  }
}
