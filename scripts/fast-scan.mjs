#!/usr/bin/env node
// 快速全量扫描：按交易日批量拉取全市场行情，本地计算指标后写入 Redis
// 用法: node --env-file=.env.local scripts/fast-scan.mjs [klt] [date] [days]
// 示例:
//   node --env-file=.env.local scripts/fast-scan.mjs                       # 日线，今天，默认 180 天
//   node --env-file=.env.local scripts/fast-scan.mjs daily 2026-02-13      # 指定日期
//   node --env-file=.env.local scripts/fast-scan.mjs daily 2026-02-13 250  # 首次建基线拉 250 天
//   node --env-file=.env.local scripts/fast-scan.mjs weekly
//
// days 参数：拉取多少个交易日的数据（最低 120，screenStock 需要 120+ 根 K 线）
//   - 默认 180：覆盖筛选指标 120 根 + 后验分析量价窗口 30 天 + 余量
//   - 首次运行建议 250，确保递归指标充分收敛
//
// 原理：
//   Tushare daily 接口传 trade_date（不传 ts_code）→ 一次返回全市场 ~5000 条
//   拉 180 个交易日 ≈ 180 次 API 调用 ≈ 50-60s
//   然后对每个有效交易日（120+根K线）逐日在内存中回测，写入 screen:* + kl:* 缓存
//   有效回测日期 = days - 120，默认 180 - 120 = 60 个交易日 ≈ 3 个月

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
  // 日线：180 个交易日 → 180 根日 K 线（120 指标 + 30 量价 + 余量）
  // 周线：180 个交易周 → 180 根周 K 线
  const defaultBars = 180;
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

  // 4. 逐日回测：对每个有效交易日（120+ 根历史K线）计算筛选结果
  const minBars = 120;
  const validDates = tradingDates.slice(minBars - 1);
  console.log(`4. 逐日回测（${validDates.length} 个有效交易日，每日需 ${minBars}+ 根K线）...`);

  let conceptsMap = null;
  try { conceptsMap = await redisGet(KEY.CONCEPTS_MAP); } catch {}

  const screenTTL = klt === 'daily' ? TTL.SCREEN_RESULT_DAILY : TTL.SCREEN_RESULT_WEEKLY;
  const screenDateSet = new Set();
  const screenDates = []; // YYYY-MM-DD，按时间升序
  let lastHitCount = 0;

  for (let vi = 0; vi < validDates.length; vi++) {
    const td = validDates[vi];
    const dateStr = td.slice(0, 4) + '-' + td.slice(4, 6) + '-' + td.slice(6, 8);
    const storeDate = klt === 'weekly' ? snapToFriday(dateStr) : dateStr;

    // 周线去重：同一个周五只算一次
    if (screenDateSet.has(storeDate)) continue;

    const hits = [];
    for (const [tsCode, allBars] of klineMap) {
      const stock = stockMap.get(tsCode);
      if (!stock) continue;

      // 找到 <= td 的最后一根 bar 的位置
      let cutoff = allBars.length - 1;
      while (cutoff >= 0 && allBars[cutoff].trade_date > td) cutoff--;
      if (cutoff < minBars - 1) continue;

      const result = screenStock({
        ...stock,
        klines: allBars.slice(0, cutoff + 1).map(k => ({
          open: k.open, high: k.high, low: k.low, close: k.close, vol: k.vol,
        })),
      }, { noFilter: true });

      if (result) {
        result.concepts = conceptsMap?.[tsCode] || [];
        hits.push(result);
      }
    }

    await redisSet(KEY.screenResult(storeDate, klt), hits, screenTTL);
    screenDateSet.add(storeDate);
    screenDates.push(storeDate);
    lastHitCount = hits.length;

    if (screenDates.length % 5 === 0 || vi === validDates.length - 1) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${screenDates.length}/${validDates.length}，${storeDate} 命中 ${hits.length} 只，${elapsed}s`);
    }
  }

  console.log(`  回测完成：${screenDates.length} 个交易日写入 Redis`);

  // 5. 更新 scan:dates / stocks:list / scan:meta
  console.log('5. 更新元数据...');
  const allDatesDesc = [...screenDates].reverse(); // newest first
  await redisSet(KEY.scanDates(klt), allDatesDesc, screenTTL);
  console.log(`  scan:dates:${klt} → ${allDatesDesc.length} 个日期`);

  await redisSet(KEY.STOCKS, stocks, TTL.STOCKS);
  await redisSet(KEY.META, { lastDate: targetDate, lastTime: new Date().toISOString() });

  // 6. 写入 kl:{tsCode}:{klt} K线缓存（后验分析用，含 vol）
  console.log('6. 写入 K线缓存到 Redis（后验分析用）...');
  let klWritten = 0;
  const klEntries = [...klineMap.entries()];
  for (let i = 0; i < klEntries.length; i++) {
    const [tsCode, klines] = klEntries[i];
    // klines 已按 trade_date 升序，每根含 ts_code/trade_date/open/high/low/close/vol
    try {
      await redisSet(KEY.kline(tsCode, klt), klines, TTL.KLINE);
      klWritten++;
    } catch (err) {
      if (i < 3) console.error(`  ⚠ ${tsCode} 写入失败: ${err.message}`);
    }
    // 每 500 只打印一次进度
    if ((i + 1) % 500 === 0 || i === klEntries.length - 1) {
      console.log(`  K线缓存: ${i + 1}/${klEntries.length} (写入 ${klWritten})`);
    }
  }
  console.log(`  K线缓存写入完成: ${klWritten} 只股票`);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== 完成 ===`);
  console.log(`总耗时: ${elapsed}s`);
  console.log(`回测: ${screenDates.length} 个交易日，最新日 ${screenDates[screenDates.length - 1] || '-'} 命中 ${lastHitCount} 只`);
  console.log(`K线缓存: ${klWritten} / ${klineMap.size} 只\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
