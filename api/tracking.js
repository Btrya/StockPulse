import * as redis from './_lib/redis.js';
import { KEY, DEFAULT_J, DEFAULT_TOLERANCE, DEFAULT_KLT, MARKET_BOARDS, TRACKING_DAILY_WINDOW, TRACKING_WEEKLY_WINDOW } from './_lib/constants.js';
import { filterResults } from './_lib/screener.js';

export default async function handler(req, res) {
  try {
    const klt = req.query.klt || DEFAULT_KLT;
    const minDays = Number(req.query.minDays ?? 2);
    const j = Number(req.query.j ?? DEFAULT_J);
    const tolerance = Number(req.query.tolerance ?? DEFAULT_TOLERANCE);
    const industries = req.query.industries ? req.query.industries.split(',').filter(Boolean) : [];
    const excludeBoards = req.query.excludeBoards ? req.query.excludeBoards.split(',').filter(Boolean) : [];
    const concepts = req.query.concepts ? req.query.concepts.split(',').filter(Boolean) : [];

    if (!redis.isConfigured()) {
      return res.json({ data: [], meta: { error: 'Redis 未配置' } });
    }

    const window = klt === 'daily' ? TRACKING_DAILY_WINDOW : TRACKING_WEEKLY_WINDOW;

    // 读取 scan:dates，不足 window 条则探测 Redis key 补充
    let scanDates = await redis.get(KEY.scanDates(klt));
    if (!scanDates || scanDates.length < window) {
      const existing = new Set(scanDates || []);
      // 日线探 15 天（跨周末），周线探 40 天（跨月）
      const probeRange = klt === 'weekly' ? 40 : 15;
      for (let i = 0; i < probeRange; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        if (existing.has(d)) continue;
        const data = await redis.get(KEY.screenResult(d, klt));
        if (data) existing.add(d);
        if (existing.size >= window) break;
      }
      scanDates = [...existing].sort((a, b) => b.localeCompare(a));
    }

    if (!scanDates.length) {
      return res.json({
        data: [],
        meta: { scanDates: [], klt, industries: [], concepts: [], boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })) },
      });
    }

    // 取最近 window 个日期
    const dates = scanDates.slice(0, window);

    // 读取每个日期的筛选结果，用默认参数过滤确定"入选"
    const dateResults = {};
    for (const d of dates) {
      const raw = await redis.get(KEY.screenResult(d, klt));
      if (raw && raw.length) {
        dateResults[d] = filterResults(raw, {
          jThreshold: DEFAULT_J,
          tolerance: DEFAULT_TOLERANCE,
          industries: [],
          excludeBoards: [],
          concepts: [],
        });
      }
    }

    // 构建 { ts_code → [{date, j, result}] } 映射
    const stockMap = {};
    for (const d of dates) {
      const results = dateResults[d];
      if (!results) continue;
      for (const r of results) {
        if (!stockMap[r.ts_code]) stockMap[r.ts_code] = [];
        stockMap[r.ts_code].push({ date: d, j: r.j, result: r });
      }
    }

    // 识别连续出现的股票（日期必须相邻，不能断）
    const tracked = [];
    for (const [tsCode, entries] of Object.entries(stockMap)) {
      // 按日期降序排列（dates 已经是降序）
      const entryDates = entries.map(e => e.date);

      // 从最新日期开始，检查连续性
      let consecutiveDays = 0;
      for (let i = 0; i < dates.length; i++) {
        if (entryDates.includes(dates[i])) {
          consecutiveDays++;
        } else {
          break;
        }
      }

      if (consecutiveDays < minDays) continue;

      // 提取连续天的数据（按时间正序）
      const consecutiveEntries = [];
      for (let i = consecutiveDays - 1; i >= 0; i--) {
        const entry = entries.find(e => e.date === dates[i]);
        if (entry) consecutiveEntries.push(entry);
      }

      const jTrend = consecutiveEntries.map(e => e.j);
      const latestJ = jTrend[jTrend.length - 1];
      const firstJ = jTrend[0];
      const jDirection = latestJ > firstJ ? 'rising' : latestJ < firstJ ? 'falling' : 'flat';

      tracked.push({
        ts_code: tsCode,
        code: consecutiveEntries[0].result.code,
        name: consecutiveEntries[0].result.name,
        industry: consecutiveEntries[0].result.industry,
        board: consecutiveEntries[0].result.board,
        consecutiveDays,
        dates: consecutiveEntries.map(e => e.date.slice(5)), // MM-DD
        jTrend,
        jDirection,
        latest: consecutiveEntries[consecutiveEntries.length - 1].result,
      });
    }

    // 动态附加 concepts
    let conceptsMap = null;
    try { conceptsMap = await redis.get(KEY.CONCEPTS_MAP); } catch {}
    if (conceptsMap) {
      for (const t of tracked) {
        t.latest.concepts = conceptsMap[t.ts_code] || [];
      }
    }

    // 用用户参数二次过滤（基于 latest）
    const userFiltered = tracked.filter(t => {
      const r = t.latest;
      if (r.j >= j) return false;
      if (excludeBoards.length && excludeBoards.includes(r.board)) return false;
      if (industries.length && !industries.includes(r.industry)) return false;
      if (concepts.length) {
        const rc = r.concepts || [];
        if (!concepts.some(c => rc.includes(c))) return false;
      }
      const nearShortLow = Math.abs(r.deviationShort) <= tolerance;
      const nearBullLow = Math.abs(r.deviationBull) <= tolerance;
      const nearShortHigh = Math.abs(r.deviationShortHigh ?? Infinity) <= tolerance;
      const nearBullHigh = Math.abs(r.deviationBullHigh ?? Infinity) <= tolerance;
      return nearShortLow || nearBullLow || nearShortHigh || nearBullHigh;
    });

    // 按 consecutiveDays 降序，同天数按 J 值升序
    userFiltered.sort((a, b) => b.consecutiveDays - a.consecutiveDays || a.latest.j - b.latest.j);

    // 提取行业和概念列表
    const allIndustries = [...new Set(tracked.map(t => t.industry).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'zh-CN')
    );
    const allConcepts = [...new Set(tracked.flatMap(t => t.latest.concepts || []))].sort(
      (a, b) => a.localeCompare(b, 'zh-CN')
    );

    return res.json({
      data: userFiltered,
      meta: {
        scanDates: dates,
        klt,
        industries: allIndustries,
        concepts: allConcepts,
        boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
      },
    });
  } catch (err) {
    console.error('tracking error:', err);
    return res.status(500).json({ error: err.message });
  }
}
