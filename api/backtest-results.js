import * as redis from './_lib/redis.js';
import { KEY, DEFAULT_J, DEFAULT_TOLERANCE, DEFAULT_KLT, MARKET_BOARDS } from './_lib/constants.js';
import { filterResults } from './_lib/screener.js';

// 与 backtest.js 保持一致
function snapToFriday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -2 : day === 6 ? -1 : 5 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  try {
    const rawDate = req.query.date;
    if (!rawDate) {
      return res.status(400).json({ error: '缺少 date 参数' });
    }

    const j = Number(req.query.j ?? DEFAULT_J);
    const tolerance = Number(req.query.tolerance ?? DEFAULT_TOLERANCE);
    const klt = req.query.klt || DEFAULT_KLT;
    const date = klt === 'weekly' ? snapToFriday(rawDate) : rawDate;
    const sort = req.query.sort || 'j';
    const order = req.query.order || 'asc';
    const industries = req.query.industries ? req.query.industries.split(',').filter(Boolean) : [];
    const excludeBoards = req.query.excludeBoards ? req.query.excludeBoards.split(',').filter(Boolean) : [];
    const concepts = req.query.concepts ? req.query.concepts.split(',').filter(Boolean) : [];

    if (!redis.isConfigured()) {
      return res.json({ data: [], meta: { error: 'Redis 未配置' } });
    }

    const raw = await redis.get(KEY.screenResult(date, klt));
    // 兼容新格式 { hits, scope } 和旧格式（纯数组）
    const data = Array.isArray(raw) ? raw : (raw?.hits || null);

    if (!data) {
      return res.json({
        data: [],
        meta: { total: 0, message: '暂无回测数据，请先执行回测', klt, date },
      });
    }

    // 动态附加 concepts
    try {
      const conceptsMap = await redis.get(KEY.CONCEPTS_MAP);
      if (conceptsMap) {
        for (const r of data) {
          r.concepts = conceptsMap[r.ts_code] || [];
        }
      }
    } catch {}

    const allIndustries = [...new Set(data.map(r => r.industry).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'zh-CN')
    );
    const allConcepts = [...new Set(data.flatMap(r => r.concepts || []))].sort(
      (a, b) => a.localeCompare(b, 'zh-CN')
    );

    const filtered = filterResults(data, { jThreshold: j, tolerance, industries, excludeBoards, concepts });

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
        scanDate: date,
        klt,
        industries: allIndustries,
        concepts: allConcepts,
        boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
      },
    });
  } catch (err) {
    console.error('backtest-results error:', err);
    return res.status(500).json({ error: err.message });
  }
}
