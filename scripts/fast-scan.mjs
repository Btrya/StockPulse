#!/usr/bin/env node
// 快速全量扫描：按交易日批量拉取全市场行情，本地计算指标后写入 Redis
// 用法: node --env-file=.env.local scripts/fast-scan.mjs [klt] [date] [days]
// 示例:
//   node --env-file=.env.local scripts/fast-scan.mjs                       # 日线，今天，默认 130 天
//   node --env-file=.env.local scripts/fast-scan.mjs daily 2026-02-13      # 指定日期
//   node --env-file=.env.local scripts/fast-scan.mjs daily 2026-02-13 200  # 首次建基线拉 200 天
//   node --env-file=.env.local scripts/fast-scan.mjs weekly
//
// days 参数：拉取多少个交易日的数据（最低 120，screenStock 需要 120+ 根 K 线）
//   - 首次运行建议 200，确保递归指标充分收敛
//   - 日常更新用默认 130 即可（120 根 + 10 根余量）
//
// 原理：
//   Tushare daily 接口传 trade_date（不传 ts_code）→ 一次返回全市场 ~5000 条
//   拉 130 个交易日 ≈ 130 次 API 调用 ≈ 40-50s（vs 原来逐股票 5000 次 ≈ 30 分钟）

import { screenStock } from '../api/_lib/screener.js';
import {
  getStockList, getTradingDates, getDailyByDate, getWeeklyByDate,
} from '../api/_lib/tushare.js';
import {
  KEY, TTL, getLastTradingDate, isWeekend, snapToFriday,
} from '../api/_lib/constants.js';

const DELAY_MS = 180; // 略大于 150，本地脚本不需要极限压榨

// ── Redis 直接调用（Upstash REST） ─────────────────────────
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCmd(...args) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.error) throw new Error(`Redis: ${data.error}`);
  return data.result;
}

async function redisGet(key) {
  const val = await redisCmd('GET', key);
  if (val == null) return null;
  try { return JSON.parse(val); } catch { return val; }
}

async function redisSet(key, value, ttl) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (ttl) return redisCmd('SET', key, str, 'EX', String(ttl));
  return redisCmd('SET', key, str);
}

