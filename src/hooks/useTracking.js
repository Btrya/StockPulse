import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchTracking } from '../lib/api';
import { getLastTradingDate } from '../lib/date';

const DEFAULTS = { klt: 'daily', minDays: 2, j: 0, tolerance: 2, industries: [], excludeBoards: [], concepts: [], weeklyBull: false, weeklyLowJ: false, dailyLowJ: false, dynamicJ: false };

export default function useTracking() {
  const [params, setParams] = useState(DEFAULTS);
  const [date, setDate] = useState(getLastTradingDate);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const initDone = useRef(false);

  const query = useCallback(async (p, d) => {
    setLoading(true);
    try {
      const res = await fetchTracking({ ...p, date: d });
      setResults(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      console.error('Tracking query failed:', err);
      setResults([]);
      setMeta({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次激活时自动查询
  const activate = useCallback(() => {
    if (!initDone.current) {
      initDone.current = true;
      query(params, date);
    }
  }, [params, date, query]);

  // params/date 变化后自动查询（仅初始化完成后）
  useEffect(() => {
    if (initDone.current) {
      query(params, date);
    }
  }, [params, date, query]);

  const refresh = useCallback(() => {
    query(params, date);
  }, [params, date, query]);

  return { params, setParams, date, setDate, results, meta, loading, refresh, activate };
}
