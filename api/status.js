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
    const bulkProgress = await redis.get(KEY.BULK_PROGRESS);

    // legacy 模式扫描中
    const legacyScanning = !!(progress && progress.currentKlt && progress.idx < (progress.stocks?.length || 0));
    // 批量模式扫描中
    const bulkScanning = !!(bulkProgress && bulkProgress.phase && bulkProgress.phase !== 'done');

    const scanning = legacyScanning || bulkScanning;

    let scanProgress = null;
    if (bulkScanning) {
      scanProgress = {
        idx: bulkProgress.dateIdx || 0,
        total: bulkProgress.tradingDates?.length || 0,
        klt: bulkProgress.klt || 'daily',
      };
    } else if (legacyScanning) {
      scanProgress = {
        idx: progress?.idx || 0,
        total: progress?.stocks?.length || 0,
        klt: progress.currentKlt,
      };
    }

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

    // debug=1 返回 bulk:log 日志（替代已删除的 debug-log.js）
    if (req.query.debug === '1') {
      const logs = await redis.get('bulk:log');
      return res.json({
        lastDate: meta?.lastDate ?? null,
        lastTime: meta?.lastTime ?? null,
        scanning,
        progress: scanProgress,
        backtest,
        bulkProgress: bulkProgress || null,
        logs: logs || [],
      });
    }

    return res.json({
      lastDate: meta?.lastDate ?? null,
      lastTime: meta?.lastTime ?? null,
      scanning,
      progress: scanProgress,
      boards: MARKET_BOARDS.map(b => ({ code: b.code, name: b.name })),
      backtest,
    });
  } catch (err) {
    console.error('status error:', err);
    return res.status(500).json({ error: err.message });
  }
}
