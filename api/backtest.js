import { getStockList } from './_lib/tushare.js';
import { screenStock } from './_lib/screener.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL } from './_lib/constants.js';

const TIMEOUT_MS = 50000;

// 将日期调整到该周的周五（周线数据以周五为基准）
function snapToFriday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
  const diff = day === 0 ? -2 : day === 6 ? -1 : 5 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// 比较两个排序后的数组是否相等
function arrEq(a, b) {
  const sa = (a || []).slice().sort();
  const sb = (b || []).slice().sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

function scopeMatch(s1, s2) {
  return arrEq(s1.industries, s2.industries)
    && arrEq(s1.concepts, s2.concepts)
    && arrEq(s1.codes, s2.codes);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const body = req.body || {};
  const { date: rawDate, klt = 'daily', industries, concepts, codes, reset } = body;

  if (!rawDate) {
    return res.status(400).json({ error: '缺少 date 参数' });
  }

  // 周线回测：自动调整到该周周五
  const date = klt === 'weekly' ? snapToFriday(rawDate) : rawDate;

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    // 规范化 scope
    const scope = {
      industries: (industries || []).slice().sort(),
      concepts: (concepts || []).slice().sort(),
      codes: (codes || []).slice().sort(),
    };

    // 检查缓存 — scope 必须匹配
    if (!reset) {
      const cached = await redis.get(KEY.backtestResult(date, klt));
      if (cached && cached.hits && scopeMatch(cached.scope || {}, scope)) {
        const hits = cached.hits;
        return res.json({ processed: hits.length, total: hits.length, idx: hits.length, done: true, needContinue: false, hits: hits.length });
      }
    }

    // 读取进度（独立于日常扫描）
    let progress = await redis.get(KEY.BACKTEST_PROGRESS);

    const forceReset = reset === true;
    let needNew = forceReset || !progress || progress.date !== date || progress.klt !== klt || !progress.stocks;

    // scope 变化也需要重建
    if (!needNew && progress) {
      if (!scopeMatch(progress.scope || {}, scope)) needNew = true;
    }

    if (needNew) {
      let stocks = await getStockList();
      stocks = stocks.filter(s => !s.name.includes('ST') && !s.name.includes('退'));

      // 按股票代码过滤（优先级最高，指定了代码就只扫这些）
      if (scope.codes.length) {
        stocks = stocks.filter(s => {
          const code = s.ts_code.split('.')[0];
          return scope.codes.some(c => c === s.ts_code || c === code);
        });
      } else {
        // 按行业缩小范围
        if (scope.industries.length) {
          stocks = stocks.filter(s => scope.industries.includes(s.industry));
        }

        // 按概念缩小范围
        if (scope.concepts.length) {
          const conceptsMap = await redis.get(KEY.CONCEPTS_MAP);
          if (conceptsMap) {
            stocks = stocks.filter(s => {
              const sc = conceptsMap[s.ts_code] || [];
              return scope.concepts.some(c => sc.includes(c));
            });
          }
        }
      }

      progress = {
        date,
        klt,
        stocks,
        idx: 0,
        hits: [],
        scope,
      };
      await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
    }

    let idx = progress.idx || 0;
    const hits = progress.hits || [];
    let processed = 0;

    const endDate = date.replace(/-/g, '');
    const lookbackDays = klt === 'weekly' ? 900 : 280;
    const startMs = new Date(date).getTime() - lookbackDays * 86400000;
    const startDate = new Date(startMs).toISOString().slice(0, 10).replace(/-/g, '');

    const { getDailyRange, getWeeklyRange } = await import('./_lib/tushare.js');
    const fn = klt === 'weekly' ? getWeeklyRange : getDailyRange;

    while (idx < progress.stocks.length) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const stock = progress.stocks[idx];
      try {
        const klines = await fn(stock.ts_code, startDate, endDate);
        const result = screenStock({ ...stock, klines });
        if (result) hits.push(result);
      } catch { /* skip */ }

      idx++;
      processed++;

      if (processed % 50 === 0) {
        progress.idx = idx;
        progress.hits = hits;
        await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
      }

      await new Promise(r => setTimeout(r, 150));
    }

    progress.idx = idx;
    progress.hits = hits;

    const done = idx >= progress.stocks.length;

    if (done) {
      await redis.set(KEY.backtestResult(date, klt), { hits, scope }, TTL.BACKTEST_RESULT);
      await redis.del(KEY.BACKTEST_PROGRESS);
    } else {
      await redis.set(KEY.BACKTEST_PROGRESS, progress, TTL.PROGRESS);
    }

    return res.json({
      processed,
      total: progress.stocks.length,
      idx,
      hits: hits.length,
      done,
      needContinue: !done,
      adjustedDate: date !== rawDate ? date : undefined,
    });
  } catch (err) {
    console.error('backtest error:', err);
    return res.status(500).json({ error: err.message });
  }
}
