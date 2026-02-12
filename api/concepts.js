import { getThsConceptList, getThsMembers } from './_lib/tushare.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL, TUSHARE_DELAY_MS } from './_lib/constants.js';

const TIMEOUT_MS = 55000;

export default async function handler(req, res) {
  // GET: Vercel cron 触发（需 CRON_SECRET）
  // POST: 前端手动触发
  if (req.method === 'GET') {
    const auth = req.headers.authorization;
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    if (!redis.isConfigured()) {
      return res.json({ error: 'Redis 未配置' });
    }

    // 读取断点元数据
    let meta = await redis.get(KEY.CONCEPTS_META);

    // 获取概念列表
    let conceptList;
    if (meta && meta.conceptList) {
      conceptList = meta.conceptList;
    } else {
      conceptList = await getThsConceptList();
      meta = { conceptList, idx: 0, map: {} };
      await redis.set(KEY.CONCEPTS_META, meta, TTL.CONCEPTS);
    }

    let idx = meta.idx || 0;
    const map = meta.map || {}; // { stock_ts_code: [concept_name, ...] }
    let processed = 0;

    while (idx < conceptList.length) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const concept = conceptList[idx];
      try {
        const members = await getThsMembers(concept.ts_code);
        for (const m of members) {
          // m.code 是纯数字代码，需要映射到 ts_code 格式
          const code = m.code;
          if (!code) continue;
          // 构造 ts_code：6开头的是上海(.SH)，其余深圳(.SZ)
          const tsCode = code.startsWith('6') ? `${code}.SH` : `${code}.SZ`;
          if (!map[tsCode]) map[tsCode] = [];
          if (!map[tsCode].includes(concept.name)) {
            map[tsCode].push(concept.name);
          }
        }
      } catch {
        // 单个概念失败跳过
      }

      idx++;
      processed++;

      // 每 20 个概念保存一次断点
      if (processed % 20 === 0) {
        meta.idx = idx;
        meta.map = map;
        await redis.set(KEY.CONCEPTS_META, meta, TTL.CONCEPTS);
      }

      await new Promise(r => setTimeout(r, TUSHARE_DELAY_MS));
    }

    // 保存进度
    meta.idx = idx;
    meta.map = map;
    await redis.set(KEY.CONCEPTS_META, meta, TTL.CONCEPTS);

    const done = idx >= conceptList.length;

    if (done) {
      // 写入最终映射表
      await redis.set(KEY.CONCEPTS_MAP, map, TTL.CONCEPTS);
      // 清理断点元数据
      await redis.del(KEY.CONCEPTS_META);
    }

    return res.json({
      processed,
      total: conceptList.length,
      idx,
      stocks: Object.keys(map).length,
      elapsed: Date.now() - startTime,
      done,
      needContinue: !done,
    });
  } catch (err) {
    console.error('concepts error:', err);
    return res.status(500).json({ error: err.message });
  }
}