// ── 工具 ───────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 主流程 ─────────────────────────────────────────────────
async function main() {
  const klt = process.argv[2] || 'daily';
  const targetDate = process.argv[3] || getLastTradingDate();
  const daysArg = parseInt(process.argv[4], 10);
  // 日线：130 个交易日 → 130 根日 K 线（120 + 余量）
  // 周线：130 个交易周 → 130 根周 K 线，需要 ~650 个交易日的日历范围
  const defaultBars = 130;
  const lookbackBars = Math.max(120, daysArg || defaultBars);

  if (!process.env.TUSHARE_TOKEN) { console.error('缺少 TUSHARE_TOKEN'); process.exit(1); }
  if (!REDIS_URL || !REDIS_TOKEN) { console.error('缺少 UPSTASH_REDIS_REST_URL / TOKEN'); process.exit(1); }

  console.log(`\n=== 快速扫描 ===`);
  console.log(`K线周期: ${klt}`);
  console.log(`目标日期: ${targetDate}`);
  console.log();

  const t0 = Date.now();

  // 1. 获取股票列表
  console.log('1. 获取股票列表...');
  const stocksRaw = await getStockList();
  const stocks = stocksRaw.filter(s => !s.name.includes('ST') && !s.name.includes('退'));
  const stockMap = new Map(stocks.map(s => [s.ts_code, s]));
  console.log(`  共 ${stocks.length} 只股票（已排除 ST/退市）`);

  // 2. 获取需要拉取的交易日列表
  console.log(`2. 获取最近 ${lookbackBars} 根${klt === 'weekly' ? '周' : '日'}K线对应的交易日...`);

  let tradingDates;
  if (klt === 'weekly') {
    const allDates = await getTradingDates(targetDate, lookbackBars * 5);
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
    tradingDates = await getTradingDates(targetDate, lookbackBars);
  }
  console.log(`  找到 ${tradingDates.length} 个交易${klt === 'weekly' ? '周' : '日'}`);
  console.log(`  范围: ${tradingDates[0]} ~ ${tradingDates[tradingDates.length - 1]}`);

  // 3. 按交易日批量拉取全市场行情
  console.log(`3. 逐日拉取全市场${klt === 'weekly' ? '周线' : '日线'}数据...`);
  const fetchFn = klt === 'weekly' ? getWeeklyByDate : getDailyByDate;

  // { ts_code → [kline, kline, ...] } 按时间正序
  const klineMap = new Map();

  let fetchedDays = 0;
  let totalRows = 0;
  for (const td of tradingDates) {
    let rows;
    try {
      rows = await fetchFn(td);
    } catch (err) {
      console.error(`  ⚠ ${td} 拉取失败: ${err.message}，跳过`);
      await sleep(DELAY_MS);
      continue;
    }

    for (const r of rows) {
      if (!klineMap.has(r.ts_code)) klineMap.set(r.ts_code, []);
      klineMap.get(r.ts_code).push(r);
    }

    fetchedDays++;
    totalRows += rows.length;

    if (fetchedDays % 20 === 0 || fetchedDays === tradingDates.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${fetchedDays}/${tradingDates.length} 天，累计 ${totalRows} 条，${elapsed}s`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`  拉取完成：${fetchedDays} 天，${totalRows} 条，${klineMap.size} 只股票`);

  // 4. 本地计算指标
  console.log('4. 计算指标...');
  let conceptsMap = null;
  try { conceptsMap = await redisGet(KEY.CONCEPTS_MAP); } catch {}

  const hits = [];
  let skipped = 0;
  for (const [tsCode, klines] of klineMap) {
    const stock = stockMap.get(tsCode);
    if (!stock) { skipped++; continue; }

    // klines 已经按 trade_date 正序（因为 tradingDates 是升序的）
    const result = screenStock({
      ...stock,
      klines: klines.map(k => ({
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        vol: k.vol,
      })),
    }, { noFilter: true });

    if (result) {
      result.concepts = conceptsMap?.[tsCode] || [];
      hits.push(result);
    }
  }

  console.log(`  命中 ${hits.length} 只，跳过 ${skipped} 只（非活跃/ST）`);

  // 5. 写入 Redis
  console.log('5. 写入 Redis...');
  const storeDate = klt === 'weekly' ? snapToFriday(targetDate) : targetDate;
  const screenTTL = klt === 'daily' ? TTL.SCREEN_RESULT_DAILY : TTL.SCREEN_RESULT_WEEKLY;

  await redisSet(KEY.screenResult(storeDate, klt), hits, screenTTL);
  console.log(`  screen:${storeDate}:${klt} → ${hits.length} 条`);

  // 更新 scan:dates
  if (!isWeekend(targetDate)) {
    const maxLen = klt === 'daily' ? 10 : 8;
    const dates = (await redisGet(KEY.scanDates(klt))) || [];
    const filtered = dates.filter(d => d !== storeDate);
    filtered.unshift(storeDate);
    if (filtered.length > maxLen) filtered.length = maxLen;
    await redisSet(KEY.scanDates(klt), filtered, screenTTL);
    console.log(`  scan:dates:${klt} → [${filtered.join(', ')}]`);
  }

  // 更新 stocks:list 和 scan:meta
  await redisSet(KEY.STOCKS, stocks, TTL.STOCKS);
  await redisSet(KEY.META, { lastDate: targetDate, lastTime: new Date().toISOString() });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== 完成 ===`);
  console.log(`总耗时: ${elapsed}s`);
  console.log(`命中: ${hits.length} / ${klineMap.size} 只\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
