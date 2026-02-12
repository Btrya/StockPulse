import * as redis from './_lib/redis.js';
import { KEY, TTL, DEFAULT_J, DEFAULT_TOLERANCE, DEFAULT_KLT, MARKET_BOARDS } from './_lib/constants.js';
import { filterResults } from './_lib/screener.js';

// 获取行业列表（优先 Redis 缓存，fallback Tushare）
async function getIndustries() {
  const CACHE_KEY = 'industries:list';
  if (redis.isConfigured()) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return cached;
    } catch {}
  }

  // 从 Tushare 拉股票列表提取行业
  const { getStockList } = await import('./_lib/tushare.js');
  const stocks = await getStockList();
  const industries = [...new Set(stocks.map(s => s.industry).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'zh-CN')
  );

  // 缓存 24h
  if (redis.isConfigured()) {
    try { await redis.set(CACHE_KEY, industries, TTL.STOCKS); } catch {}
  }
  return industries;
}

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

    // 尝试从 Redis 读取扫描结果
    let data = null;
    let scanDate = null;

    if (redis.isConfigured()) {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      try {
        data = await redis.get(KEY.screenResult(today, klt));
        scanDate = today;
        if (!data) {
          data = await redis.get(KEY.screenResult(yesterday, klt));
          scanDate = yesterday;
        }
      } catch (redisErr) {
        console.error('Redis read failed:', redisErr.message);
      }
    }

    // 无论有没有扫描结果，都拿行业列表
    let allIndustries;
    if (data && data.length) {
      allIndustries = [...new Set(data.map(r => r.industry).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, 'zh-CN')
      );
    } else {
      try {
        allIndustries = await getIndustries();
      } catch (err) {
        console.error('Failed to get industries:', err.message);
        allIndustries = [];
      }
    }

    if (!data) {
      return res.json({
        data: [],
        meta: {
          total: 0,
          cached: false,
          message: '暂无扫描数据，请等待定时任务执行或手动触发扫描',
          industries: allIndustries,
          boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
        },
      });
    }

    const filtered = filterResults(data, { jThreshold: j, tolerance, industries, excludeBoards });

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
