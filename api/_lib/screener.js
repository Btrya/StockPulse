import { shortTrendLine, bullBearLine, kdj } from './indicators.js';
import { WIDE_J_THRESHOLD, WIDE_TOLERANCE } from './constants.js';

// 对单只股票计算指标，用宽阈值判断是否可能命中
// 返回 null 表示不符合，否则返回指标数据
export function screenStock(stock) {
  const { klines, code, name, market } = stock;
  if (!klines || klines.length < 120) return null;

  const closes = klines.map(k => k.close);
  const lows = klines.map(k => k.low);
  const highs = klines.map(k => k.high);

  const shortTrend = shortTrendLine(closes);
  const bullBear = bullBearLine(closes);
  if (shortTrend === null || bullBear === null) return null;

  const { k, d, j } = kdj(highs, lows, closes);
  if (j === null) return null;

  // 宽阈值：J < 20
  if (j >= WIDE_J_THRESHOLD) return null;

  const todayLow = lows[lows.length - 1];
  const todayClose = closes[closes.length - 1];

  // 偏离百分比
  const deviationShort = ((todayLow - shortTrend) / shortTrend) * 100;
  const deviationBull = ((todayLow - bullBear) / bullBear) * 100;

  // 宽阈值容差：任意一条线 ±5% 内
  const nearShort = Math.abs(deviationShort) <= WIDE_TOLERANCE;
  const nearBull = Math.abs(deviationBull) <= WIDE_TOLERANCE;
  if (!nearShort && !nearBull) return null;

  return {
    code,
    name,
    market,
    low: round2(todayLow),
    close: round2(todayClose),
    shortTrend: round2(shortTrend),
    bullBear: round2(bullBear),
    k: round2(k),
    d: round2(d),
    j: round2(j),
    deviationShort: round2(deviationShort),
    deviationBull: round2(deviationBull),
  };
}

// 按用户参数二次过滤
export function filterResults(results, jThreshold, tolerance) {
  return results.filter(r => {
    if (r.j >= jThreshold) return false;
    const nearShort = Math.abs(r.deviationShort) <= tolerance;
    const nearBull = Math.abs(r.deviationBull) <= tolerance;
    return nearShort || nearBull;
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
