import * as redis from './_lib/redis.js';
import { KEY, MARKET_BOARDS } from './_lib/constants.js';

export default async function handler(req, res) {
  try {
    if (!redis.isConfigured()) {
      return res.json({
        lastDate: null,
        lastTime: null,
        scanning: false,
        boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
      });
    }

    const meta = await redis.get(KEY.META);
    const progress = await redis.get(KEY.PROGRESS);

    const scanning = !!(progress && progress.currentKlt && progress.idx < (progress.stocks?.length || 0));
    const total = progress?.stocks?.length || 0;
    const idx = progress?.idx || 0;

    return res.json({
      lastDate: meta?.lastDate ?? null,
      lastTime: meta?.lastTime ?? null,
      scanning,
      progress: scanning ? { idx, total, klt: progress.currentKlt } : null,
      boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
    });
  } catch (err) {
    console.error('status error:', err);
    return res.status(500).json({ error: err.message });
  }
}
