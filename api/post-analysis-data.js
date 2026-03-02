import * as redis from './_lib/redis.js';
import { KEY } from './_lib/constants.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, klt = 'daily', window: win = '30', codesHash = '' } = req.query || {};

  if (!date) {
    return res.status(400).json({ error: '缺少 date 参数' });
  }

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    const cacheKey = KEY.postAnalysis(date, klt, Number(win), codesHash);
    const data = await redis.get(cacheKey);

    if (data) {
      return res.json({ done: true, data, codesHash });
    }

    // check progress
    const progress = await redis.get(KEY.PA_PROGRESS);
    if (progress && progress.date === date && progress.klt === klt && progress.codesHash === codesHash) {
      return res.json({
        done: false,
        idx: progress.idx || 0,
        total: progress.tsCodes?.length || 0,
        codesHash,
      });
    }

    return res.json({ done: false, data: null, codesHash });
  } catch (err) {
    console.error('post-analysis-data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
