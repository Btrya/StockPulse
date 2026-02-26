import { useState, useCallback, useRef, useMemo } from 'react';
import { triggerPostAnalysis, fetchPostAnalysisData } from '../lib/api';
import { simulateTrades, DEFAULT_STRATEGIES } from '../lib/simulate';

export default function usePostAnalysis(date, klt) {
  const [rawData, setRawData] = useState(null);
  const [strategies, setStrategies] = useState(DEFAULT_STRATEGIES);
  const [window, setWindow] = useState(30);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const timerRef = useRef(null);

  // core: strategies change → instant recalc, zero network
  const result = useMemo(
    () => simulateTrades(rawData, strategies),
    [rawData, strategies],
  );

  const start = useCallback(async (tsCodes, reset = false) => {
    if (!date || !tsCodes?.length) return;

    setLoading(true);
    setProgress(null);

    // try cache first
    if (!reset) {
      try {
        const cached = await fetchPostAnalysisData({ date, klt, window });
        if (cached.done && cached.data) {
          setRawData(cached.data);
          setLoading(false);
          return;
        }
      } catch { /* continue to trigger */ }
    }

    const poll = async () => {
      try {
        const res = await triggerPostAnalysis({ date, klt, window, tsCodes, reset });
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
              const status = await fetchPostAnalysisData({ date, klt, window });
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
    window, setWindow,
    loading, progress,
    trades: result.trades,
    stats: result.stats,
    start, cleanup,
  };
}
