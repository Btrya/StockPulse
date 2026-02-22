import * as redis from './_lib/redis.js';
import { KEY, TTL, DEFAULT_J, DEFAULT_TOLERANCE, DEFAULT_KLT, MARKET_BOARDS, getCNDate, isMarketClosed } from './_lib/constants.js';
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
    // 概念过滤（逗号分隔，OR 逻辑）
    const concepts = req.query.concepts ? req.query.concepts.split(',').filter(Boolean) : [];
    // 策略组合
    const strategies = req.query.strategies ? req.query.strategies.split(',').filter(Boolean) : undefined;
    const combinator = req.query.combinator || undefined;
    const line = req.query.line || undefined;

    // 尝试从 Redis 读取扫描结果
    let data = null;
    let scanDate = null;
    const reqDate = req.query.date || null; // 用户指定日期

    if (redis.isConfigured()) {
      try {
        if (reqDate) {
          // 指定日期：直接读取，不自动探测
          data = await redis.get(KEY.screenResult(reqDate, klt));
          scanDate = reqDate;
        } else {
          const now = new Date();
          const today = getCNDate(now);
          const closed = isMarketClosed(now);

          if (closed) {
            // 收盘后：优先今天，降级往前找
            data = await redis.get(KEY.screenResult(today, klt));
            scanDate = today;
          }
          if (!data) {
            // 收盘前 or 今天没数据：往前找最近的交易日数据（跨周末/节假日）
            for (let i = 1; i <= 5; i++) {
              const d = getCNDate(new Date(now.getTime() - i * 86400000));
              data = await redis.get(KEY.screenResult(d, klt));
              if (data) { scanDate = d; break; }
            }
          }
        }
      } catch (redisErr) {
        console.error('Redis read failed:', redisErr.message);
      }
    }

    // 从 Redis 读概念映射，动态附加到每条结果（不依赖扫描时写入）
    if (data && data.length && redis.isConfigured()) {
      try {
        const conceptsMap = await redis.get(KEY.CONCEPTS_MAP);
        if (conceptsMap) {
          for (const r of data) {
            r.concepts = conceptsMap[r.ts_code] || [];
          }
        }
      } catch {}
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
          concepts: [],
          boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
        },
      });
    }

    // 提取所有概念（去重排序）
    const allConcepts = [...new Set(data.flatMap(r => r.concepts || []))].sort(
      (a, b) => a.localeCompare(b, 'zh-CN')
    );

    const filtered = filterResults(data, { jThreshold: j, tolerance, industries, excludeBoards, concepts, strategies, combinator, line });

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
        concepts: allConcepts,
        boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
      },
    });
  } catch (err) {
    console.error('results error:', err);
    return res.status(500).json({ error: err.message });
  }
}
