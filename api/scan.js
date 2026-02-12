import { getSectorStocks, batchGetKlines } from './_lib/eastmoney.js';
import { screenStock, filterResults } from './_lib/screener.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL, DEFAULT_J, DEFAULT_TOLERANCE, DEFAULT_KLT } from './_lib/constants.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const sector = body.sector;
    if (!sector) {
      return res.status(400).json({ error: 'sector is required' });
    }

    const klt = body.klt || DEFAULT_KLT;

    const stocks = await getSectorStocks(sector);
    if (!stocks.length) {
      return res.json({ data: [], meta: { total: 0 } });
    }

    const withKlines = await batchGetKlines(stocks, klt);
    const hits = withKlines.map(screenStock).filter(Boolean);

    const today = new Date().toISOString().slice(0, 10);

    // 缓存宽阈值结果（失败不阻塞返回）
    if (redis.isConfigured()) {
      try {
        await redis.set(KEY.scanResult(today, sector, klt), hits, TTL.SCAN_RESULT);
        await redis.set(KEY.META, { lastDate: today, lastTime: new Date().toISOString() });
      } catch (redisErr) {
        console.error('Redis cache write failed:', redisErr.message);
      }
    }

    // 按用户参数过滤返回
    const j = Number(body.j ?? DEFAULT_J);
    const tolerance = Number(body.tolerance ?? DEFAULT_TOLERANCE);
    const filtered = filterResults(hits, j, tolerance);

    return res.json({
      data: filtered,
      meta: {
        total: filtered.length,
        wideTotal: hits.length,
        updatedAt: new Date().toISOString(),
        scanDate: today,
        klt,
      },
    });
  } catch (err) {
    console.error('scan error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
