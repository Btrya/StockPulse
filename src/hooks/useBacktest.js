import { useState, useCallback, useRef } from 'react';
import { triggerBacktest, fetchBacktestResults } from '../lib/api';

const DEFAULTS = {
  klt: 'daily', j: 0, tolerance: 2,
  industries: [], excludeBoards: [], concepts: [],
  dynamicJ: false,
  screenMode: 'band',
  // 反转客户端筛选参数
  maxGain: null, maxJ: null, arrangement: 'any',
  nearLine: false, redGtGreen: false, upperLeBody: false,
  weeklyBull: false, weeklyLowJ: false,
  // 入场条件（波段/砖型共用）
  closeAboveShort: false, hasVolumeDouble: false,
  hasShrinkingPullback: false, hasConsecutiveShrink: false,
  whiteBelowTwenty: false,
  onlyHot: false,
};

// 每种 screenMode 对应的后端 strategies/combinator
const _PM = {
  br: { strategies: ['brickReversal'], combinator: 'AND', line: 'short' },
  cl: { strategies: ['consecutiveLimitUp'], combinator: 'AND' },
};
const _MK = { brickReversal: 'br', consecutiveLimitUp: 'cl' };
function getPreset(params) {
  return _PM[_MK[params.screenMode]] || {};
}

export default function useBacktest() {
  const [params, setParams] = useState(DEFAULTS);
  const [date, setDate] = useState(null);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState(null);
  const [queue, setQueue] = useState([]);
  const timerRef = useRef(null);

  const queryResults = useCallback(async (d, p) => {
    setLoading(true);
    try {
      const preset = getPreset(p);
      const fetchParams = { date: d, ...p, ...preset };
      // 非波段模式下用宽阈值取全量，客户端再筛
      if (p.screenMode !== 'band') {
        fetchParams.j = 100;
        fetchParams.tolerance = 100;
      }
      const res = await fetchBacktestResults(fetchParams);
      setResults(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      console.error('Backtest results failed:', err);
      setResults([]);
      setMeta({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const startBacktest = useCallback(async (d, klt, reset) => {
    if (!d) return;

    // 入队场景：已有扫描在跑且不是强制重置
    if (scanning && !reset) {
      try {
        const res = await triggerBacktest({ date: d, klt });
        if (res.queued) {
          setQueue(res.queue || []);
          return { queued: true, queue: res.queue };
        }
      } catch (err) {
        console.error('Enqueue failed:', err);
        return { error: err.message };
      }
    }

    setScanning(true);
    setScanInfo(null);
    setResults([]);
    setMeta(null);
    setQueue([]);

    let effectiveDate = d;

    const poll = async () => {
      try {
        const res = await triggerBacktest({ date: d, klt, reset });
        setScanInfo(res);
        setQueue(res.queue || []);

        // 后端可能调整了日期（周线自动对齐到周五）
        if (res.adjustedDate) {
          effectiveDate = res.adjustedDate;
          setDate(effectiveDate);
        }

        // 每轮 poll 后静默获取中间结果，实时渲染已筛出数据
        try {
          const preset = getPreset(params);
          const fetchParams = {
            date: effectiveDate, klt,
            j: params.j, tolerance: params.tolerance,
            industries: params.industries, excludeBoards: params.excludeBoards,
            concepts: params.concepts, dynamicJ: params.dynamicJ,
            ...preset,
          };
          if (params.screenMode !== 'band') {
            fetchParams.j = 100;
            fetchParams.tolerance = 100;
          }
          if (params.closeAboveShort) fetchParams.closeAboveShort = true;
          if (params.hasVolumeDouble) fetchParams.hasVolumeDouble = true;
          if (params.hasShrinkingPullback) fetchParams.hasShrinkingPullback = true;
          if (params.hasConsecutiveShrink) fetchParams.hasConsecutiveShrink = true;
          if (params.whiteBelowTwenty) fetchParams.whiteBelowTwenty = true;
          const mid = await fetchBacktestResults(fetchParams);
          if (mid.data?.length) {
            setResults(mid.data);
            setMeta(mid.meta || null);
          }
        } catch { /* ignore intermediate fetch errors */ }

        if (res.needContinue) {
          timerRef.current = setTimeout(poll, 500);
        } else {
          setScanning(false);
          setScanInfo(null);
          setQueue([]);
          queryResults(effectiveDate, params);
        }
      } catch (err) {
        console.error('Backtest failed:', err);
        setScanning(false);
        setScanInfo(null);
        setQueue([]);
      }
    };

    poll();
  }, [scanning, queryResults, params]);

  const refresh = useCallback(() => {
    if (date) {
      queryResults(date, params);
    }
  }, [date, params, queryResults]);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    params, setParams,
    date, setDate,
    results, meta, loading,
    scanning, scanInfo, queue,
    startBacktest, refresh, cleanup,
  };
}
