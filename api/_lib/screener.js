import { shortTrendLine, bullBearLine, kdj } from './indicators.js';
import { WIDE_J_THRESHOLD, WIDE_TOLERANCE, getMarketBoard } from './constants.js';

// 对单只股票计算指标，宽阈值筛选
// opts.jThreshold / opts.tolerance 可覆盖默认 WIDE 阈值
export function screenStock(stock, opts = {}) {
  const { klines, ts_code, symbol, name, industry } = stock;
  if (!klines || klines.length < 120) return null;

  const closes = klines.map(k => k.close);
  const lows = klines.map(k => k.low);
  const highs = klines.map(k => k.high);

  const shortTrend = shortTrendLine(closes);
  const bullBear = bullBearLine(closes);
  if (shortTrend === null || bullBear === null) return null;

  const { k, d, j } = kdj(highs, lows, closes);
  if (j === null) return null;

  const jMax = opts.jThreshold ?? WIDE_J_THRESHOLD;
  const tol = opts.tolerance ?? WIDE_TOLERANCE;

  if (j >= jMax) return null;

  const todayLow = lows[lows.length - 1];
  const todayHigh = highs[highs.length - 1];
  const todayClose = closes[closes.length - 1];

  // 最低价偏离（下影线 / 实体下沿触线）
  const deviationShort = ((todayLow - shortTrend) / shortTrend) * 100;
  const deviationBull = ((todayLow - bullBear) / bullBear) * 100;
  // 最高价偏离（上影线触线）
  const deviationShortHigh = ((todayHigh - shortTrend) / shortTrend) * 100;
  const deviationBullHigh = ((todayHigh - bullBear) / bullBear) * 100;

  // low 或 high 任一接近趋势线即命中
  const nearShortLow = Math.abs(deviationShort) <= tol;
  const nearBullLow = Math.abs(deviationBull) <= tol;
  const nearShortHigh = Math.abs(deviationShortHigh) <= tol;
  const nearBullHigh = Math.abs(deviationBullHigh) <= tol;
  if (!nearShortLow && !nearBullLow && !nearShortHigh && !nearBullHigh) return null;

  const code = symbol || ts_code.split('.')[0];
  const board = getMarketBoard(code);

  return {
    code,
    ts_code,
    name,
    industry: industry || '',
    board,
    low: round2(todayLow),
    high: round2(todayHigh),
    close: round2(todayClose),
    shortTrend: round2(shortTrend),
    bullBear: round2(bullBear),
    k: round2(k),
    d: round2(d),
    j: round2(j),
    deviationShort: round2(deviationShort),
    deviationBull: round2(deviationBull),
    deviationShortHigh: round2(deviationShortHigh),
    deviationBullHigh: round2(deviationBullHigh),
  };
}

// 按用户参数二次过滤
export function filterResults(results, { jThreshold, tolerance, industries, excludeBoards, concepts }) {
  return results.filter(r => {
    if (r.j >= jThreshold) return false;
    if (excludeBoards && excludeBoards.length && excludeBoards.includes(r.board)) return false;
    if (industries && industries.length && !industries.includes(r.industry)) return false;
    if (concepts && concepts.length) {
      const rc = r.concepts || [];
      if (!concepts.some(c => rc.includes(c))) return false;
    }
    const nearShortLow = Math.abs(r.deviationShort) <= tolerance;
    const nearBullLow = Math.abs(r.deviationBull) <= tolerance;
    const nearShortHigh = Math.abs(r.deviationShortHigh ?? Infinity) <= tolerance;
    const nearBullHigh = Math.abs(r.deviationBullHigh ?? Infinity) <= tolerance;
    return nearShortLow || nearBullLow || nearShortHigh || nearBullHigh;
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
