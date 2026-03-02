import * as redis from './_lib/redis.js';
import { KEY, TTL, DEFAULT_J, DEFAULT_TOLERANCE, DEFAULT_KLT, MARKET_BOARDS, getCNDate, isMarketClosed, snapToFriday } from './_lib/constants.js';
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
    const weeklyBull = req.query.weeklyBull === '1';
    const weeklyLowJ = req.query.weeklyLowJ === '1';
    const dailyLowJ = req.query.dailyLowJ === '1';
    const closeAboveShort = req.query.closeAboveShort === '1';
    const hasVolumeDouble = req.query.hasVolumeDouble === '1';
    const hasShrinkingPullback = req.query.hasShrinkingPullback === '1';
    const hasConsecutiveShrink = req.query.hasConsecutiveShrink === '1';
    const whiteBelowTwenty = req.query.whiteBelowTwenty === '1';
    const dynamicJ = req.query.dynamicJ === '1';

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
    let conceptsMap = null;
    if (redis.isConfigured()) {
      try {
        conceptsMap = await redis.get(KEY.CONCEPTS_MAP);
        if (conceptsMap && data && data.length) {
          for (const r of data) {
            r.concepts = conceptsMap[r.ts_code] || [];
          }
        }
      } catch {}
    }

    // 注入 sensitiveJ（动态 J 值）
    if (redis.isConfigured() && data && data.length) {
      try {
        const jProfileMap = await redis.get(KEY.JPROFILE_MAP);
        if (jProfileMap) {
          for (const r of data) {
            r.sensitiveJ = jProfileMap[r.ts_code] ?? null;
          }
        }
      } catch {}
    }

    // 跨周期附加：日线 ↔ 周线互查
    if (data && data.length && redis.isConfigured()) {
      try {
        if (klt === 'daily') {
          const friday = snapToFriday(scanDate);
          const weeklyData = await redis.get(KEY.screenResult(friday, 'weekly'));
          if (weeklyData && weeklyData.length) {
            const weeklyMap = new Map(weeklyData.map(w => [w.ts_code, w]));
            for (const r of data) {
              const w = weeklyMap.get(r.ts_code);
              r.weeklyBull = w ? w.shortTrend > w.bullBear : null;
              r.weeklyJ = w ? w.j : null;
            }
          }
        } else if (klt === 'weekly') {
          // 周线模式：读日线数据附加 dailyJ
          const dailyData = await redis.get(KEY.screenResult(scanDate, 'daily'));
          if (dailyData && dailyData.length) {
            const dailyMap = new Map(dailyData.map(d => [d.ts_code, d]));
            for (const r of data) {
              const d = dailyMap.get(r.ts_code);
              r.dailyJ = d ? d.j : null;
            }
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

    // 提取所有概念（优先从 data 中提取，fallback 到 conceptsMap 的所有值）
    let allConcepts;
    if (data && data.length) {
      allConcepts = [...new Set(data.flatMap(r => r.concepts || []))].sort(
        (a, b) => a.localeCompare(b, 'zh-CN')
      );
    } else if (conceptsMap) {
      allConcepts = [...new Set(Object.values(conceptsMap).flat())].sort(
        (a, b) => a.localeCompare(b, 'zh-CN')
      );
    } else {
      allConcepts = [];
    }

    if (!data) {
      return res.json({
        data: [],
        meta: {
          total: 0,
          cached: false,
          message: '暂无扫描数据，请等待定时任务执行或手动触发扫描',
          industries: allIndustries,
          concepts: allConcepts,
          boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
        },
      });
    }

    const filtered = filterResults(data, { jThreshold: j, tolerance, industries, excludeBoards, concepts, strategies, combinator, line, weeklyBull, weeklyLowJ, dailyLowJ, dynamicJ, closeAboveShort, hasVolumeDouble, hasShrinkingPullback, hasConsecutiveShrink, whiteBelowTwenty });

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
