import { useState, useCallback, useRef } from 'react';
import { triggerBacktest, fetchBacktestResults } from '../lib/api';

const DEFAULTS = { klt: 'daily', j: 0, tolerance: 2, industries: [], excludeBoards: [], concepts: [] };

export default function useBacktest() {
  const [params, setParams] = useState(DEFAULTS);
  const [date, setDate] = useState(null);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState(null);
  const timerRef = useRef(null);

  const queryResults = useCallback(async (d, p) => {
    setLoading(true);
    try {
      const res = await fetchBacktestResults({ date: d, ...p });
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
    setScanning(true);
    setScanInfo(null);
    setResults([]);
    setMeta(null);

    let effectiveDate = d;

    const poll = async () => {
      try {
        const res = await triggerBacktest({ date: d, klt, reset });
        setScanInfo(res);

        // 后端可能调整了日期（周线自动对齐到周五）
        if (res.adjustedDate) {
          effectiveDate = res.adjustedDate;
          setDate(effectiveDate);
        }

        if (res.needContinue) {
          timerRef.current = setTimeout(poll, 500);
        } else {
          setScanning(false);
          setScanInfo(null);
          queryResults(effectiveDate, { klt, j: params.j, tolerance: params.tolerance, industries: params.industries, excludeBoards: params.excludeBoards, concepts: params.concepts });
        }
      } catch (err) {
        console.error('Backtest failed:', err);
        setScanning(false);
        setScanInfo(null);
      }
    };

    poll();
  }, [queryResults, params]);

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
    scanning, scanInfo,
    startBacktest, refresh, cleanup,
  };
}
