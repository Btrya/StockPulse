import { useEffect, useState, useMemo } from 'react';
import { Spin, Empty, Alert, Collapse, message } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { can } from '../lib/permissions';
import BacktestPanel from './BacktestPanel';
import ResultTable from './ResultTable';
import ResultCard from './ResultCard';
import ExportBar from './ExportBar';
import usePostAnalysis from '../hooks/usePostAnalysis';
import { buildHotSets, getHotReasons } from '../hooks/useHotData';
import PostAnalysisPanel from './PostAnalysisPanel';
import PostAnalysisStats from './PostAnalysisStats';
import PostAnalysisTable from './PostAnalysisTable';

export default function BacktestView({
  params, setParams,
  date, setDate,
  results, meta, loading,
  scanning, scanInfo, queue,
  startBacktest, refresh, cleanup,
  sharedIndustries, sharedConcepts,
  hotData,
}) {
  // 从 backtest params 构造入场过滤条件，透传给后验分析
  const paFilters = useMemo(() => ({
    closeAboveShort: params.closeAboveShort,
    hasVolumeDouble: params.hasVolumeDouble,
    hasShrinkingPullback: params.hasShrinkingPullback,
    hasConsecutiveShrink: params.hasConsecutiveShrink,
  }), [params.closeAboveShort, params.hasVolumeDouble, params.hasShrinkingPullback, params.hasConsecutiveShrink]);

  const { role } = useAuth();
  const showJ = can(role, 'param_jThreshold');

  const pa = usePostAnalysis(date, params.klt, paFilters);

  useEffect(() => {
    return () => { cleanup(); pa.cleanup(); };
  }, [cleanup, pa.cleanup]);

  const [stockFilter, setStockFilter] = useState('');

  const handleStartBacktest = async () => {
    const res = await startBacktest(date, params.klt, false);
    if (res?.queued) {
      message.success(`${date} 已加入回测队列（队列 ${res.queue?.length || 1} 天）`);
    }
  };

  // 大力反转客户端二次筛选
  const filteredResults = useMemo(() => {
    if (params.screenMode !== 'brickReversal') return results;

    // user 无 param_jThreshold 权限时强制 j<13
    const effectiveMaxJ = showJ ? params.maxJ : 13;

    return results.filter(r => {
      if (params.maxGain != null && Math.abs(r.change) > params.maxGain) return false;
      if (!params.dynamicJ && effectiveMaxJ != null && r.j >= effectiveMaxJ) return false;
      if (params.arrangement === 'bull' && r.shortTrend <= r.bullBear) return false;
      if (params.arrangement === 'bear' && r.shortTrend > r.bullBear) return false;
      if (params.nearLine) {
        const nearShort = Math.abs(r.deviationShort) <= 2;
        const nearBull = Math.abs(r.deviationBull) <= 2;
        if (!nearShort && !nearBull) return false;
      }
      if (params.redGtGreen && !(r.brick > r.brickPrev2)) return false;
      if (params.upperLeBody && !(r.body > 0 && r.upperShadow <= r.body)) return false;
      if (params.weeklyBull && r.weeklyBull !== true) return false;
      if (params.weeklyLowJ && !(r.weeklyJ != null && r.weeklyJ < 13)) return false;
      if (params.closeAboveShort && r.closeAboveShort !== true) return false;
      if (params.hasVolumeDouble && r.hasVolumeDouble !== true) return false;
      if (params.hasShrinkingPullback && r.hasShrinkingPullback !== true) return false;
      if (params.hasConsecutiveShrink && r.hasConsecutiveShrink !== true) return false;
      if (params.dynamicJ && !(r.sensitiveJ != null && r.j < r.sensitiveJ)) return false;
      return true;
    });
  }, [results, params]);

  // 本地按代码/名称过滤 + 只看热门
  const displayResults = useMemo(() => {
    let list = filteredResults;
    if (params.onlyHot) {
      const hotSets = buildHotSets(hotData);
      if (hotSets) list = list.filter(r => getHotReasons(r, hotSets).length > 0);
    }
    if (stockFilter.trim()) {
      const q = stockFilter.trim().toLowerCase();
      list = list.filter(r =>
        r.code?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [filteredResults, stockFilter, params.onlyHot, hotData]);

  const handleStartPostAnalysis = () => {
    // build tsCodes from display results (after all filtering)
    const tsCodes = displayResults.map(r => ({
      tsCode: r.ts_code,
      code: r.code,
      name: r.name,
      industry: r.industry,
    }));
    pa.start(tsCodes);
  };

  // 结果筛选器：用回测结果的行业/概念列表，fallback 到共享列表
  const resultIndustries = meta?.industries?.length ? meta.industries : (sharedIndustries || []);
  const resultConcepts = meta?.concepts?.length ? meta.concepts : (sharedConcepts || []);

  const filename = `回测-${meta?.scanDate || date || new Date().toISOString().slice(0, 10)}`;

  // 大力反转/连板传 subTab 给 ResultTable 做列切换
  const subTab = params.screenMode !== 'band' ? params.screenMode : undefined;

  return (
    <div>
      <BacktestPanel
        params={params}
        setParams={setParams}
        date={date}
        setDate={setDate}
        resultIndustries={resultIndustries}
        resultConcepts={resultConcepts}
        onStartBacktest={handleStartBacktest}
        onSearch={refresh}
        scanning={scanning}
        scanInfo={scanInfo}
        loading={loading}
        hasResults={!!(meta || results.length)}
        stockFilter={stockFilter}
        onStockFilterChange={setStockFilter}
        hotData={hotData}
        queue={queue}
      />

      {loading ? (
        <div className="text-center py-16">
          <Spin size="large" />
          <p className="mt-4 text-slate-400">正在加载回测结果...</p>
        </div>
      ) : meta?.error ? (
        <Alert type="error" message="查询失败" description={meta.error} showIcon className="mb-4" />
      ) : results.length > 0 ? (
        <div>
          {meta && (
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <span>
                共 {displayResults.length} 只符合条件
                {params.screenMode === 'brickReversal' && results.length !== displayResults.length
                  ? ` (反转信号 ${results.length} 只)`
                  : meta.wideTotal ? ` (全量 ${meta.wideTotal} 只)` : ''}
                {stockFilter.trim() ? ` → 搜索到 ${displayResults.length} 只` : ''}
                <ExportBar data={displayResults} filename={filename} />
              </span>
              {meta.scanDate && <span>回测日期: {meta.scanDate}</span>}
            </div>
          )}

          <div className="hidden md:block">
            <ResultTable data={displayResults} hotData={hotData} subTab={subTab} jMode={params.dynamicJ ? 'dynamic' : undefined} showJ={showJ} />
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {displayResults.map(item => (
              <ResultCard key={item.code} item={item} hotData={hotData} subTab={subTab} showJ={showJ} />
            ))}
          </div>

          <Collapse
            className="mt-4"
            items={[{
              key: 'post-analysis',
              label: `后验分析${pa.trades.length ? ` (${pa.trades.length} 只)` : ''}`,
              children: (
                <div>
                  <PostAnalysisPanel
                    strategies={pa.strategies}
                    setStrategies={pa.setStrategies}
                    window={pa.window}
                    setWindow={pa.setWindow}
                    loading={pa.loading}
                    progress={pa.progress}
                    onStart={handleStartPostAnalysis}
                    disabled={!displayResults.length || pa.loading}
                  />
                  {pa.stats && <PostAnalysisStats stats={pa.stats} />}
                  {pa.trades.length > 0 && <PostAnalysisTable data={pa.trades} />}
                </div>
              ),
            }]}
          />
        </div>
      ) : scanning ? (
        <div className="text-center py-16">
          <Spin size="large" />
          <p className="mt-4 text-slate-400">回测扫描中，等待中间结果...</p>
        </div>
      ) : meta ? (
        <Empty
          description="当前筛选条件下没有符合的股票，请调整上方筛选参数后点击「筛选」"
          className="py-12"
        />
      ) : date ? (
        <Empty
          description="暂无回测数据，请选择日期并点击「开始回测」"
          className="py-12"
        />
      ) : (
        <Empty
          description="请选择一个历史日期开始回测"
          className="py-12"
        />
      )}
    </div>
  );
}
