// 后验分析模拟引擎 — 纯函数，零副作用

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pct(a, b) {
  return (a - b) / b * 100;
}

// 默认策略参数
export const DEFAULT_STRATEGIES = {
  breakEntryLow: { enabled: true },
  breakBullBear: { enabled: true },
  fixedStopLoss: { enabled: true, pct: 5 },
  timeStop: { enabled: false, days: 10 },
  fixedTakeProfit: { enabled: false, pct: 10 },
  bigCandleExit: { enabled: false, days: 3 },
  breakShortTrend: { enabled: false },
};

// 策略名称映射
export const STRATEGY_LABELS = {
  breakEntryLow: '跌破进场K线低点',
  breakBullBear: '跌破多空线',
  fixedStopLoss: '固定止损',
  timeStop: '时间止损',
  fixedTakeProfit: '固定止盈',
  bigCandleExit: '大阳线后退出',
  breakShortTrend: '跌破短期趋势线',
};

/**
 * 主函数：遍历每只股票调用 simulateOne
 */
export function simulateTrades(rawData, strategies) {
  if (!rawData?.length) return { trades: [], stats: null };
  const trades = rawData.map(stock => simulateOne(stock, strategies)).filter(Boolean);
  const stats = computeAggStats(trades);
  return { trades, stats };
}

/**
 * 单只股票模拟：逐日遍历 futureBars，检查退出策略（取先触发者）
 */
export function simulateOne(stock, strategies) {
  const { futureBars, entryOpen, entryLow } = stock;
  if (!futureBars?.length || !entryOpen) return null;

  const buyPrice = entryOpen;
  let maxPnl = 0;
  let maxPnlDay = 0;
  let bigCandleDate = null;
  let bigCandleDay = null;
  let exitDay = null;
  let exitPrice = null;
  let exitReason = null;

  for (let i = 0; i < futureBars.length; i++) {
    const bar = futureBars[i];
    const dayPnl = pct(bar.close, buyPrice);
    const dayHighPnl = pct(bar.high, buyPrice);
    const dayLowPnl = pct(bar.low, buyPrice);

    // track max
    if (dayHighPnl > maxPnl) {
      maxPnl = dayHighPnl;
      maxPnlDay = i + 1;
    }

    // track first big candle (>5% intraday gain)
    if (!bigCandleDate && bar.open > 0 && pct(bar.close, bar.open) > 5) {
      bigCandleDate = bar.date;
      bigCandleDay = i + 1;
    }

    // check exit strategies in priority order
    // 1. breakEntryLow
    if (strategies.breakEntryLow?.enabled && bar.low < entryLow) {
      exitDay = i + 1;
      exitPrice = entryLow; // assume exit at entryLow level
      exitReason = 'breakEntryLow';
      break;
    }

    // 2. breakBullBear
    if (strategies.breakBullBear?.enabled && bar.bullBear != null && bar.close < bar.bullBear) {
      exitDay = i + 1;
      exitPrice = bar.close;
      exitReason = 'breakBullBear';
      break;
    }

    // 3. fixedStopLoss
    if (strategies.fixedStopLoss?.enabled) {
      const stopPct = strategies.fixedStopLoss.pct || 5;
      if (dayLowPnl <= -stopPct) {
        exitDay = i + 1;
        exitPrice = buyPrice * (1 - stopPct / 100);
        exitReason = 'fixedStopLoss';
        break;
      }
    }

    // 4. timeStop
    if (strategies.timeStop?.enabled) {
      const stopDays = strategies.timeStop.days || 10;
      if (i + 1 >= stopDays && dayPnl <= 0) {
        exitDay = i + 1;
        exitPrice = bar.close;
        exitReason = 'timeStop';
        break;
      }
    }

    // 5. fixedTakeProfit
    if (strategies.fixedTakeProfit?.enabled) {
      const tpPct = strategies.fixedTakeProfit.pct || 10;
      if (dayHighPnl >= tpPct) {
        exitDay = i + 1;
        exitPrice = buyPrice * (1 + tpPct / 100);
        exitReason = 'fixedTakeProfit';
        break;
      }
    }

    // 6. bigCandleExit
    if (strategies.bigCandleExit?.enabled && bigCandleDay != null) {
      const afterDays = strategies.bigCandleExit.days || 3;
      if (i + 1 >= bigCandleDay + afterDays) {
        exitDay = i + 1;
        exitPrice = bar.close;
        exitReason = 'bigCandleExit';
        break;
      }
    }

    // 7. breakShortTrend
    if (strategies.breakShortTrend?.enabled && bar.shortTrend != null && bar.close < bar.shortTrend) {
      exitDay = i + 1;
      exitPrice = bar.close;
      exitReason = 'breakShortTrend';
      break;
    }
  }

  // if no exit triggered, hold to end of window
  if (exitDay == null) {
    const lastBar = futureBars[futureBars.length - 1];
    exitDay = futureBars.length;
    exitPrice = lastBar.close;
    exitReason = 'windowEnd';
  }

  const ret = pct(exitPrice, buyPrice);

  return {
    tsCode: stock.tsCode,
    code: stock.code,
    name: stock.name,
    industry: stock.industry,
    entryDate: stock.entryDate,
    buyPrice: round2(buyPrice),
    sellPrice: round2(exitPrice),
    ret: round2(ret),
    maxPnl: round2(maxPnl),
    maxPnlDay,
    bigCandleDate,
    bigCandleDay,
    holdDays: exitDay,
    exitReason,
  };
}

/**
 * 聚合统计
 */
export function computeAggStats(trades) {
  if (!trades.length) return null;

  const rets = trades.map(t => t.ret);
  const wins = rets.filter(r => r > 0);
  const losses = rets.filter(r => r <= 0);

  const sorted = [...rets].sort((a, b) => a - b);
  const median = sorted.length % 2
    ? sorted[sorted.length >> 1]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const avgWin = wins.length ? wins.reduce((s, r) => s + r, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, r) => s + r, 0) / losses.length : 0;
  const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : avgWin > 0 ? Infinity : 0;

  const holdDays = trades.map(t => t.holdDays);
  const avgHold = holdDays.reduce((s, d) => s + d, 0) / holdDays.length;

  let maxWin = -Infinity, maxLoss = Infinity;
  for (const r of rets) {
    if (r > maxWin) maxWin = r;
    if (r < maxLoss) maxLoss = r;
  }

  return {
    total: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: round2(wins.length / trades.length * 100),
    avgReturn: round2(rets.reduce((s, r) => s + r, 0) / rets.length),
    avgWin: round2(avgWin),
    avgLoss: round2(avgLoss),
    medianReturn: round2(median),
    maxWin: round2(maxWin),
    maxLoss: round2(maxLoss),
    profitFactor: round2(profitFactor),
    avgHoldDays: round2(avgHold),
  };
}
