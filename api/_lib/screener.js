import { shortTrendLine, bullBearLine, kdj } from './indicators.js';
import { WIDE_J_THRESHOLD, WIDE_TOLERANCE, getMarketBoard } from './constants.js';

// 对单只股票计算指标
// opts.jThreshold / opts.tolerance 可覆盖默认 WIDE 阈值
// opts.noFilter = true 时跳过所有阈值检查，返回全量指标（回测用）
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

  if (!opts.noFilter) {
    const jMax = opts.jThreshold ?? WIDE_J_THRESHOLD;
    if (j >= jMax) return null;
  }

  const todayLow = lows[lows.length - 1];
  const todayHigh = highs[highs.length - 1];
  const todayClose = closes[closes.length - 1];

  // 最低价偏离
  const devShortLow = ((todayLow - shortTrend) / shortTrend) * 100;
  const devBullLow = ((todayLow - bullBear) / bullBear) * 100;
  // 最高价偏离
  const devShortHigh = ((todayHigh - shortTrend) / shortTrend) * 100;
  const devBullHigh = ((todayHigh - bullBear) / bullBear) * 100;

  // 取更接近趋势线的那个（绝对值更小）
  const useShortHigh = Math.abs(devShortHigh) < Math.abs(devShortLow);
  const deviationShort = useShortHigh ? devShortHigh : devShortLow;
  const touchShort = useShortHigh ? 'H' : 'L';

  const useBullHigh = Math.abs(devBullHigh) < Math.abs(devBullLow);
  const deviationBull = useBullHigh ? devBullHigh : devBullLow;
  const touchBull = useBullHigh ? 'H' : 'L';

  if (!opts.noFilter) {
    const tol = opts.tolerance ?? WIDE_TOLERANCE;
    const nearShort = Math.abs(deviationShort) <= tol;
    const nearBull = Math.abs(deviationBull) <= tol;
    if (!nearShort && !nearBull) return null;
  }

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
    touchShort,
    deviationBull: round2(deviationBull),
    touchBull,
  };
}

// 按用户参数二次过滤
export function filterResults(results, { jThreshold, tolerance, industries, excludeBoards, concepts }) {
  return results.filter(r => {
    if (r.j >= jThreshold) return false;
    // 收盘价低于多空线（含容差）视为噪音
    if (r.close < r.bullBear * (1 - tolerance / 100)) return false;
    if (excludeBoards && excludeBoards.length && excludeBoards.includes(r.board)) return false;
    if (industries && industries.length && !industries.includes(r.industry)) return false;
    if (concepts && concepts.length) {
      const rc = r.concepts || [];
      if (!concepts.some(c => rc.includes(c))) return false;
    }
    const nearShort = Math.abs(r.deviationShort) <= tolerance;
    const nearBull = Math.abs(r.deviationBull) <= tolerance;
    return nearShort || nearBull;
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
