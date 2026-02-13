// 宽阈值：存 Redis 用，查询时按用户参数收窄
export const WIDE_J_THRESHOLD = 20;
export const WIDE_TOLERANCE = 5;

// 默认用户参数
export const DEFAULT_J = 0;
export const DEFAULT_TOLERANCE = 2;
export const DEFAULT_KLT = 'daily'; // daily | weekly

// Tushare 并发控制（免费版限流较严）
export const TUSHARE_DELAY_MS = 150;

// Redis key
export const KEY = {
  STOCKS: 'stocks:list',
  screenResult: (date, klt) => `screen:${date}:${klt}`,
  META: 'scan:meta',
  PROGRESS: 'scan:progress',
  CONCEPTS_MAP: 'concepts:map',
  CONCEPTS_META: 'concepts:meta',
  scanDates: (klt) => `scan:dates:${klt}`,
  backtestResult: (date, klt) => `backtest:${date}:${klt}`,
  BACKTEST_PROGRESS: 'backtest:progress',
};

// TTL (seconds)
export const TTL = {
  STOCKS: 86400,              // 24h
  SCREEN_RESULT_DAILY: 604800,  // 7d
  SCREEN_RESULT_WEEKLY: 2592000, // 30d
  PROGRESS: 7200,              // 2h
  CONCEPTS: 604800,            // 7d
  BACKTEST_RESULT: 172800,     // 48h
};

// 追踪窗口
export const TRACKING_DAILY_WINDOW = 5;
export const TRACKING_WEEKLY_WINDOW = 4;

// 市场板块分类
export const MARKET_BOARDS = [
  { code: 'main_sh', name: '沪市主板', prefix: ['60'] },
  { code: 'main_sz', name: '深市主板', prefix: ['00'] },
  { code: 'gem', name: '创业板', prefix: ['30'] },
  { code: 'star', name: '科创板', prefix: ['68'] },
  { code: 'bse', name: '北交所', prefix: ['83', '87', '43'] },
];

export function getMarketBoard(code) {
  for (const b of MARKET_BOARDS) {
    if (b.prefix.some(p => code.startsWith(p))) return b.code;
  }
  return 'other';
}
