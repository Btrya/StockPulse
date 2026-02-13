import * as redis from './_lib/redis.js';
import { KEY } from './_lib/constants.js';

export default async function handler(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json({ data: [] });
    }

    if (!redis.isConfigured()) {
      return res.json({ data: [], error: 'Redis 未配置' });
    }

    const stocks = await redis.get(KEY.STOCKS);
    if (!stocks || !stocks.length) {
      return res.json({ data: [] });
    }

    const conceptsMap = await redis.get(KEY.CONCEPTS_MAP) || {};
    const lower = q.toLowerCase();

    const matches = stocks
      .filter(s => {
        const code = (s.symbol || s.ts_code.split('.')[0]);
        return code.includes(lower)
          || s.name.toLowerCase().includes(lower)
          || (s.industry || '').toLowerCase().includes(lower);
      })
      .slice(0, 20)
      .map(s => {
        const code = s.symbol || s.ts_code.split('.')[0];
        return {
          code,
          ts_code: s.ts_code,
          name: s.name,
          industry: s.industry || '',
          concepts: conceptsMap[s.ts_code] || [],
        };
      });

    return res.json({ data: matches });
  } catch (err) {
    console.error('stock-search error:', err);
    return res.status(500).json({ error: err.message });
  }
}
