import * as redis from './_lib/redis.js';
import { KEY, DEFAULT_J, DEFAULT_TOLERANCE, DEFAULT_KLT } from './_lib/constants.js';
import { filterResults } from './_lib/screener.js';

export default async function handler(req, res) {
  try {
    const sector = req.query.sector;
    const j = Number(req.query.j ?? DEFAULT_J);
    const tolerance = Number(req.query.tolerance ?? DEFAULT_TOLERANCE);
    const klt = req.query.klt || DEFAULT_KLT;
    const sort = req.query.sort || 'j';
    const order = req.query.order || 'asc';

    if (!sector) {
      return res.status(400).json({ error: 'sector is required' });
    }

    if (!redis.isConfigured()) {
      return res.json({ data: [], meta: { total: 0, cached: false } });
    }

    const today = new Date().toISOString().slice(0, 10);

    if (sector === 'all') {
      return res.json({ data: [], meta: { total: 0, message: '请选择行业板块' } });
    }

    const data = await redis.get(KEY.scanResult(today, sector, klt));
    if (!data) {
      return res.json({ data: [], meta: { total: 0, cached: false } });
    }

    const filtered = filterResults(data, j, tolerance);

    filtered.sort((a, b) => {
      const va = a[sort] ?? 0;
      const vb = b[sort] ?? 0;
      return order === 'asc' ? va - vb : vb - va;
    });

    return res.json({
      data: filtered,
      meta: {
        total: filtered.length,
        wideTotal: data.length,
        updatedAt: new Date().toISOString(),
        scanDate: today,
        klt,
        cached: true,
      },
    });
  } catch (err) {
    console.error('results error:', err);
    return res.status(500).json({ error: err.message });
  }
}
