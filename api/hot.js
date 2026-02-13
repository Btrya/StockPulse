import * as redis from './_lib/redis.js';
import { KEY, TTL, getCNDate } from './_lib/constants.js';
import { getThsHot } from './_lib/tushare.js';

export default async function handler(req, res) {
  try {
    // 读缓存
    if (redis.isConfigured()) {
      try {
        const cached = await redis.get(KEY.HOT_DATA);
        if (cached) return res.json({ data: cached });
      } catch {}
    }

    // 取最近交易日日期（YYYYMMDD 格式）
    const now = new Date();
    const cnDate = getCNDate(now).replace(/-/g, '');

    // 并行请求三类热榜
    const [hotStocksRaw, hotIndustriesRaw, hotConceptsRaw] = await Promise.all([
      getThsHot(cnDate, 'A').catch(() => []),
      getThsHot(cnDate, 'HY').catch(() => []),
      getThsHot(cnDate, 'GN').catch(() => []),
    ]);

    // 如果全空（可能非交易日），往前探 5 天
    let hotStocks = hotStocksRaw;
    let hotIndustries = hotIndustriesRaw;
    let hotConcepts = hotConceptsRaw;

    if (!hotStocks.length && !hotIndustries.length && !hotConcepts.length) {
      for (let i = 1; i <= 5; i++) {
        const d = getCNDate(new Date(now.getTime() - i * 86400000)).replace(/-/g, '');
        const [s, ind, c] = await Promise.all([
          getThsHot(d, 'A').catch(() => []),
          getThsHot(d, 'HY').catch(() => []),
          getThsHot(d, 'GN').catch(() => []),
        ]);
        if (s.length || ind.length || c.length) {
          hotStocks = s;
          hotIndustries = ind;
          hotConcepts = c;
          break;
        }
      }
    }

    const data = {
      hotStocks: hotStocks.map(r => ({ ts_code: r.ts_code, name: r.name, rank: r.rank, hot: r.hot })),
      hotIndustries: hotIndustries.map(r => ({ name: r.name, rank: r.rank, hot: r.hot })),
      hotConcepts: hotConcepts.map(r => ({ name: r.name, rank: r.rank, hot: r.hot })),
    };

    // 写缓存
    if (redis.isConfigured()) {
      try { await redis.set(KEY.HOT_DATA, data, TTL.HOT_DATA); } catch {}
    }

    return res.json({ data });
  } catch (err) {
    console.error('hot error:', err);
    return res.status(500).json({ error: err.message });
  }
}
