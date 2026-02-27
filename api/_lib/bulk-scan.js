// 批量扫描核心：按日期拉全市场行情，两阶段 self-call chain
// Phase fetch: 逐日期拉数据存 Redis 临时 key
// Phase compute: 读回临时 key → 按 ts_code 分组 → screenStock → 写结果
//
// 调用方：
//   scan/cron  → progressKey = KEY.BULK_PROGRESS
//   backtest   → progressKey = KEY.BACKTEST_PROGRESS, skipScanDates = true
import { getStockList, getTradingDates, getWeeklyTradeDates, getDailyByDate, getWeeklyByDate } from './tushare.js';
import { screenStock } from './screener.js';
import * as redis from './redis.js';
import { KEY, TTL, TUSHARE_DELAY_MS, isWeekend, snapToFriday } from './constants.js';

const TIMEOUT_MS = 45000; // 留 5s 余量给 Vercel 50s 限制
const BULK_TTL = 3600;    // 临时 key 1h 过期（兜底清理）
const PARALLEL = 10;      // Redis 并行读/删批次大小
const LOG_KEY = 'bulk:log'; // 持久日志 key，Redis 里可以随时查看

// 并行批量执行，每批 size 个
async function parallel(items, fn, size = PARALLEL) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// 日志写入 console + Redis（追加，最多保留 50 条，TTL 24h）
async function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    const logs = (await redis.get(LOG_KEY)) || [];
    logs.push(line);
    if (logs.length > 50) logs.splice(0, logs.length - 50);
    await redis.set(LOG_KEY, logs, 86400);
  } catch {}
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
  await log(`[bulk] init | today=${today} klt=${inputKlt || 'auto'} existing_progress=${progress ? `date=${progress.date},phase=${progress.phase},klt=${progress.klt}` : 'null'} forceReset=${!!forceReset}`);

  // stale 检测（仅 scan 模式：盘中开始的进度在收盘后应重置）
  if (progress && progress.date === today && !forceReset && progressKey === KEY.BULK_PROGRESS) {
    const now = new Date();
    const closeToday = new Date(today + 'T07:00:00Z'); // 15:00 CST
    if (progress.startedAt && now >= closeToday && new Date(progress.startedAt) < closeToday) {
      forceReset = true;
    }
  }

  if (forceReset || !progress || progress.date !== today) {
    await log(`[bulk] reset progress | reason=${forceReset ? 'forceReset' : !progress ? 'no_progress' : `date_mismatch(${progress.date}!=${today})`}`);
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
      // 直接用 stk_weekly_monthly 接口获取真实的周线 trade_date
      // 该接口 trade_date 全部为周五，不能用 trade_cal 推算
      tradingDates = await getWeeklyTradeDates(today, lookbackBars);
    } else {
      tradingDates = await getTradingDates(today, lookbackBars);
    }
    // 检查 tushare 行情数据是否已就绪
    // 始终用日线 probe：周线 tushare 可能要周六才出，但日线收盘后就有
    if (progressKey === KEY.BULK_PROGRESS) {
      const todayFmt = today.replace(/-/g, '');
      const probe = await getDailyByDate(todayFmt);
      await log(`[bulk] probe | klt=${klt} todayFmt=${todayFmt} probe_rows=${probe?.length || 0} last5dates=${tradingDates.slice(-5).join(',')}`);
      if (!probe || probe.length < 100) {
        await log(`[bulk] WAITING — daily data not ready | rows=${probe?.length || 0}`);
        return { done: false, klt, phase: 'waiting', reason: `daily probe ${todayFmt}=${probe?.length || 0} rows`, elapsed: Date.now() - startTime };
      }
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
        // 记录最后 3 个日期的实际数据情况
        if (dateIdx >= totalDates - 3) {
          const sample = rows?.length ? rows.find(r => r.ts_code === '300155.SZ') : null;
          await log(`[bulk] fetch | klt=${klt} td=${td} rows=${rows?.length || 0} sample_300155=${sample ? JSON.stringify({ close: sample.close, trade_date: sample.trade_date }) : 'null'}`);
        }
      } catch {
        // 单日失败跳过
        await log(`[bulk] fetch FAIL | klt=${klt} td=${td}`);
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
  // 探测临时 key 是否还存在：被另一个并发实例清理后应跳过
  const probeKey = tempKey(tradingDates[0]);
  const probeExists = await redis.get(probeKey);
  if (!probeExists) {
    await log(`[bulk] SKIP compute — temp key ${probeKey} already cleaned by another instance`);
    return { done: true, klt, phase: 'skip', reason: 'temp_keys_cleaned', elapsed: Date.now() - startTime };
  }

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
  await log(`[bulk] compute done | klt=${klt} storeDate=${storeDate} hits=${hits.length} stocks_in_klineMap=${klineMap.size} tradingDates_range=${tradingDates[0]}..${tradingDates[tradingDates.length - 1]}`);

  // 防止并发 compute 覆盖有效数据：临时 key 被另一个实例清理后
  // compute 会产出 hits=0 的空结果，此时跳过写入避免覆盖
  if (hits.length === 0 && klineMap.size > 0) {
    await log(`[bulk] SKIP write — hits=0 but ${klineMap.size} stocks in klineMap, likely stale compute (temp keys already cleaned by another instance)`);
  } else {
    await redis.set(KEY.screenResult(storeDate, klt), hits, screenTTL);
  }

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
