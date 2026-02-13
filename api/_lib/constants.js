// 宽阈值：存 Redis 用，查询时按用户参数收窄
export const WIDE_J_THRESHOLD = 13;
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
  HOT_DATA: 'hot:data',
};

// TTL (seconds)
export const TTL = {
  STOCKS: 86400,              // 24h
  SCREEN_RESULT_DAILY: 604800,  // 7d
  SCREEN_RESULT_WEEKLY: 2592000, // 30d
  PROGRESS: 7200,              // 2h
  CONCEPTS: 604800,            // 7d
  BACKTEST_RESULT: 172800,     // 48h
  HOT_DATA: 300,               // 5min
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

// 获取北京时间当天日期 YYYY-MM-DD
export function getCNDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

// 判断当前时刻 A 股是否已收盘（15:00 CST = 07:00 UTC）
export function isMarketClosed(now = new Date()) {
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  return utcH > 7 || (utcH === 7 && utcM >= 0);
}

// 判断北京时间某天是否为周末
export function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  const day = d.getDay();
  return day === 0 || day === 6;
}
