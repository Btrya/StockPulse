#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
// brickReversal 策略回测 v3 — 贴合实际 T+1 操作
// ══════════════════════════════════════════════════════════════════
//
// 操作规则：
//   Day 0 收盘：筛选 brickReversal 信号
//   Day 1 开盘：高开 > 3% → 放弃；否则买入
//   Day 1 收盘：浮盈 > 5% → 继续持有（最多持到 Day 4 收盘）
//   Day 1 收盘：浮盈 ≤ 5% → Day 2 开盘卖（≈9:33 前走人）
//   持有期间每日收盘检查，浮盈跌回 ≤ 5% 则次日开盘卖
//
// 用法:
//   node --env-file=.env.local scripts/backtest-brick.mjs [startDate] [endDate] [days]

import { screenStock, STRATEGIES } from '../api/_lib/screener.js';
import { getStockList, getTradingDates, getDailyByDate } from '../api/_lib/tushare.js';
import { getLastTradingDate } from '../api/_lib/constants.js';

const DELAY_MS = 180;
const GAP_UP_LIMIT = 3;     // 高开超过 3% 不买
const HOLD_THRESHOLD = 5;   // 浮盈 > 5% 才继续持有
const MAX_HOLD_DAYS = 4;    // 最长持仓天数

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function pct(a, b) { return (a - b) / b * 100; }
function round2(n) { return Math.round(n * 100) / 100; }
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

