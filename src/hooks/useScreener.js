import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchResults, triggerScan } from '../lib/api';

const DEFAULTS = { sector: '', j: 0, tolerance: 2, klt: '101' };

function readURL() {
  const sp = new URLSearchParams(window.location.search);
  return {
    sector: sp.get('sector') || DEFAULTS.sector,
    j: Number(sp.get('j') ?? DEFAULTS.j),
    tolerance: Number(sp.get('tolerance') ?? DEFAULTS.tolerance),
    klt: sp.get('klt') || DEFAULTS.klt,
  };
}

function writeURL(params) {
  const sp = new URLSearchParams();
  if (params.sector) sp.set('sector', params.sector);
  if (params.j !== DEFAULTS.j) sp.set('j', String(params.j));
  if (params.tolerance !== DEFAULTS.tolerance) sp.set('tolerance', String(params.tolerance));
  if (params.klt !== DEFAULTS.klt) sp.set('klt', params.klt);
  const qs = sp.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

export default function useScreener() {
  const [params, setParams] = useState(readURL);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  const query = useCallback(async (p) => {
    if (!p.sector) return;
    setLoading(true);
    try {
      // 先尝试缓存
      const cached = await fetchResults(p);
      if (cached.data && cached.data.length > 0) {
        setResults(cached.data);
        setMeta(cached.meta);
        return;
      }
      // 无缓存则触发扫描
      const scanned = await triggerScan({
        sector: p.sector,
        j: p.j,
        tolerance: p.tolerance,
        klt: p.klt,
      });
      setResults(scanned.data || []);
      setMeta(scanned.meta || null);
    } catch (err) {
      console.error('Query failed:', err);
      setResults([]);
      setMeta({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  // 参数变化时同步 URL（不自动触发查询，改为手动点筛选）
  useEffect(() => {
    writeURL(params);
  }, [params]);

  const scan = useCallback(() => {
    if (params.sector) query(params);
  }, [params, query]);

  return { params, setParams, results, meta, loading, scan };
}
