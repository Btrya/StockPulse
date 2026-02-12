import { useState, useCallback, useEffect } from 'react';
import { fetchResults, triggerScan } from '../lib/api';

const DEFAULTS = { sectors: [], j: 0, tolerance: 2, klt: '101' };
const SCAN_CONCURRENCY = 3;

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
  // 先查缓存
  const cached = await fetchResults({ sector, ...params });
  if (cached.data && cached.data.length > 0) {
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

    // 分批扫描，每批 SCAN_CONCURRENCY 个板块
    for (let i = 0; i < sectorList.length; i += SCAN_CONCURRENCY) {
      const batch = sectorList.slice(i, i + SCAN_CONCURRENCY);
      const promises = batch.map(sector =>
        scanSector(sector, { j: p.j, tolerance: p.tolerance, klt: p.klt })
          .then(res => ({ sector, ...res }))
          .catch(err => ({ sector, data: [], meta: { error: err.message } }))
      );
      const batchResults = await Promise.all(promises);

      for (const r of batchResults) {
        if (r.data) allResults.push(...r.data);
        if (r.meta) {
          lastMeta = r.meta;
          if (r.meta.diag) allDiag.push({ sector: r.sector, ...r.meta.diag });
        }
      }

      setProgress({ done: Math.min(i + SCAN_CONCURRENCY, sectorList.length), total: sectorList.length });
      // 实时更新结果
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

  useEffect(() => {
    writeURL(params);
  }, [params]);

  const scan = useCallback(() => {
    if (params.sectors.length) query(params);
  }, [params, query]);

  return { params, setParams, results, meta, loading, progress, scan };
}
