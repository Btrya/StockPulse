import { getStockList } from './_lib/tushare.js';
import { screenStock } from './_lib/screener.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL, DEFAULT_J, DEFAULT_TOLERANCE, DEFAULT_KLT } from './_lib/constants.js';
import { filterResults } from './_lib/screener.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const klt = body.klt || DEFAULT_KLT;
    const today = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');

    // 获取股票列表
    let stocks = await getStockList();
    stocks = stocks.filter(s => !s.name.includes('ST') && !s.name.includes('退'));

    const { getDaily, getWeekly } = await import('./_lib/tushare.js');
    const fn = klt === 'weekly' ? getWeekly : getDaily;

    const hits = [];
    let processed = 0;

    for (const stock of stocks) {
      try {
        const klines = await fn(stock.ts_code, start);
        const result = screenStock({ ...stock, klines });
        if (result) hits.push(result);
      } catch { /* skip */ }
      processed++;
      await new Promise(r => setTimeout(r, 150));

      // Vercel 超时保护
      if (processed % 100 === 0) {
        // 中间存一次
        if (redis.isConfigured()) {
          try { await redis.set(KEY.screenResult(today, klt), hits, TTL.SCREEN_RESULT); } catch {}
        }
      }
    }

    // 最终存储
    if (redis.isConfigured()) {
      try {
        await redis.set(KEY.screenResult(today, klt), hits, TTL.SCREEN_RESULT);
        await redis.set(KEY.META, { lastDate: today, lastTime: new Date().toISOString() });
      } catch (e) {
        console.error('Redis write failed:', e.message);
      }
    }

    const j = Number(body.j ?? DEFAULT_J);
    const tolerance = Number(body.tolerance ?? DEFAULT_TOLERANCE);
    const filtered = filterResults(hits, { jThreshold: j, tolerance, industries: [], excludeBoards: [] });

    return res.json({
      data: filtered,
      meta: { total: filtered.length, wideTotal: hits.length, scanDate: today, klt },
    });
  } catch (err) {
    console.error('scan error:', err);
    return res.status(500).json({ error: err.message });
  }
}
