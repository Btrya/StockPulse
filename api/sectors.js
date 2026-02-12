import { getSectors } from './_lib/eastmoney.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL } from './_lib/constants.js';

export default async function handler(req, res) {
  try {
    // 尝试从缓存读取
    if (redis.isConfigured()) {
      const cached = await redis.get(KEY.SECTORS);
      if (cached) {
        return res.json({ data: cached, updatedAt: null, cached: true });
      }
    }

    const sectors = await getSectors();
    sectors.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    if (redis.isConfigured()) {
      await redis.set(KEY.SECTORS, sectors, TTL.SECTORS);
    }

    return res.json({ data: sectors, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('sectors error:', err);
    return res.status(500).json({ error: err.message });
  }
}
