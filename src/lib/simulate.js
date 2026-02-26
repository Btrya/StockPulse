// 后验分析模拟引擎 — 纯函数，零副作用

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pct(a, b) {
  return (a - b) / b * 100;
}

// 默认策略参数
export const DEFAULT_STRATEGIES = {
  fixedStopLoss: { enabled: true, pct: 5 },
  timeStop: { enabled: false, days: 10 },
  fixedTakeProfit: { enabled: false, pct: 10 },
  bigCandleExit: { enabled: false, days: 3 },
};

// 策略名称映射
export const STRATEGY_LABELS = {
  fixedStopLoss: '固定止损',
  timeStop: '时间止损',
  fixedTakeProfit: '固定止盈',
  bigCandleExit: '大阳线后退出',
};

// 入场过滤条件
export const DEFAULT_FILTERS = {
  closeAboveShort: false,
  hasVolumeDouble: false,
  hasShrinkingPullback: false,
  hasConsecutiveShrink: false,
};

export const FILTER_LABELS = {
  closeAboveShort: '收盘在短期线上',
  hasVolumeDouble: '有倍量出现',
  hasShrinkingPullback: '缩量回调',
  hasConsecutiveShrink: '连续缩量下跌',
};

/**
 * 主函数：先按 filters 过滤，再遍历每只股票调用 simulateOne
 */
export function simulateTrades(rawData, strategies, filters) {
  if (!rawData?.length) return { trades: [], stats: null };

  // apply entry filters
  let filtered = rawData;
  if (filters) {
    filtered = rawData.filter(stock => {
      for (const key of Object.keys(filters)) {
        if (filters[key] && !stock[key]) return false;
      }
      return true;
    });
  }

  const trades = filtered.map(stock => simulateOne(stock, strategies)).filter(Boolean);
  const stats = computeAggStats(trades);
  return { trades, stats };
}

/**
 * 单只股票模拟：逐日遍历 futureBars，检查退出策略（取先触发者）
 */
export function simulateOne(stock, strategies) {
  const { futureBars, entryOpen } = stock;
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

    // 1. fixedStopLoss
    if (strategies.fixedStopLoss?.enabled) {
      const stopPct = strategies.fixedStopLoss.pct || 5;
      if (dayLowPnl <= -stopPct) {
        exitDay = i + 1;
        exitPrice = buyPrice * (1 - stopPct / 100);
        exitReason = 'fixedStopLoss';
        break;
      }
    }

    // 2. timeStop
    if (strategies.timeStop?.enabled) {
      const stopDays = strategies.timeStop.days || 10;
      if (i + 1 >= stopDays && dayPnl <= 0) {
        exitDay = i + 1;
        exitPrice = bar.close;
        exitReason = 'timeStop';
        break;
      }
    }

    // 3. fixedTakeProfit
    if (strategies.fixedTakeProfit?.enabled) {
      const tpPct = strategies.fixedTakeProfit.pct || 10;
      if (dayHighPnl >= tpPct) {
        exitDay = i + 1;
        exitPrice = buyPrice * (1 + tpPct / 100);
        exitReason = 'fixedTakeProfit';
        break;
      }
    }

    // 4. bigCandleExit
    if (strategies.bigCandleExit?.enabled && bigCandleDay != null) {
      const afterDays = strategies.bigCandleExit.days || 3;
      if (i + 1 >= bigCandleDay + afterDays) {
        exitDay = i + 1;
        exitPrice = bar.close;
        exitReason = 'bigCandleExit';
        break;
      }
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
    closeAboveShort: stock.closeAboveShort,
    hasVolumeDouble: stock.hasVolumeDouble,
    hasShrinkingPullback: stock.hasShrinkingPullback,
    hasConsecutiveShrink: stock.hasConsecutiveShrink,
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
