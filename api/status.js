import * as redis from './_lib/redis.js';
import { KEY } from './_lib/constants.js';

export default async function handler(req, res) {
  try {
    if (!redis.isConfigured()) {
      return res.json({ lastDate: null, lastTime: null, scanning: false, progress: null });
    }

    const meta = await redis.get(KEY.META);
    const progress = await redis.get(KEY.PROGRESS);

    const scanning = !!(progress && progress.current);
    const remaining = progress?.queue?.length ?? 0;

    return res.json({
      lastDate: meta?.lastDate ?? null,
      lastTime: meta?.lastTime ?? null,
      scanning,
      remaining,
      current: progress?.current ?? null,
    });
  } catch (err) {
    console.error('status error:', err);
    return res.status(500).json({ error: err.message });
  }
}
