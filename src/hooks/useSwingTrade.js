import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { fetchResults } from '../lib/api';
import { getLastTradingDate } from '../lib/date';

// 每个子策略的固定策略组合
const PRESETS = {
  brickReversal: {
    strategies: ['brickReversal'],
    combinator: 'AND',
  },
  consecutiveLimitUp: {
    strategies: ['consecutiveLimitUp'],
    combinator: 'AND',
  },
};

export default function useSwingTrade() {
  const [subTab, setSubTab] = useState('brickReversal');
  const [line, setLine] = useState('short');
  const [date, setDate] = useState(getLastTradingDate);
  const [excludeBoards, setExcludeBoards] = useState([]);

  // 砖型反转筛选参数
  const [maxGain, setMaxGain] = useState(null);      // K线涨幅上限 %，null=不限
  const [maxJ, setMaxJ] = useState(null);             // J值上限，null=不限
  const [arrangement, setArrangement] = useState('any'); // 'any' | 'bull' | 'bear'
  const [nearLine, setNearLine] = useState(false);    // 触碰趋势线
  const [redGtGreen, setRedGtGreen] = useState(false); // 红砖 > 绿砖
  const [upperLeBody, setUpperLeBody] = useState(false); // 上影线≤实体
  const [weeklyBull, setWeeklyBull] = useState(false);   // 周线多头趋势
  const [weeklyLowJ, setWeeklyLowJ] = useState(false);  // 周线低位
  const [dynamicJ, setDynamicJ] = useState(false);      // 动态J值
  const [closeAboveShort, setCloseAboveShort] = useState(false);
  const [hasVolumeDouble, setHasVolumeDouble] = useState(false);
  const [hasShrinkingPullback, setHasShrinkingPullback] = useState(false);
  const [hasConsecutiveShrink, setHasConsecutiveShrink] = useState(false);
  const [whiteBelowTwenty, setWhiteBelowTwenty] = useState(false);

  const [rawResults, setRawResults] = useState([]);   // 后端原始结果
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const initDone = useRef(false);

  const query = useCallback(async (preset, lineVal, dateVal, boards) => {
    setLoading(true);
    try {
      const res = await fetchResults({
        date: dateVal,
        klt: 'daily',
        j: 100,
        tolerance: 100,
        strategies: preset.strategies,
        combinator: preset.combinator,
        line: lineVal,
        excludeBoards: boards,
      });
      setRawResults(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      console.error('SwingTrade query failed:', err);
      setRawResults([]);
      setMeta({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    const preset = PRESETS[subTab];
    if (preset) query(preset, line, date, excludeBoards);
  }, [subTab, line, date, excludeBoards, query]);

  // subTab、date 或 excludeBoards 变化时自动查询
  useEffect(() => {
    if (!initDone.current) {
      initDone.current = true;
    }
    const preset = PRESETS[subTab];
    if (preset) query(preset, line, date, excludeBoards);
  }, [subTab, line, date, excludeBoards, query]);

  // 客户端筛选（仅砖型反转模式）
  const results = useMemo(() => {
    if (subTab !== 'brickReversal') return rawResults;

    return rawResults.filter(r => {
      // K线涨幅上限
      if (maxGain != null && Math.abs(r.change) > maxGain) return false;
      // J值上限（与动态J值互斥）
      if (!dynamicJ && maxJ != null && r.j >= maxJ) return false;
      // 多头/空头排列
      if (arrangement === 'bull' && r.shortTrend <= r.bullBear) return false;
      if (arrangement === 'bear' && r.shortTrend > r.bullBear) return false;
      // 触碰趋势线（±2%）
      if (nearLine) {
        const nearShort = Math.abs(r.deviationShort) <= 2;
        const nearBull = Math.abs(r.deviationBull) <= 2;
        if (!nearShort && !nearBull) return false;
      }
      // 红砖 > 绿砖
      if (redGtGreen && !(r.brick > r.brickPrev2)) return false;
      // 上影线≤实体
      if (upperLeBody && !(r.body > 0 && r.upperShadow <= r.body)) return false;
      // 周线多头趋势
      if (weeklyBull && r.weeklyBull !== true) return false;
      // 周线低位
      if (weeklyLowJ && !(r.weeklyJ != null && r.weeklyJ < 13)) return false;
      // 入场条件
      if (closeAboveShort && r.closeAboveShort !== true) return false;
      if (hasVolumeDouble && r.hasVolumeDouble !== true) return false;
      if (hasShrinkingPullback && r.hasShrinkingPullback !== true) return false;
      if (hasConsecutiveShrink && r.hasConsecutiveShrink !== true) return false;
      // 动态J值
      if (dynamicJ && !(r.sensitiveJ != null && r.j < r.sensitiveJ)) return false;
      // 白线下20
      if (whiteBelowTwenty && !(r.fl3 != null && r.fl3 <= 20 && r.fl31 != null && r.fl31 >= 70)) return false;
      return true;
    });
  }, [rawResults, subTab, maxGain, maxJ, arrangement, nearLine, redGtGreen, upperLeBody, weeklyBull, weeklyLowJ, dynamicJ, closeAboveShort, hasVolumeDouble, hasShrinkingPullback, hasConsecutiveShrink, whiteBelowTwenty]);

  return {
    subTab, setSubTab,
    line, setLine,
    date, setDate,
    excludeBoards, setExcludeBoards,
    // 砖型反转筛选
    maxGain, setMaxGain,
    maxJ, setMaxJ,
    arrangement, setArrangement,
    nearLine, setNearLine,
    redGtGreen, setRedGtGreen,
    upperLeBody, setUpperLeBody,
    weeklyBull, setWeeklyBull,
    weeklyLowJ, setWeeklyLowJ,
    dynamicJ, setDynamicJ,
    closeAboveShort, setCloseAboveShort,
    hasVolumeDouble, setHasVolumeDouble,
    hasShrinkingPullback, setHasShrinkingPullback,
    hasConsecutiveShrink, setHasConsecutiveShrink,
    whiteBelowTwenty, setWhiteBelowTwenty,
    results, rawResults, meta, loading,
    refresh,
  };
}
