import { shortTrendLine, bullBearLine, kdj, brickChart } from './indicators.js';
import { WIDE_J_THRESHOLD, WIDE_TOLERANCE, getMarketBoard } from './constants.js';

// ── 策略注册表 ────────────────────────────────────────────
// 每个策略：{ id, name, test(r, params) → boolean, paramKeys }
// test 接收一条股票指标数据和用户参数，返回是否满足条件
export const STRATEGIES = {
  nearLine: {
    id: 'nearLine',
    name: '触碰趋势线',
    desc: '价格在短期趋势线或多空分界线容差范围内',
    paramKeys: ['tolerance'],
    test: (r, { tolerance = 2 }) => {
      const nearShort = Math.abs(r.deviationShort) <= tolerance;
      const nearBull = Math.abs(r.deviationBull) <= tolerance;
      return nearShort || nearBull;
    },
  },
  lowJ: {
    id: 'lowJ',
    name: 'KDJ J值低位',
    desc: 'J 值低于阈值',
    paramKeys: ['jThreshold'],
    test: (r, { jThreshold = 0 }) => r.j < jThreshold,
  },
  shortAboveBull: {
    id: 'shortAboveBull',
    name: '短期线在多空线上方',
    desc: '短期趋势线 > 多空分界线，多头排列',
    paramKeys: [],
    test: (r) => r.shortTrend > r.bullBear,
  },
  brickReversal: {
    id: 'brickReversal',
    name: '砖型图绿转红',
    desc: '砖型图从下降转上升，且反转力度 > 前值 2/3',
    paramKeys: [],
    test: (r) => {
      if (r.brick == null || r.brickPrev == null || r.brickPrev2 == null) return false;
      // 前天绿（下降）：brickPrev < brickPrev2
      const prevGreen = r.brickPrev < r.brickPrev2;
      // 今天红（上升）：brick > brickPrev
      const nowRed = r.brick > r.brickPrev;
      // 有效反转：当前值 > 前一值 * 2/3
      const validForce = r.brick > r.brickPrev * 2 / 3;
      return prevGreen && nowRed && validForce;
    },
  },
  priceAboveLine: {
    id: 'priceAboveLine',
    name: '收盘价在趋势线上方',
    desc: '收盘价高于短期趋势线或多空分界线',
    paramKeys: ['line'],
    test: (r, { line = 'short' }) => {
      if (line === 'bull') return r.close > r.bullBear;
      return r.close > r.shortTrend;
    },
  },
  consecutiveLimitUp: {
    id: 'consecutiveLimitUp',
    name: '二连板',
    desc: '连续两个交易日涨停',
    paramKeys: [],
    test: (r) => !!(r.limitUp && r.limitUpPrev),
  },
};

// 默认启用的策略（保持现有行为：J值低位 AND 触碰趋势线）
export const DEFAULT_STRATEGIES = ['lowJ', 'nearLine', 'shortAboveBull'];

// ── 指标计算（不变） ──────────────────────────────────────

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

  const { brick, brickPrev, brickPrev2 } = brickChart(highs, lows, closes);

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

  // 涨停判定：根据板块确定涨停幅度
  const limitPct = (board === 'gem' || board === 'star') ? 20
    : board === 'bse' ? 30 : 10;
  const len = closes.length;
  const isLimitUp = (i) => {
    if (i < 1) return false;
    const pct = (closes[i] - closes[i - 1]) / closes[i - 1] * 100;
    return pct >= limitPct - 0.5; // 0.5% 容差，四舍五入导致的微小偏差
  };
  const limitUp = isLimitUp(len - 1);
  const limitUpPrev = isLimitUp(len - 2);

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
    brick: brick != null ? round2(brick) : null,
    brickPrev: brickPrev != null ? round2(brickPrev) : null,
    brickPrev2: brickPrev2 != null ? round2(brickPrev2) : null,
    limitUp,
    limitUpPrev,
  };
}

// ── 策略执行 ──────────────────────────────────────────────

// 对一条数据执行策略列表，返回是否通过
// combinator: 'AND' | 'OR'
export function applyStrategies(r, params, strategyIds = DEFAULT_STRATEGIES, combinator = 'AND') {
  const tests = strategyIds.map(id => STRATEGIES[id]).filter(Boolean);
  if (tests.length === 0) return true;
  return combinator === 'AND'
    ? tests.every(s => s.test(r, params))
    : tests.some(s => s.test(r, params));
}

// ── 二次过滤（保持向后兼容） ──────────────────────────────

// 按用户参数二次过滤
// strategies/combinator 可选，不传时使用默认策略（lowJ AND nearLine），行为与改动前完全一致
export function filterResults(results, {
  jThreshold, tolerance, industries, excludeBoards, concepts,
  strategies, combinator, line,
} = {}) {
  const sIds = strategies || DEFAULT_STRATEGIES;
  const comb = combinator || 'AND';
  const params = { jThreshold: jThreshold ?? 0, tolerance: tolerance ?? 2, line: line ?? 'short' };

  return results.filter(r => {
    // 收盘价低于多空线（含容差）视为噪音
    if (r.close < r.bullBear * (1 - params.tolerance / 100)) return false;
    if (excludeBoards && excludeBoards.length && excludeBoards.includes(r.board)) return false;
    if (industries && industries.length && !industries.includes(r.industry)) return false;
    if (concepts && concepts.length) {
      const rc = r.concepts || [];
      if (!concepts.some(c => rc.includes(c))) return false;
    }
    return applyStrategies(r, params, sIds, comb);
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
