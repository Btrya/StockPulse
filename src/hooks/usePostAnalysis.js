import { useState, useCallback, useRef, useMemo } from 'react';
import { triggerPostAnalysis, fetchPostAnalysisData } from '../lib/api';
import { simulateTrades, DEFAULT_STRATEGIES, DEFAULT_FILTERS } from '../lib/simulate';

// 与后端 hashCodes 相同算法
function hashCodes(tsCodes) {
  const str = tsCodes.map(t => t.tsCode || t).sort().join(',');
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export default function usePostAnalysis(date, klt, externalFilters) {
  const [rawData, setRawData] = useState(null);
  const [strategies, setStrategies] = useState(DEFAULT_STRATEGIES);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [window, setWindow] = useState(30);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const timerRef = useRef(null);
  const lastCodesRef = useRef(null);

  // 使用外部 filters（来自 BacktestPanel 入场条件），如果提供的话
  const effectiveFilters = externalFilters || filters;

  // core: strategies/filters change → instant recalc, zero network
  const result = useMemo(
    () => simulateTrades(rawData, strategies, effectiveFilters),
    [rawData, strategies, effectiveFilters],
  );

  const start = useCallback(async (tsCodes, reset = false) => {
    if (!date || !tsCodes?.length) return;

    const codesHash = hashCodes(tsCodes);

    // auto-reset if stock list changed since last analysis
    if (lastCodesRef.current && lastCodesRef.current !== codesHash) {
      reset = true;
    }
    lastCodesRef.current = codesHash;

    setLoading(true);
    setProgress(null);

    // try cache first
    if (!reset) {
      try {
        const cached = await fetchPostAnalysisData({ date, klt, window, codesHash });
        if (cached.done && cached.data) {
          setRawData(cached.data);
          setLoading(false);
          return;
        }
      } catch { /* continue to trigger */ }
    }

    const poll = async () => {
      try {
        const res = await triggerPostAnalysis({ date, klt, window, tsCodes, reset, codesHash });
        reset = false; // only reset on first call, not subsequent polls
        setProgress(res.done ? null : { idx: res.idx, total: res.total });

        if (res.done && res.data) {
          setRawData(res.data);
          setLoading(false);
          return;
        }

        if (!res.done) {
          // poll data endpoint for progress
          timerRef.current = setTimeout(async () => {
            try {
              const status = await fetchPostAnalysisData({ date, klt, window, codesHash });
              if (status.done && status.data) {
                setRawData(status.data);
                setProgress(null);
                setLoading(false);
                return;
              }
              setProgress(status.done ? null : { idx: status.idx, total: status.total });
            } catch { /* ignore */ }
            poll();
          }, 1500);
        }
      } catch (err) {
        console.error('PostAnalysis failed:', err);
        setLoading(false);
        setProgress(null);
      }
    };

    poll();
  }, [date, klt, window]);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    rawData,
    strategies, setStrategies,
    filters: effectiveFilters, setFilters,
    window, setWindow,
    loading, progress,
    trades: result.trades,
    stats: result.stats,
    start, cleanup,
  };
}
