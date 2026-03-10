import * as redis from './redis.js';

/**
 * 记录用户操作事件（fire-and-forget，失败不影响主流程）
 * @param {string} email
 * @param {string} event  scan | backtest | tracking | swing | export | post_analysis
 */
export async function recordEvent(email, event) {
  if (!email || !event) return;
  try {
    const key = `stats:${email}`;
    await Promise.all([
      redis.hincrby(key, event, 1),
      redis.hincrby(key, 'total', 1),
      redis.hset(key, 'last_seen', new Date().toISOString()),
    ]);
  } catch { /* 统计失败不影响主业务 */ }
}
