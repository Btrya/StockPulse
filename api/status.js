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

    // 回测进度（兼容原逻辑和批量模式）
    const btProgress = await redis.get(KEY.BACKTEST_PROGRESS);
    const btActive = !!(btProgress && (btProgress.stocks || btProgress.phase));

    let backtest = null;
    if (btActive) {
      if (btProgress.phase) {
        // 批量模式
        backtest = {
          date: btProgress.date,
          klt: btProgress.klt,
          idx: btProgress.dateIdx || 0,
          total: btProgress.tradingDates?.length || 0,
          queue: btProgress.queue || [],
        };
      } else {
        // 原逻辑
        backtest = {
          date: btProgress.date,
          klt: btProgress.klt,
          idx: btProgress.idx || 0,
          total: btProgress.stocks?.length || 0,
          queue: btProgress.queue || [],
        };
      }
    }

    return res.json({
      lastDate: meta?.lastDate ?? null,
      lastTime: meta?.lastTime ?? null,
      scanning,
      progress: scanning ? { idx, total, klt: progress.currentKlt } : null,
      boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
      backtest,
    });
  } catch (err) {
    console.error('status error:', err);
    return res.status(500).json({ error: err.message });
  }
}
