import * as redis from './_lib/redis.js';

export default async function handler(req, res) {
  try {
    if (!redis.isConfigured()) {
      return res.json({ logs: [], message: 'Redis not configured' });
    }
    const logs = (await redis.get('bulk:log')) || [];
    const progress = await redis.get('bulk:progress');
    return res.json({ logs, progress });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
