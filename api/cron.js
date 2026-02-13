import { getStockList, batchGetKlines } from './_lib/tushare.js';
import { screenStock } from './_lib/screener.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL, getCNDate } from './_lib/constants.js';

const TIMEOUT_MS = 50000;

export default async function handler(req, res) {
  // 验证 CRON_SECRET
  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  const today = getCNDate();

  try {
    if (!redis.isConfigured()) {
      return res.json({ message: 'Redis not configured, skipping' });
    }

    // 读取进度（支持断点续扫）
    let progress = await redis.get(KEY.PROGRESS);

    // 获取股票列表
    let stocks;
    if (progress && progress.date === today && progress.stocks) {
      // 检查是否需要收盘后重新扫描：如果已有数据是盘中扫的，收盘后 cron 应该重新来
      const now = new Date();
      const closeToday = new Date(today + 'T07:00:00Z'); // 15:00 CST = 07:00 UTC
      const stale = progress.startedAt && now >= closeToday && new Date(progress.startedAt) < closeToday;
      if (stale) {
        stocks = await getStockList();
        stocks = stocks.filter(s => !s.name.includes('ST') && !s.name.includes('退'));
        await redis.set(KEY.STOCKS, stocks, TTL.STOCKS);
        progress = { date: today, stocks, idx: 0, dailyHits: [], weeklyHits: [], startedAt: now.toISOString() };
        await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);
      } else {
        stocks = progress.stocks;
      }
    } else {
      stocks = await getStockList();
      // 过滤 ST 和 退市
      stocks = stocks.filter(s => !s.name.includes('ST') && !s.name.includes('退'));
      // 写入 stocks:list 供查询 tab 使用
      await redis.set(KEY.STOCKS, stocks, TTL.STOCKS);
      progress = { date: today, stocks, idx: 0, dailyHits: [], weeklyHits: [], startedAt: new Date().toISOString() };
      await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);
    }

    const klt = progress.currentKlt || 'daily';
    let idx = progress.idx || 0;
    const hits = klt === 'daily' ? (progress.dailyHits || []) : (progress.weeklyHits || []);
    let processed = 0;

    // 周线需要更长回溯期：120 根周 K 线 ≈ 840 天，取 900 天
    const lookbackDays = klt === 'weekly' ? 900 : 200;
    const start = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10).replace(/-/g, '');

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
      const screenTTL = klt === 'daily' ? TTL.SCREEN_RESULT_DAILY : TTL.SCREEN_RESULT_WEEKLY;
      await redis.set(KEY.screenResult(today, klt), hits, screenTTL);

      // 追加日期到 scan:dates
      const maxLen = klt === 'daily' ? 10 : 8;
      const dates = (await redis.get(KEY.scanDates(klt))) || [];
      if (dates[0] !== today) dates.unshift(today);
      if (dates.length > maxLen) dates.length = maxLen;
      await redis.set(KEY.scanDates(klt), dates, screenTTL);

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
