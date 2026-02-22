import { getStockList } from './_lib/tushare.js';
import { screenStock } from './_lib/screener.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL, getCNDate, isMarketClosed, isWeekend, getLastTradingDate, snapToFriday } from './_lib/constants.js';

const TIMEOUT_MS = 50000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    // 取消扫描
    if (body.cancel) {
      await redis.del(KEY.PROGRESS);
      return res.json({ cancelled: true });
    }

    // 收盘前不允许手动触发新扫描（续扫进行中的除外；周末市场已收盘，放行）
    const now = new Date();
    const cnToday = getCNDate(now);
    if (!isMarketClosed(now) && !isWeekend(cnToday)) {
      const progress = await redis.get(KEY.PROGRESS);
      if (!progress || progress.currentKlt === null) {
        return res.json({ error: '市场尚未收盘，请在 15:00 后扫描', blocked: true });
      }
    }

    const startTime = Date.now();
    const today = getLastTradingDate(now);
    const requestedKlt = body.klt || null;

    // 读取进度（与 cron 共享同一个 progress key）
    let progress = await redis.get(KEY.PROGRESS);

    const forceReset = body.reset === true;

    if (forceReset || !progress || progress.date !== today || !progress.stocks) {
      // 全新扫描
      const stocks = (await getStockList()).filter(s => !s.name.includes('ST') && !s.name.includes('退'));
      // 写入 stocks:list 供查询 tab 使用
      await redis.set(KEY.STOCKS, stocks, TTL.STOCKS);
      progress = {
        date: today,
        stocks,
        idx: 0,
        currentKlt: requestedKlt || 'daily',
        singleKlt: !!requestedKlt,
        dailyHits: [],
        weeklyHits: [],
        startedAt: new Date().toISOString(),
      };
      await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);
    } else if (requestedKlt && progress.currentKlt !== requestedKlt) {
      // 用户指定了不同的 klt，切换过去（保留已完成的另一个 klt 数据）
      progress.currentKlt = requestedKlt;
      progress.singleKlt = true;
      progress.idx = 0;
      progress.startedAt = new Date().toISOString();
      if (requestedKlt === 'daily') progress.dailyHits = [];
      else progress.weeklyHits = [];
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

    const { getDaily, getWeekly } = await import('./_lib/tushare.js');
    const fn = klt === 'weekly' ? getWeekly : getDaily;

    while (idx < progress.stocks.length) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const stock = progress.stocks[idx];
      try {
        const klines = await fn(stock.ts_code, start);
        const result = screenStock({ ...stock, klines }, { noFilter: true });
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
        const screenTTL = klt === 'daily' ? TTL.SCREEN_RESULT_DAILY : TTL.SCREEN_RESULT_WEEKLY;
        const midDate = klt === 'weekly' ? snapToFriday(today) : today;
        await redis.set(KEY.screenResult(midDate, klt), hits, screenTTL);
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
      const screenTTL = klt === 'daily' ? TTL.SCREEN_RESULT_DAILY : TTL.SCREEN_RESULT_WEEKLY;
      // 周线结果以该周周五日期为 key，日线用当天日期
      const storeDate = klt === 'weekly' ? snapToFriday(today) : today;
      await redis.set(KEY.screenResult(storeDate, klt), hits, screenTTL);

      // 追加日期到 scan:dates（跳过周末，避免污染追踪数据）
      if (!isWeekend(today)) {
        const maxLen = klt === 'daily' ? 10 : 8;
        const dates = (await redis.get(KEY.scanDates(klt))) || [];
        // 周线用周五日期，日线用当天；周线同一周覆盖（先移除旧条目再插入）
        const dateKey = storeDate;
        const filtered = dates.filter(d => d !== dateKey);
        filtered.unshift(dateKey);
        if (filtered.length > maxLen) filtered.length = maxLen;
        await redis.set(KEY.scanDates(klt), filtered, screenTTL);
      }

      if (klt === 'daily' && !progress.singleKlt) {
        // 非单 klt 模式：自动切到周线
        progress.currentKlt = 'weekly';
        progress.idx = 0;
        progress.weeklyHits = [];
      } else {
        // 单 klt 模式或周线已完成：结束
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
