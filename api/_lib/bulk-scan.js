// 批量扫描核心：按日期拉全市场行情，两阶段 self-call chain
// Phase fetch: 逐日期拉数据存 Redis 临时 key
// Phase compute: 读回临时 key → 按 ts_code 分组 → screenStock → 写结果
//
// 调用方：
//   scan/cron  → progressKey = KEY.BULK_PROGRESS
//   backtest   → progressKey = KEY.BACKTEST_PROGRESS, skipScanDates = true
import { getStockList, getTradingDates, getDailyByDate, getWeeklyByDate } from './tushare.js';
import { screenStock } from './screener.js';
import * as redis from './redis.js';
import { KEY, TTL, TUSHARE_DELAY_MS, isWeekend, snapToFriday } from './constants.js';

const TIMEOUT_MS = 45000; // 留 5s 余量给 Vercel 50s 限制
const BULK_TTL = 3600;    // 临时 key 1h 过期（兜底清理）
const PARALLEL = 10;      // Redis 并行读/删批次大小

// 并行批量执行，每批 size 个
async function parallel(items, fn, size = PARALLEL) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export async function bulkScan({
  klt: inputKlt,
  today,
  startTime,
  singleKlt,
  forceReset,
  progressKey = KEY.BULK_PROGRESS,  // backtest 传 KEY.BACKTEST_PROGRESS
  skipScanDates = false,            // backtest 不更新 scan:dates
} = {}) {
  // 读取进度
  let progress = await redis.get(progressKey);

  // stale 检测（仅 scan 模式：盘中开始的进度在收盘后应重置）
  if (progress && progress.date === today && !forceReset && progressKey === KEY.BULK_PROGRESS) {
    const now = new Date();
    const closeToday = new Date(today + 'T07:00:00Z'); // 15:00 CST
    if (progress.startedAt && now >= closeToday && new Date(progress.startedAt) < closeToday) {
      forceReset = true;
    }
  }

  if (forceReset || !progress || progress.date !== today) {
    // 获取股票列表
    const stocks = (await getStockList()).filter(s => !s.name.includes('ST') && !s.name.includes('退'));
    await redis.set(KEY.STOCKS, stocks, TTL.STOCKS);

    progress = {
      date: today,
      klt: inputKlt || 'daily',
      singleKlt: !!singleKlt,
      phase: 'fetch',
      dateIdx: 0,
      tradingDates: null, // 延迟初始化
      startedAt: new Date().toISOString(),
    };
    await redis.set(progressKey, progress, TTL.PROGRESS);
  }

  const klt = progress.klt || 'daily';
  const lookbackBars = 130;

  // 延迟初始化交易日列表
  if (!progress.tradingDates) {
    let tradingDates;
    if (klt === 'weekly') {
      // 周线需要 ~650 个交易日来覆盖 130 周
      const allDates = await getTradingDates(today, lookbackBars * 5);
      const weekMap = new Map();
      for (const d of allDates) {
        const dt = new Date(d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8));
        const year = dt.getFullYear();
        const jan1 = new Date(year, 0, 1);
        const week = Math.ceil(((dt - jan1) / 86400000 + jan1.getDay() + 1) / 7);
        const key = `${year}-W${week}`;
        weekMap.set(key, d);
      }
      tradingDates = [...weekMap.values()].sort().slice(-lookbackBars);
    } else {
      tradingDates = await getTradingDates(today, lookbackBars);
    }
    progress.tradingDates = tradingDates;
    await redis.set(progressKey, progress, TTL.PROGRESS);
  }

  const tradingDates = progress.tradingDates;
  const totalDates = tradingDates.length;

  // 临时 key 加 progressKey 前缀区分 scan/backtest，避免并行时互踩
  const tempKey = (td) => progressKey === KEY.BULK_PROGRESS
    ? KEY.bulkDate(klt, td)
    : `bt:${klt}:${td}`;

  // ── Phase fetch ──────────────────────────────────────
  if (progress.phase === 'fetch') {
    let dateIdx = progress.dateIdx || 0;
    const fetchFn = klt === 'weekly' ? getWeeklyByDate : getDailyByDate;

    while (dateIdx < totalDates) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const td = tradingDates[dateIdx];
      try {
        const rows = await fetchFn(td);
        await redis.set(tempKey(td), rows, BULK_TTL);
      } catch {
        // 单日失败跳过
      }

      dateIdx++;
      await new Promise(r => setTimeout(r, TUSHARE_DELAY_MS));
    }

    progress.dateIdx = dateIdx;

    if (dateIdx >= totalDates) {
      progress.phase = 'compute';
    }

    await redis.set(progressKey, progress, TTL.PROGRESS);

    // fetch 刚结束或未结束 → 都交给下一次 self-call 处理 compute
    // 这样 compute 能拿到完整的 45s 时间窗口
    return { done: false, klt, phase: progress.phase, dateIdx, totalDates, elapsed: Date.now() - startTime };
  }

  // ── Phase compute ────────────────────────────────────
  // 并行批量读回所有临时 key → 按 ts_code 分组
  const klineMap = new Map();
  for (let i = 0; i < totalDates; i += PARALLEL) {
    const batch = tradingDates.slice(i, i + PARALLEL);
    const results = await Promise.all(batch.map(td => redis.get(tempKey(td))));
    for (const rows of results) {
      if (!rows) continue;
      for (const r of rows) {
        if (!klineMap.has(r.ts_code)) klineMap.set(r.ts_code, []);
        klineMap.get(r.ts_code).push(r);
      }
    }
  }

  // 获取股票基础信息和概念映射
  const stockList = await redis.get(KEY.STOCKS) || [];
  const stockMap = new Map(stockList.map(s => [s.ts_code, s]));
  let conceptsMap = null;
  try { conceptsMap = await redis.get(KEY.CONCEPTS_MAP); } catch {}

  // 计算指标
  const hits = [];
  for (const [tsCode, klines] of klineMap) {
    const stock = stockMap.get(tsCode);
    if (!stock) continue;

    const result = screenStock({
      ...stock,
      klines: klines.map(k => ({
        open: k.open, high: k.high, low: k.low, close: k.close, vol: k.vol,
      })),
    }, { noFilter: true });

    if (result) {
      result.concepts = conceptsMap?.[tsCode] || [];
      hits.push(result);
    }
  }

  // 写入结果
  const screenTTL = klt === 'daily' ? TTL.SCREEN_RESULT_DAILY : TTL.SCREEN_RESULT_WEEKLY;
  const storeDate = klt === 'weekly' ? snapToFriday(today) : today;
  await redis.set(KEY.screenResult(storeDate, klt), hits, screenTTL);

  // 更新 scan:dates（backtest 跳过）
  if (!skipScanDates && !isWeekend(today)) {
    const maxLen = klt === 'daily' ? 10 : 8;
    const dates = (await redis.get(KEY.scanDates(klt))) || [];
    const filtered = dates.filter(d => d !== storeDate);
    filtered.unshift(storeDate);
    if (filtered.length > maxLen) filtered.length = maxLen;
    await redis.set(KEY.scanDates(klt), filtered, screenTTL);
  }

  await redis.set(KEY.META, { lastDate: today, lastTime: new Date().toISOString() });

  // 并行批量清理临时 key
  await parallel(tradingDates, td => redis.del(tempKey(td)));

  // 处理 daily→weekly 自动切换（仅 scan 模式）
  if (!singleKlt && klt === 'daily' && progressKey === KEY.BULK_PROGRESS) {
    progress.klt = 'weekly';
    progress.phase = 'fetch';
    progress.dateIdx = 0;
    progress.tradingDates = null; // 重新获取周线交易日
    await redis.set(progressKey, progress, TTL.PROGRESS);
    return { done: false, klt: 'daily', phase: 'done', nextKlt: 'weekly', hits: hits.length, elapsed: Date.now() - startTime };
  }

  // 全部完成 — scan 模式清理进度；backtest 模式由调用方管理（有队列逻辑）
  if (progressKey === KEY.BULK_PROGRESS) {
    await redis.del(progressKey);
  }

  return { done: true, klt, phase: 'done', totalDates, hits: hits.length, elapsed: Date.now() - startTime };
}
