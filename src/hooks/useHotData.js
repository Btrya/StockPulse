import { useState, useEffect } from 'react';
import { fetchHotData } from '../lib/api';

export default function useHotData() {
  const [hotData, setHotData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    fetchHotData()
      .then(res => { if (!stale) setHotData(res.data); })
      .catch(err => console.error('热榜加载失败:', err))
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, []);

  return { hotData, loading };
}

export function buildHotSets(hotData) {
  if (!hotData) return null;
  return {
    stocks: new Set((hotData.hotStocks || []).map(s => s.ts_code)),
    industries: new Set((hotData.hotIndustries || []).map(s => s.name)),
    concepts: new Set((hotData.hotConcepts || []).map(s => s.name)),
  };
}

export function getHotReasons(stock, hotSets) {
  if (!hotSets) return [];
  const reasons = [];
  if (hotSets.stocks.has(stock.ts_code)) reasons.push('热股');
  if (stock.industry && hotSets.industries.has(stock.industry)) reasons.push('热门行业');
  const concepts = stock.concepts || [];
  if (concepts.some(c => hotSets.concepts.has(c))) reasons.push('热门概念');
  return reasons;
}

// 生成带热门标记的 Select 选项，热门项排在前面按 rank 升序
export function buildHotOptions(items, hotList) {
  if (!items?.length) return [];
  const hotMap = new Map();
  if (hotList) {
    for (const h of hotList) {
      if (h.name && !hotMap.has(h.name)) hotMap.set(h.name, h.rank);
    }
  }
  return items
    .map(name => ({ label: hotMap.has(name) ? `🔥 ${name}` : name, value: name, rank: hotMap.get(name) ?? Infinity }))
    .sort((a, b) => a.rank - b.rank);
}
