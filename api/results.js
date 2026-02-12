import * as redis from './_lib/redis.js';
import { KEY, DEFAULT_J, DEFAULT_TOLERANCE, DEFAULT_KLT, MARKET_BOARDS } from './_lib/constants.js';
import { filterResults } from './_lib/screener.js';

export default async function handler(req, res) {
  try {
    const j = Number(req.query.j ?? DEFAULT_J);
    const tolerance = Number(req.query.tolerance ?? DEFAULT_TOLERANCE);
    const klt = req.query.klt || DEFAULT_KLT;
    const sort = req.query.sort || 'j';
    const order = req.query.order || 'asc';
    // 行业过滤（逗号分隔）
    const industries = req.query.industries ? req.query.industries.split(',').filter(Boolean) : [];
    // 排除板块（逗号分隔：gem,star,bse）
    const excludeBoards = req.query.excludeBoards ? req.query.excludeBoards.split(',').filter(Boolean) : [];

    if (!redis.isConfigured()) {
      return res.json({ data: [], meta: { total: 0, cached: false, message: 'Redis 未配置' } });
    }

    // 尝试今天和昨天的数据
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let data = null;
    let scanDate = today;
    try {
      data = await redis.get(KEY.screenResult(today, klt));
      if (!data) {
        data = await redis.get(KEY.screenResult(yesterday, klt));
        scanDate = yesterday;
      }
    } catch (redisErr) {
      console.error('Redis read failed:', redisErr.message);
      return res.json({ data: [], meta: { total: 0, cached: false } });
    }

    if (!data) {
      return res.json({ data: [], meta: { total: 0, cached: false, message: '暂无数据，请等待定时任务执行或手动触发扫描' } });
    }

    const filtered = filterResults(data, { jThreshold: j, tolerance, industries, excludeBoards });

    filtered.sort((a, b) => {
      const va = a[sort] ?? 0;
      const vb = b[sort] ?? 0;
      return order === 'asc' ? va - vb : vb - va;
    });

    // 提取行业列表供前端筛选用
    const allIndustries = [...new Set(data.map(r => r.industry).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'zh-CN')
    );

    return res.json({
      data: filtered,
      meta: {
        total: filtered.length,
        wideTotal: data.length,
        scanDate,
        klt,
        cached: true,
        industries: allIndustries,
        boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
      },
    });
  } catch (err) {
    console.error('results error:', err);
    return res.status(500).json({ error: err.message });
  }
}
