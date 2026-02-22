import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchResults } from '../lib/api';
import { getLastTradingDate } from '../lib/date';

const DEFAULTS = { klt: 'daily', j: 0, tolerance: 2, industries: [], excludeBoards: [], concepts: [] };

function readURL() {
  const sp = new URLSearchParams(window.location.search);
  return {
    klt: sp.get('klt') || DEFAULTS.klt,
    j: Number(sp.get('j') ?? DEFAULTS.j),
    tolerance: Number(sp.get('tolerance') ?? DEFAULTS.tolerance),
    industries: sp.get('industries') ? sp.get('industries').split(',') : [],
    excludeBoards: sp.get('excludeBoards') ? sp.get('excludeBoards').split(',') : [],
    concepts: sp.get('concepts') ? sp.get('concepts').split(',') : [],
  };
}

function writeURL(params) {
  const sp = new URLSearchParams();
  if (params.klt !== DEFAULTS.klt) sp.set('klt', params.klt);
  if (params.j !== DEFAULTS.j) sp.set('j', String(params.j));
  if (params.tolerance !== DEFAULTS.tolerance) sp.set('tolerance', String(params.tolerance));
  if (params.industries.length) sp.set('industries', params.industries.join(','));
  if (params.excludeBoards.length) sp.set('excludeBoards', params.excludeBoards.join(','));
  if (params.concepts.length) sp.set('concepts', params.concepts.join(','));
  const qs = sp.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

export default function useScreener() {
  const [params, setParams] = useState(readURL);
  const [date, setDate] = useState(getLastTradingDate);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const initDone = useRef(false);

  const query = useCallback(async (p, d) => {
    setLoading(true);
    try {
      const res = await fetchResults({ ...p, date: d });
      setResults(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      console.error('Query failed:', err);
      setResults([]);
      setMeta({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  // URL 同步
  useEffect(() => {
    writeURL(params);
  }, [params]);

  // 页面加载自动查询
  useEffect(() => {
    if (!initDone.current) {
      initDone.current = true;
      query(readURL(), date);
    }
  }, [query, date]);

  const scan = useCallback(() => {
    query(params, date);
  }, [params, date, query]);

  return { params, setParams, date, setDate, results, meta, loading, scan };
}
