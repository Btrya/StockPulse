// 宽阈值：Cron 和缓存用，后续按用户参数收窄
export const WIDE_J_THRESHOLD = 20;
export const WIDE_TOLERANCE = 5;

// 默认用户参数
export const DEFAULT_J = 0;
export const DEFAULT_TOLERANCE = 2;
export const DEFAULT_KLT = '101'; // 101=日线 102=周线

// 东方财富 API 并发控制
export const CONCURRENCY = 5;
export const BATCH_DELAY_MS = 200;
export const RETRY_COUNT = 2;
export const RETRY_DELAY_MS = 500;

// K线数据量
export const KLINE_LIMIT = 150;

// Redis key 前缀
export const KEY = {
  SECTORS: 'sectors:list',
  scanResult: (date, sector, klt = '101') => `scan:${date}:${sector}:${klt}`,
  META: 'scan:meta',
  PROGRESS: 'scan:progress',
};

// TTL (seconds)
export const TTL = {
  SECTORS: 86400,       // 24h
  SCAN_RESULT: 172800,  // 48h
  PROGRESS: 7200,       // 2h
};
