import { getSectors, getSectorStocks, batchGetKlines } from './_lib/eastmoney.js';
import { screenStock } from './_lib/screener.js';
import * as redis from './_lib/redis.js';
import { KEY, TTL } from './_lib/constants.js';

const TIMEOUT_MS = 50000; // 留 10s 余量

export default async function handler(req, res) {
  // 验证 CRON_SECRET
  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  let processed = 0;

  try {
    if (!redis.isConfigured()) {
      return res.json({ message: 'Redis not configured, skipping' });
    }

    // 获取板块列表
    let sectors = await redis.get(KEY.SECTORS);
    if (!sectors) {
      sectors = await getSectors();
      await redis.set(KEY.SECTORS, sectors, TTL.SECTORS);
    }

    // 读取进度
    let progress = await redis.get(KEY.PROGRESS);
    if (!progress || !progress.queue || progress.queue.length === 0) {
      // 初始化队列：过滤掉今天已扫描的板块
      const queue = [];
      for (const s of sectors) {
        const existing = await redis.get(KEY.scanResult(today, s.code));
        if (!existing) queue.push(s.code);
      }
      progress = { queue, current: null };
    }

    // 逐板块扫描，直到接近超时
    while (progress.queue.length > 0) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const sectorCode = progress.queue.shift();
      progress.current = sectorCode;
      await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);

      const stocks = await getSectorStocks(sectorCode);
      if (stocks.length === 0) {
        processed++;
        continue;
      }

      const withKlines = await batchGetKlines(stocks);
      const hits = withKlines.map(screenStock).filter(Boolean);

      await redis.set(KEY.scanResult(today, sectorCode), hits, TTL.SCAN_RESULT);
      processed++;
    }

    progress.current = null;
    await redis.set(KEY.PROGRESS, progress, TTL.PROGRESS);
    await redis.set(KEY.META, { lastDate: today, lastTime: new Date().toISOString() });

    return res.json({
      processed,
      remaining: progress.queue.length,
      elapsed: Date.now() - startTime,
    });
  } catch (err) {
    console.error('cron error:', err);
    return res.status(500).json({ error: err.message, processed });
  }
}
