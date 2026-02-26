import * as redis from './_lib/redis.js';
import { KEY } from './_lib/constants.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, klt = 'daily', window: win = '30' } = req.query || {};

  if (!date) {
    return res.status(400).json({ error: '缺少 date 参数' });
  }

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    const cacheKey = KEY.postAnalysis(date, klt, Number(win));
    const data = await redis.get(cacheKey);

    if (data) {
      return res.json({ done: true, data });
    }

    // check progress
    const progress = await redis.get(KEY.PA_PROGRESS);
    if (progress && progress.date === date && progress.klt === klt) {
      return res.json({
        done: false,
        idx: progress.idx || 0,
        total: progress.tsCodes?.length || 0,
      });
    }

    return res.json({ done: false, data: null });
  } catch (err) {
    console.error('post-analysis-data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
