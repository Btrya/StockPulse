import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchResults } from '../lib/api';

// 每个子策略的固定策略组合
const PRESETS = {
  brickReversal: {
    strategies: ['brickReversal', 'shortAboveBull', 'priceAboveLine'],
    combinator: 'AND',
  },
  consecutiveLimitUp: {
    strategies: ['consecutiveLimitUp'],
    combinator: 'AND',
  },
};

export default function useSwingTrade() {
  const [subTab, setSubTab] = useState('brickReversal');
  const [line, setLine] = useState('short');  // priceAboveLine 参数
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const initDone = useRef(false);

  const query = useCallback(async (preset, lineVal) => {
    setLoading(true);
    try {
      const res = await fetchResults({
        klt: 'daily',
        j: 100,         // 不限 J 值（砖型反转自带判断）
        tolerance: 100,  // 不限偏离（priceAboveLine 取代偏离判断）
        strategies: preset.strategies,
        combinator: preset.combinator,
        line: lineVal,
      });
      setResults(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      console.error('SwingTrade query failed:', err);
      setResults([]);
      setMeta({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    const preset = PRESETS[subTab];
    if (preset) query(preset, line);
  }, [subTab, line, query]);

  // subTab 或 line 变化时自动查询
  useEffect(() => {
    if (!initDone.current) {
      initDone.current = true;
    }
    const preset = PRESETS[subTab];
    if (preset) query(preset, line);
  }, [subTab, line, query]);

  return {
    subTab, setSubTab,
    line, setLine,
    results, meta, loading,
    refresh,
  };
}