async function main() {
  const startDate = process.argv[2] || '2025-06-01';
  const endDate = process.argv[3] || getLastTradingDate();
  const daysArg = parseInt(process.argv[4], 10);
  const lookback = Math.max(130, daysArg || 150);

  if (!process.env.TUSHARE_TOKEN) { console.error('缺少 TUSHARE_TOKEN'); process.exit(1); }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  brickReversal T+1 回测 v3');
  console.log('══════════════════════════════════════════════════');
  console.log(`回测区间: ${startDate} ~ ${endDate}`);
  console.log(`规则: 高开>${GAP_UP_LIMIT}%不买, 浮盈>${HOLD_THRESHOLD}%持有(最多${MAX_HOLD_DAYS}天), 否则次日开盘卖`);
  console.log();

  const t0 = Date.now();

  // ── 1~4 数据准备（同 v2） ─────────────────────────────────
  console.log('1. 获取股票列表...');
  const stocksRaw = await getStockList();
  const stocks = stocksRaw.filter(s => !s.name.includes('ST') && !s.name.includes('退'));
  const stockMap = new Map(stocks.map(s => [s.ts_code, s]));
  console.log(`   ${stocks.length} 只`);

  console.log('2. 获取交易日序列...');
  const allTD = await getTradingDates(endDate, lookback + 250);

  const startYmd = startDate.replace(/-/g, '');
  const endYmd = endDate.replace(/-/g, '');
  const scanStartIdx = allTD.findIndex(d => d >= startYmd);
  if (scanStartIdx < 0) { console.error('startDate 超出范围'); process.exit(1); }
  const dataDates = allTD.slice(Math.max(0, scanStartIdx - lookback));
  const scanDates = allTD.filter(d => d >= startYmd && d <= endYmd);
  console.log(`   数据: ${dataDates[0]}~${dataDates[dataDates.length - 1]} (${dataDates.length}天), 扫描: ${scanDates.length}天`);

  console.log('3. 拉取日线...');
  const klineMap = new Map();
  let fetched = 0, totalRows = 0;
  for (const td of dataDates) {
    try {
      const rows = await getDailyByDate(td);
      for (const r of rows) {
        if (!klineMap.has(r.ts_code)) klineMap.set(r.ts_code, []);
        klineMap.get(r.ts_code).push(r);
      }
      fetched++; totalRows += rows.length;
      if (fetched % 30 === 0 || fetched === dataDates.length) {
        console.log(`   ${fetched}/${dataDates.length}天, ${totalRows}条, ${((Date.now()-t0)/1000).toFixed(1)}s`);
      }
    } catch (err) {
      console.error(`   ⚠ ${td}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`   完成: ${klineMap.size} 只`);

  console.log('4. 建索引...');
  const dateIdx = new Map();
  for (const [tc, kl] of klineMap) {
    const m = new Map();
    kl.forEach((k, i) => m.set(k.trade_date, i));
    dateIdx.set(tc, m);
  }
  const tdSeq = new Map();
  allTD.forEach((d, i) => tdSeq.set(d, i));
  const nextTD = (td, off = 1) => { const i = tdSeq.get(td); return i != null ? allTD[i + off] || null : null; };

  // ── 5. 扫描 + 模拟 ────────────────────────────────────────
  console.log('5. 扫描信号...\n');
  const trades = [];
  let sigCnt = 0, skippedGap = 0;

  for (let si = 0; si < scanDates.length; si++) {
    const sigDate = scanDates[si]; // Day 0

    for (const [tsCode, klines] of klineMap) {
      const stock = stockMap.get(tsCode);
      if (!stock) continue;
      const di = dateIdx.get(tsCode);
      const sigKi = di.get(sigDate);
      if (sigKi == null) continue;

      const sliced = klines.slice(0, sigKi + 1);
      if (sliced.length < 120) continue;

      const result = screenStock({
        ...stock,
        klines: sliced.map(k => ({ open: k.open, high: k.high, low: k.low, close: k.close, vol: k.vol })),
      }, { noFilter: true });
      if (!result) continue;
      if (!STRATEGIES.brickReversal.test(result)) continue;
      sigCnt++;

      // Day 0 收盘价
      const day0Close = sliced[sliced.length - 1].close;

      // 获取未来 K 线
      const futureK = [];
      for (let d = 1; d <= MAX_HOLD_DAYS + 1; d++) {
        const td = nextTD(sigDate, d);
        if (!td) break;
        const ki = di.get(td);
        if (ki == null) break;
        futureK.push(klines[ki]);
      }
      if (futureK.length < 2) continue;

      // Day 1 开盘价
      const buyOpen = futureK[0].open;
      if (!buyOpen || buyOpen <= 0) continue;

      // 高开幅度
      const gapUp = pct(buyOpen, day0Close);

      // 高开 > 3% 放弃
      if (gapUp > GAP_UP_LIMIT) { skippedGap++; continue; }

      const buyPrice = buyOpen;

      // 模拟持仓
      let sellPrice = null, sellDay = 0, sellType = '';
      for (let hd = 0; hd < Math.min(MAX_HOLD_DAYS, futureK.length); hd++) {
        const fk = futureK[hd];
        const floatPnl = pct(fk.close, buyPrice);

        if (hd === MAX_HOLD_DAYS - 1 || hd === futureK.length - 1) {
          // 最后一天或数据不足，收盘卖
          sellPrice = fk.close; sellDay = hd + 1; sellType = 'max_hold'; break;
        }
        if (floatPnl <= HOLD_THRESHOLD) {
          // 浮盈不足，次日开盘卖（≈9:33 走人）
          if (hd + 1 < futureK.length) {
            sellPrice = futureK[hd + 1].open; sellDay = hd + 2; sellType = 'next_open';
          } else {
            sellPrice = fk.close; sellDay = hd + 1; sellType = 'next_open';
          }
          break;
        }
        // 浮盈 > 5%，继续持有
      }
      if (!sellPrice) continue;

      const ret = pct(sellPrice, buyPrice);

      // Day1 日内涨幅（收盘 vs 开盘）
      const day1Intraday = pct(futureK[0].close, futureK[0].open);

      trades.push({
        sigDate, tsCode, code: result.code, name: result.name,
        industry: result.industry, board: result.board,
        buyPrice: round2(buyPrice), sellPrice: round2(sellPrice),
        sellDay, sellType, ret: round2(ret),
        gapUp: round2(gapUp),
        day1Intraday: round2(day1Intraday),
        // 因子
        brick: result.brick, brickPrev: result.brickPrev, brickPrev2: result.brickPrev2,
        j: result.j, k: result.k,
        shortTrend: result.shortTrend, bullBear: result.bullBear, close: result.close,
        deviationShort: result.deviationShort, deviationBull: result.deviationBull,
        shortAboveBull: result.shortTrend > result.bullBear,
        priceAboveShort: result.close > result.shortTrend,
        priceAboveBull: result.close > result.bullBear,
        sigDayChg: sliced.length >= 2
          ? round2(pct(sliced[sliced.length - 1].close, sliced[sliced.length - 2].close)) : null,
        volRatio: sliced.length >= 6
          ? round2(sliced[sliced.length - 1].vol / (sliced.slice(-6, -1).reduce((s, k) => s + k.vol, 0) / 5)) : null,
        // 红砖 vs 绿砖
        redGtGreen: result.brick > result.brickPrev2,
        // nearLine: 偏离短期线或多空线在 ±2% 以内
        nearLine: Math.abs(result.deviationShort) <= 2 || Math.abs(result.deviationBull) <= 2,
        nearLine5: Math.abs(result.deviationShort) <= 5 || Math.abs(result.deviationBull) <= 5,
        // 影线
        upperShadow: result.upperShadow,
        lowerShadow: result.lowerShadow,
        body: result.body,
        upperLeBody: result.body > 0 ? result.upperShadow <= result.body : false,
      });
    }

    if ((si + 1) % 10 === 0 || si === scanDates.length - 1) {
      console.log(`   ${si + 1}/${scanDates.length}天, 信号${sigCnt}, 跳过高开${skippedGap}, 交易${trades.length}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  输出
  // ══════════════════════════════════════════════════════════════

  const HR = '─'.repeat(94);

  console.log('\n══════════════════════════════════════════════════');
  console.log('  一、整体表现');
  console.log('══════════════════════════════════════════════════\n');
  printFull(trades);
  console.log(`  高开>3%跳过: ${skippedGap} 笔`);

  // ── Day1 日内走势分析 ──────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('  二、Day1 日内走势 → 最终收益');
  console.log('══════════════════════════════════════════════════');
  console.log('  （验证"没反应就走人"的判断阈值）\n');
  console.log(HR);
  console.log(hdr());
  console.log(HR);
  group(trades, t => {
    if (t.day1Intraday < -3) return '01. Day1大跌 (<-3%)';
    if (t.day1Intraday < -1) return '02. Day1下跌 (-3~-1%)';
    if (t.day1Intraday < 0) return '03. Day1微跌 (-1~0%)';
    if (t.day1Intraday < 1) return '04. Day1平盘 (0~1%)';
    if (t.day1Intraday < 3) return '05. Day1小涨 (1~3%)';
    if (t.day1Intraday < 5) return '06. Day1中涨 (3~5%)';
    return '07. Day1大涨 (≥5%)';
  });

  // ── 高开幅度分析 ───────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('  三、开盘跳空幅度 → 最终收益');
  console.log('══════════════════════════════════════════════════\n');
  console.log(HR);
  console.log(hdr());
  console.log(HR);
  group(trades, t => {
    if (t.gapUp < -2) return '1. 大幅低开 (<-2%)';
    if (t.gapUp < -0.5) return '2. 小幅低开 (-2~-0.5%)';
    if (t.gapUp < 0.5) return '3. 平开 (-0.5~0.5%)';
    if (t.gapUp < 1.5) return '4. 小高开 (0.5~1.5%)';
    return '5. 高开 (1.5~3%)';
  });

  // ── 核心因子分析 ───────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('  四、因子分析');
  console.log('══════════════════════════════════════════════════\n');

  console.log('【J 值区间】');
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => {
    if (t.j < 0) return 'J < 0';
    if (t.j < 13) return '0 ≤ J < 13';
    if (t.j < 20) return '13 ≤ J < 20';
    if (t.j < 50) return '20 ≤ J < 50';
    return 'J ≥ 50';
  });

  console.log('\n【短期线 vs 多空线】');
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => t.shortAboveBull ? '多头（短期线>多空线）' : '空头（短期线≤多空线）');

  console.log('\n【收盘价位置】');
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => {
    if (t.priceAboveShort) return '收盘>短期线';
    if (t.priceAboveBull) return '收盘介于多空线和短期线之间';
    return '收盘<多空线';
  });

  console.log('\n【偏离短期线】');
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => {
    if (t.deviationShort < -5) return '偏离 < -5%';
    if (t.deviationShort < -3) return '-5% ≤ 偏离 < -3%';
    if (t.deviationShort < 0) return '-3% ≤ 偏离 < 0%';
    if (t.deviationShort < 3) return '0% ≤ 偏离 < 3%';
    return '偏离 ≥ 3%';
  });

  console.log('\n【信号日涨幅（Day0）】');
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => {
    if (t.sigDayChg < 0) return '信号日下跌';
    if (t.sigDayChg < 3) return '信号日涨 0~3%';
    if (t.sigDayChg < 5) return '信号日涨 3~5%';
    if (t.sigDayChg < 7) return '信号日涨 5~7%';
    return '信号日涨 ≥7%';
  });

  console.log('\n【量比】');
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => {
    if (t.volRatio == null) return '未知';
    if (t.volRatio < 0.8) return '缩量 (<0.8)';
    if (t.volRatio < 1.5) return '平量 (0.8~1.5)';
    if (t.volRatio < 3) return '放量 (1.5~3)';
    return '巨量 (≥3)';
  });

  console.log('\n【上影线 vs 实体】');
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => {
    if (t.body <= 0) return '十字星(无实体)';
    const ratio = t.upperShadow / t.body;
    if (ratio <= 0.3) return '1. 几乎无上影 (≤0.3倍)';
    if (ratio <= 0.7) return '2. 短上影 (0.3~0.7倍)';
    if (ratio <= 1.0) return '3. 上影≈实体 (0.7~1倍)';
    if (ratio <= 2.0) return '4. 长上影 (1~2倍)';
    return '5. 极长上影 (>2倍)';
  });

  console.log('\n【上影线≤实体 vs 上影线>实体】');
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => t.upperLeBody ? '上影线≤实体' : '上影线>实体(含十字星)');

  console.log('\n【下影线 vs 实体】');
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => {
    if (t.body <= 0) return '十字星(无实体)';
    const ratio = t.lowerShadow / t.body;
    if (ratio <= 0.3) return '1. 几乎无下影 (≤0.3倍)';
    if (ratio <= 0.7) return '2. 短下影 (0.3~0.7倍)';
    if (ratio <= 1.0) return '3. 下影≈实体 (0.7~1倍)';
    return '4. 长下影 (>1倍)';
  });

  console.log('\n【板块】');
  console.log(HR); console.log(hdr()); console.log(HR);
  const boardName = { main_sh: '沪市主板', main_sz: '深市主板', gem: '创业板', star: '科创板', bse: '北交所' };
  group(trades, t => boardName[t.board] || t.board);

  // ── 组合因子搜索 ───────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('  五、因子组合搜索');
  console.log('══════════════════════════════════════════════════\n');

  const combos = [
    { name: '基础 (无额外条件)', f: () => true },
    // ── 上影线独立效果 ──
    { name: '上影线≤实体', f: t => t.upperLeBody },
    { name: '上影线>实体', f: t => !t.upperLeBody },
    // ── 涨幅≤3% + nearLine + J<13: 多头 vs 空头 对比 ──
    { name: '涨幅≤3% + nearLine + J<13', f: t => t.sigDayChg <= 3 && t.nearLine && t.j < 13 },
    { name: '涨幅≤3% + nearLine + J<13 + 多头', f: t => t.sigDayChg <= 3 && t.nearLine && t.j < 13 && t.shortAboveBull },
    { name: '涨幅≤3% + nearLine + J<13 + 空头', f: t => t.sigDayChg <= 3 && t.nearLine && t.j < 13 && !t.shortAboveBull },
    // ── 加上影线≤实体 ──
    { name: '涨幅≤3% + nearLine + J<13 + 上影≤实体', f: t => t.sigDayChg <= 3 && t.nearLine && t.j < 13 && t.upperLeBody },
    { name: '涨幅≤3% + nearLine + J<13 + 上影≤实体 + 空头', f: t => t.sigDayChg <= 3 && t.nearLine && t.j < 13 && t.upperLeBody && !t.shortAboveBull },
    { name: '涨幅≤3% + nearLine + J<13 + 上影≤实体 + 多头', f: t => t.sigDayChg <= 3 && t.nearLine && t.j < 13 && t.upperLeBody && t.shortAboveBull },
    // ── 加红砖>绿砖 ──
    { name: '红>绿 + 涨幅≤3% + nearLine + J<13', f: t => t.redGtGreen && t.sigDayChg <= 3 && t.nearLine && t.j < 13 },
    { name: '红>绿 + 涨幅≤3% + nearLine + J<13 + 上影≤实体', f: t => t.redGtGreen && t.sigDayChg <= 3 && t.nearLine && t.j < 13 && t.upperLeBody },
    { name: '红>绿 + 涨幅≤3% + nL + J<13 + 上影≤实 + 空', f: t => t.redGtGreen && t.sigDayChg <= 3 && t.nearLine && t.j < 13 && t.upperLeBody && !t.shortAboveBull },
    { name: '红>绿 + 涨幅≤3% + nL + J<13 + 上影≤实 + 多', f: t => t.redGtGreen && t.sigDayChg <= 3 && t.nearLine && t.j < 13 && t.upperLeBody && t.shortAboveBull },
    // ── 不含其他条件，单看上影线+J ──
    { name: 'J<13 + 上影线≤实体', f: t => t.j < 13 && t.upperLeBody },
    { name: 'J<13 + 上影线>实体', f: t => t.j < 13 && !t.upperLeBody },
    { name: 'J<13 + 上影线≤实体 + 空头', f: t => t.j < 13 && t.upperLeBody && !t.shortAboveBull },
    // ── 不限J: 多头 vs 空头 ──
    { name: '涨幅≤3% + nearLine', f: t => t.sigDayChg <= 3 && t.nearLine },
    { name: '涨幅≤3% + nearLine + 上影≤实体', f: t => t.sigDayChg <= 3 && t.nearLine && t.upperLeBody },
    // ── J<13 基准对比 ──
    { name: 'J < 13', f: t => t.j < 13 },
    { name: 'J < 13 + 多头', f: t => t.j < 13 && t.shortAboveBull },
    { name: 'J < 13 + 空头', f: t => t.j < 13 && !t.shortAboveBull },
  ];

  console.log(HR);
  console.log(hdr());
  console.log(HR);
  const comboStats = [];
  for (const c of combos) {
    const sub = trades.filter(c.f);
    if (sub.length < 5) { console.log(`${c.name.padEnd(40)} ${String(sub.length).padStart(6)}  样本不足`); continue; }
    const s = stats(sub);
    console.log(row(c.name, s));
    comboStats.push({ name: c.name, ...s });
  }

  // ── 综合排名 ───────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('  六、综合排名（胜率×平均收益, 交易数≥10）');
  console.log('══════════════════════════════════════════════════\n');

  const ranked = comboStats.filter(s => s.total >= 10)
    .sort((a, b) => (b.winRate * b.avgReturn) - (a.winRate * a.avgReturn));

  console.log(HR);
  console.log('排名'.padEnd(4) + '条件'.padEnd(42) + '交易数'.padStart(6) + '胜率'.padStart(8) +
    '平均收益'.padStart(10) + '盈亏比'.padStart(8) + '得分'.padStart(10));
  console.log(HR);
  ranked.slice(0, 15).forEach((s, i) => {
    console.log(
      `${String(i+1).padEnd(4)}${s.name.padEnd(42)}${String(s.total).padStart(6)}` +
      `${(s.winRate.toFixed(1)+'%').padStart(8)}${fmtPct(s.avgReturn).padStart(10)}` +
      `${s.profitFactor.toFixed(2).padStart(8)}${(s.winRate * s.avgReturn).toFixed(1).padStart(10)}`
    );
  });

  // ── 行业 Top 20 ───────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════════');
  console.log('  七、行业 Top 20（交易数≥5）');
  console.log('══════════════════════════════════════════════════\n');

  const byInd = {};
  for (const t of trades) { const k = t.industry || '未知'; (byInd[k] ??= []).push(t); }
  const indRank = Object.entries(byInd).filter(([,a]) => a.length >= 5)
    .map(([n,a]) => ({ name: n, ...stats(a) })).sort((a,b) => b.winRate - a.winRate);

  console.log('行业'.padEnd(16) + '交易数'.padStart(6) + '胜率'.padStart(8) +
    '平均收益'.padStart(10) + '盈利均值'.padStart(10) + '亏损均值'.padStart(10));
  console.log('─'.repeat(70));
  for (const s of indRank.slice(0, 20)) {
    console.log(`${s.name.padEnd(16)}${String(s.total).padStart(6)}${(s.winRate.toFixed(1)+'%').padStart(8)}` +
      `${fmtPct(s.avgReturn).padStart(10)}${fmtPct(s.avgWin).padStart(10)}${fmtPct(s.avgLoss).padStart(10)}`);
  }

  // ── 月度 ──────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════════');
  console.log('  八、月度表现');
  console.log('══════════════════════════════════════════════════\n');
  const byMon = {};
  for (const t of trades) { const m = t.sigDate.slice(0,4)+'-'+t.sigDate.slice(4,6); (byMon[m] ??= []).push(t); }
  console.log('月份'.padEnd(10) + '交易数'.padStart(6) + '胜率'.padStart(8) + '平均收益'.padStart(10) + '总收益'.padStart(12));
  console.log('─'.repeat(52));
  for (const [m, arr] of Object.entries(byMon).sort()) {
    const s = stats(arr);
    const tot = arr.reduce((sum, t) => sum + t.ret, 0);
    console.log(`${m.padEnd(10)}${String(s.total).padStart(6)}${(s.winRate.toFixed(1)+'%').padStart(8)}${fmtPct(s.avgReturn).padStart(10)}${fmtPct(tot).padStart(12)}`);
  }

  // ── 持仓天数 ──────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════════');
  console.log('  九、持仓天数 & 卖出类型');
  console.log('══════════════════════════════════════════════════\n');
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => `持仓 ${t.sellDay} 天`);
  console.log();
  console.log(HR); console.log(hdr()); console.log(HR);
  group(trades, t => t.sellType === 'next_open' ? '次日开盘卖（没涨够）' : '持满/收盘卖（涨够了）');

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n\n总耗时: ${elapsed}s | 信号: ${sigCnt} | 高开跳过: ${skippedGap} | 交易: ${trades.length}\n`);
}

// ── 统计工具 ─────────────────────────────────────────────────

function stats(trades) {
  if (!trades.length) return { total:0, wins:0, losses:0, winRate:0, avgReturn:0, avgWin:0, avgLoss:0, medianReturn:0, maxWin:0, maxLoss:0, profitFactor:0 };
  const rets = trades.map(t => t.ret);
  const w = rets.filter(r => r > 0), l = rets.filter(r => r <= 0);
  const sorted = [...rets].sort((a,b) => a-b);
  const med = sorted.length%2 ? sorted[sorted.length>>1] : (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
  const aw = w.length ? w.reduce((s,r)=>s+r,0)/w.length : 0;
  const al = l.length ? l.reduce((s,r)=>s+r,0)/l.length : 0;
  const pf = al !== 0 ? Math.abs(aw/al) : aw > 0 ? Infinity : 0;
  let maxW = -Infinity, maxL = Infinity;
  for (const r of rets) { if (r > maxW) maxW = r; if (r < maxL) maxL = r; }
  return { total:trades.length, wins:w.length, losses:l.length,
    winRate: w.length/trades.length*100, avgReturn: round2(rets.reduce((s,r)=>s+r,0)/rets.length),
    avgWin: round2(aw), avgLoss: round2(al), medianReturn: round2(med),
    maxWin: round2(maxW), maxLoss: round2(maxL), profitFactor: round2(pf) };
}

function printFull(trades) {
  const s = stats(trades);
  console.log(`  交易数:     ${s.total}`);
  console.log(`  盈利/亏损:  ${s.wins} / ${s.losses}`);
  console.log(`  胜率:       ${s.winRate.toFixed(1)}%`);
  console.log(`  平均收益:   ${fmtPct(s.avgReturn)}`);
  console.log(`  收益中位数: ${fmtPct(s.medianReturn)}`);
  console.log(`  盈利均值:   ${fmtPct(s.avgWin)}`);
  console.log(`  亏损均值:   ${fmtPct(s.avgLoss)}`);
  console.log(`  最大盈利:   ${fmtPct(s.maxWin)}`);
  console.log(`  最大亏损:   ${fmtPct(s.maxLoss)}`);
  console.log(`  盈亏比:     ${s.profitFactor.toFixed(2)}`);
}

function hdr() {
  return '条件'.padEnd(40) + '交易数'.padStart(6) + '胜率'.padStart(8) +
    '平均收益'.padStart(10) + '盈利均值'.padStart(10) + '亏损均值'.padStart(10) + '盈亏比'.padStart(8);
}

function row(name, s) {
  return `${name.padEnd(40)}${String(s.total).padStart(6)}${(s.winRate.toFixed(1)+'%').padStart(8)}` +
    `${fmtPct(s.avgReturn).padStart(10)}${fmtPct(s.avgWin).padStart(10)}${fmtPct(s.avgLoss).padStart(10)}${s.profitFactor.toFixed(2).padStart(8)}`;
}

function group(trades, fn) {
  const g = {};
  for (const t of trades) { const k = fn(t); (g[k] ??= []).push(t); }
  for (const [k, arr] of Object.entries(g).sort()) console.log(row(k, stats(arr)));
}

main().catch(err => { console.error(err); process.exit(1); });
