import { useState, useCallback, useEffect } from 'react';
import { fetchResults, triggerScan } from '../lib/api';

const DEFAULTS = { sectors: [], j: 0, tolerance: 2, klt: '101' };

function readURL() {
  const sp = new URLSearchParams(window.location.search);
  const sectorStr = sp.get('sectors') || '';
  return {
    sectors: sectorStr ? sectorStr.split(',') : [],
    j: Number(sp.get('j') ?? DEFAULTS.j),
    tolerance: Number(sp.get('tolerance') ?? DEFAULTS.tolerance),
    klt: sp.get('klt') || DEFAULTS.klt,
  };
}

function writeURL(params) {
  const sp = new URLSearchParams();
  if (params.sectors.length) sp.set('sectors', params.sectors.join(','));
  if (params.j !== DEFAULTS.j) sp.set('j', String(params.j));
  if (params.tolerance !== DEFAULTS.tolerance) sp.set('tolerance', String(params.tolerance));
  if (params.klt !== DEFAULTS.klt) sp.set('klt', params.klt);
  const qs = sp.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

async function scanSector(sector, params) {
  // 先查缓存（判断 meta.cached 而非 data.length，过滤后为空也算命中）
  const cached = await fetchResults({ sector, ...params });
  if (cached.meta?.cached) {
    return cached;
  }
  // 无缓存则实时扫描
  return triggerScan({
    sector,
    j: params.j,
    tolerance: params.tolerance,
    klt: params.klt,
  });
}

export default function useScreener() {
  const [params, setParams] = useState(readURL);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }

  const query = useCallback(async (p) => {
    const sectorList = p.sectors;
    if (!sectorList.length) return;

    setLoading(true);
    setResults([]);
    setMeta(null);
    setProgress({ done: 0, total: sectorList.length });

    const allResults = [];
    const allDiag = [];
    let lastMeta = null;

    // 逐板块串行扫描，避免并发请求叠加被东方财富限流
    for (let i = 0; i < sectorList.length; i++) {
      const sector = sectorList[i];
      try {
        const r = await scanSector(sector, { j: p.j, tolerance: p.tolerance, klt: p.klt });
        if (r.data) allResults.push(...r.data);
        if (r.meta) {
          lastMeta = r.meta;
          if (r.meta.diag) allDiag.push({ sector, ...r.meta.diag });
        }
      } catch (err) {
        allDiag.push({ sector, error: err.message });
      }

      setProgress({ done: i + 1, total: sectorList.length });
      setResults([...allResults]);
    }

    setMeta({
      ...lastMeta,
      total: allResults.length,
      sectorCount: sectorList.length,
      diag: allDiag,
    });
    setProgress(null);
    setLoading(false);
  }, []);

  // URL 同步
  useEffect(() => {
    writeURL(params);
  }, [params]);

  // 页面加载时，如果 URL 带板块参数则自动查询
  const initRef = { current: false };
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      const initial = readURL();
      if (initial.sectors.length) query(initial);
    }
  }, [query]);

  const scan = useCallback(() => {
    if (params.sectors.length) query(params);
  }, [params, query]);

  return { params, setParams, results, meta, loading, progress, scan };
}
