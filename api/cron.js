import { getStockList, batchGetKlines } from './_lib/tushare.js';
import { screenStock } from './_lib/screener.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL } from './_lib/constants.js';

const TIMEOUT_MS = 50000;

export default async function handler(req, res) {
  // 验证 CRON_SECRET
  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  // 起始日期：往前推 200 天
  const start = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');

  try {
    if (!redis.isConfigured()) {
      return res.json({ message: 'Redis not configured, skipping' });
    }

    // 读取进度（支持断点续扫）
    let progress = await redis.get(KEY.PROGRESS);

    // 获取股票列表
    let stocks;
    if (progress && progress.date === today && progress.stocks) {
      stocks = progress.stocks;
    } else {
      stocks = await getStockList();
      // 过滤 ST 和 退市
      stocks = stocks.filter(s => !s.name.includes('ST') && !s.name.includes('退'));
      progress = { date: today, stocks, idx: 0, dailyHits: [], weeklyHits: [] };
      await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);
    }

    const klt = progress.currentKlt || 'daily';
    let idx = progress.idx || 0;
    const hits = klt === 'daily' ? (progress.dailyHits || []) : (progress.weeklyHits || []);
    let processed = 0;

    // 读取概念映射表
    let conceptsMap = null;
    try { conceptsMap = await redis.get(KEY.CONCEPTS_MAP); } catch {}

    // 逐只股票扫描
    while (idx < stocks.length) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const stock = stocks[idx];
      try {
        const klines = klt === 'weekly'
          ? await (await import('./_lib/tushare.js')).getWeekly(stock.ts_code, start)
          : await (await import('./_lib/tushare.js')).getDaily(stock.ts_code, start);

        const result = screenStock({ ...stock, klines });
        if (result) {
          result.concepts = conceptsMap?.[stock.ts_code] || [];
          hits.push(result);
        }
      } catch {
        // 单只失败跳过
      }

      idx++;
      processed++;

      // 每 50 只保存一次进度
      if (processed % 50 === 0) {
        if (klt === 'daily') progress.dailyHits = hits;
        else progress.weeklyHits = hits;
        progress.idx = idx;
        progress.currentKlt = klt;
        await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);
      }

      // Tushare 限流
      await new Promise(r => setTimeout(r, 150));
    }

    // 保存本轮进度
    if (klt === 'daily') progress.dailyHits = hits;
    else progress.weeklyHits = hits;
    progress.idx = idx;
    progress.currentKlt = klt;

    // 如果当前 klt 扫描完成
    if (idx >= stocks.length) {
      await redis.set(KEY.screenResult(today, klt), hits, TTL.SCREEN_RESULT);

      if (klt === 'daily') {
        // 切到周线
        progress.currentKlt = 'weekly';
        progress.idx = 0;
        progress.weeklyHits = [];
      } else {
        // 全部完成
        progress.currentKlt = null;
        progress.idx = 0;
      }
    }

    await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);
    await redis.set(KEY.META, { lastDate: today, lastTime: new Date().toISOString() });

    return res.json({
      processed,
      total: stocks.length,
      idx,
      klt,
      hits: hits.length,
      elapsed: Date.now() - startTime,
      done: idx >= stocks.length,
    });
  } catch (err) {
    console.error('cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}
