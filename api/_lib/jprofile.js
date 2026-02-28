// J-Profile：计算每只股票的历史超卖周期底部中位数（sensitiveJ）
import { kdjSeries } from './indicators.js';
import { getStockList, getDaily } from './tushare.js';
import * as redis from './redis.js';
import { KEY, TTL, TUSHARE_DELAY_MS } from './constants.js';

const OVERSOLD_THRESHOLD = 15;
const TIMEOUT_MS = 45000;

// 找出所有超卖周期（J < 20 → 持续 → 穿回 20）的底部值，返回统计
export function computeJProfile(jArr) {
  const bottoms = [];
  let inEpisode = false;
  let episodeMin = Infinity;

  for (let i = 0; i < jArr.length; i++) {
    if (jArr[i] < OVERSOLD_THRESHOLD) {
      if (!inEpisode) {
        inEpisode = true;
        episodeMin = jArr[i];
      } else if (jArr[i] < episodeMin) {
        episodeMin = jArr[i];
      }
    } else if (inEpisode) {
      bottoms.push(episodeMin);
      inEpisode = false;
      episodeMin = Infinity;
    }
  }
  // 末尾仍在超卖周期中，也算一个周期
  if (inEpisode) {
    bottoms.push(episodeMin);
  }

  if (bottoms.length === 0) return null;

  bottoms.sort((a, b) => a - b);
  const mid = Math.floor(bottoms.length / 2);
  const sensitiveJ = bottoms.length % 2 === 1
    ? bottoms[mid]
    : (bottoms[mid - 1] + bottoms[mid]) / 2;

  const sum = bottoms.reduce((s, v) => s + v, 0);

  return {
    sensitiveJ: Math.round(sensitiveJ * 100) / 100,
    meanJ: Math.round((sum / bottoms.length) * 100) / 100,
    episodeCount: bottoms.length,
    minJ: bottoms[0],
  };
}

// 遍历所有股票计算 jprofile，写入 Redis
export async function runJProfileScan({ startTime, today }) {
  let progress = await redis.get(KEY.JPROFILE_PROGRESS);

  if (!progress || progress.date !== today) {
    const stocks = (await getStockList()).filter(s => !s.name.includes('ST') && !s.name.includes('退'));
    progress = {
      date: today,
      idx: 0,
      total: stocks.length,
      tsCodes: stocks.map(s => s.ts_code),
      profileMap: {},
    };
    await redis.set(KEY.JPROFILE_PROGRESS, progress, TTL.PROGRESS);
  }

  const { tsCodes } = progress;
  let { idx, profileMap } = progress;
  let processed = 0;

  // 2 年回溯
  const start = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');

  while (idx < tsCodes.length) {
    if (Date.now() - startTime > TIMEOUT_MS) break;

    const tsCode = tsCodes[idx];
    try {
      const klines = await getDaily(tsCode, start);
      if (klines && klines.length >= 30) {
        const highs = klines.map(k => k.high);
        const lows = klines.map(k => k.low);
        const closes = klines.map(k => k.close);
        const jArr = kdjSeries(highs, lows, closes);
        const profile = computeJProfile(jArr);
        if (profile) {
          profileMap[tsCode] = profile.sensitiveJ;
        }
      }
    } catch {
      // 单只失败跳过
    }

    idx++;
    processed++;

    if (processed % 50 === 0) {
      progress.idx = idx;
      progress.profileMap = profileMap;
      await redis.set(KEY.JPROFILE_PROGRESS, progress, TTL.PROGRESS);
    }

    await new Promise(r => setTimeout(r, TUSHARE_DELAY_MS));
  }

  progress.idx = idx;
  progress.profileMap = profileMap;

  const done = idx >= tsCodes.length;

  if (done) {
    await redis.set(KEY.JPROFILE_MAP, profileMap, TTL.JPROFILE);
    await redis.del(KEY.JPROFILE_PROGRESS);
  } else {
    await redis.set(KEY.JPROFILE_PROGRESS, progress, TTL.PROGRESS);
  }

  return {
    done,
    processed,
    idx,
    total: tsCodes.length,
    profileCount: Object.keys(profileMap).length,
    elapsed: Date.now() - startTime,
  };
}
