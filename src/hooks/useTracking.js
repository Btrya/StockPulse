import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchTracking } from '../lib/api';

const DEFAULTS = { klt: 'daily', minDays: 2, j: 0, tolerance: 2, industries: [], excludeBoards: [], concepts: [] };

export default function useTracking() {
  const [params, setParams] = useState(DEFAULTS);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const initDone = useRef(false);

  const query = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await fetchTracking(p);
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
      query(params);
    }
  }, [params, query]);

  const refresh = useCallback(() => {
    query(params);
  }, [params, query]);

  return { params, setParams, results, meta, loading, refresh, activate };
}
