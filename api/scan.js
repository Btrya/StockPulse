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
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  const body = req.body || {};
  const requestedKlt = body.klt || null; // null = 自动从进度继续

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    // 读取进度（与 cron 共享同一个 progress key）
    let progress = await redis.get(KEY.PROGRESS);

    // 是否需要重新开始
    const forceReset = body.reset === true;

    if (forceReset || !progress || progress.date !== today || !progress.stocks) {
      const stocks = (await getStockList()).filter(s => !s.name.includes('ST') && !s.name.includes('退'));
      progress = {
        date: today,
        stocks,
        idx: 0,
        currentKlt: requestedKlt || 'daily',
        dailyHits: [],
        weeklyHits: [],
      };
      await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);
    }

    const klt = progress.currentKlt || 'daily';
    let idx = progress.idx || 0;
    const hits = klt === 'daily' ? (progress.dailyHits || []) : (progress.weeklyHits || []);
    let processed = 0;

    // 读取概念映射表
    let conceptsMap = null;
    try { conceptsMap = await redis.get(KEY.CONCEPTS_MAP); } catch {}

    const { getDaily, getWeekly } = await import('./_lib/tushare.js');
    const fn = klt === 'weekly' ? getWeekly : getDaily;

    while (idx < progress.stocks.length) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const stock = progress.stocks[idx];
      try {
        const klines = await fn(stock.ts_code, start);
        const result = screenStock({ ...stock, klines });
        if (result) {
          result.concepts = conceptsMap?.[stock.ts_code] || [];
          hits.push(result);
        }
      } catch { /* skip */ }

      idx++;
      processed++;

      // 每 50 只保存一次进度 + 中间结果
      if (processed % 50 === 0) {
        if (klt === 'daily') progress.dailyHits = hits;
        else progress.weeklyHits = hits;
        progress.idx = idx;
        progress.currentKlt = klt;
        await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);
        // 中间结果也写到 screenResult，这样前端刷新能看到部分数据
        await redis.set(KEY.screenResult(today, klt), hits, TTL.SCREEN_RESULT);
      }

      await new Promise(r => setTimeout(r, 150));
    }

    // 保存本轮进度
    if (klt === 'daily') progress.dailyHits = hits;
    else progress.weeklyHits = hits;
    progress.idx = idx;
    progress.currentKlt = klt;

    const done = idx >= progress.stocks.length;

    if (done) {
      await redis.set(KEY.screenResult(today, klt), hits, TTL.SCREEN_RESULT);

      if (klt === 'daily') {
        progress.currentKlt = 'weekly';
        progress.idx = 0;
        progress.weeklyHits = [];
      } else {
        progress.currentKlt = null;
        progress.idx = 0;
      }
    }

    await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);
    await redis.set(KEY.META, { lastDate: today, lastTime: new Date().toISOString() });

    return res.json({
      processed,
      total: progress.stocks.length,
      idx,
      klt,
      hits: hits.length,
      elapsed: Date.now() - startTime,
      done,
      needContinue: !done,
    });
  } catch (err) {
    console.error('scan error:', err);
    return res.status(500).json({ error: err.message });
  }
}
