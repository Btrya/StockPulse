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
      getThsHot(cnDate, '热股').catch(() => []),
      getThsHot(cnDate, '行业板块').catch(() => []),
      getThsHot(cnDate, '概念板块').catch(() => []),
    ]);

    // 如果全空（可能非交易日），往前探 5 天
    let hotStocks = hotStocksRaw;
    let hotIndustries = hotIndustriesRaw;
    let hotConcepts = hotConceptsRaw;

    if (!hotStocks.length && !hotIndustries.length && !hotConcepts.length) {
      for (let i = 1; i <= 5; i++) {
        const d = getCNDate(new Date(now.getTime() - i * 86400000)).replace(/-/g, '');
        const [s, ind, c] = await Promise.all([
          getThsHot(d, '热股').catch(() => []),
          getThsHot(d, '行业板块').catch(() => []),
          getThsHot(d, '概念板块').catch(() => []),
        ]);
        if (s.length || ind.length || c.length) {
          hotStocks = s;
          hotIndustries = ind;
          hotConcepts = c;
          break;
        }
      }
    }

    // 去重：ths_hot 返回多个时间快照，按 ts_code/ts_name 去重保留最新（最高 hot 值）
    const dedupe = (arr, keyFn) => {
      const map = new Map();
      for (const r of arr) {
        const k = keyFn(r);
        if (!k) continue;
        const prev = map.get(k);
        if (!prev || r.hot > prev.hot) map.set(k, r);
      }
      return [...map.values()].sort((a, b) => a.rank - b.rank);
    };

    const data = {
      hotStocks: dedupe(hotStocks, r => r.ts_code).map(r => ({ ts_code: r.ts_code, name: r.ts_name, rank: r.rank, hot: r.hot })),
      hotIndustries: dedupe(hotIndustries, r => r.ts_name).map(r => ({ name: r.ts_name, rank: r.rank, hot: r.hot })),
      hotConcepts: dedupe(hotConcepts, r => r.ts_name).map(r => ({ name: r.ts_name, rank: r.rank, hot: r.hot })),
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
