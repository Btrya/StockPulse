import { useEffect, useState, useMemo } from 'react';
import { Spin, Empty, Alert, Collapse, message } from 'antd';
import BacktestPanel from './BacktestPanel';
import ResultTable from './ResultTable';
import ResultCard from './ResultCard';
import ExportBar from './ExportBar';
import usePostAnalysis from '../hooks/usePostAnalysis';
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
  const pa = usePostAnalysis(date, params.klt);

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

  const handleStartPostAnalysis = () => {
    // build tsCodes from filtered results
    const tsCodes = results.map(r => ({
      tsCode: r.ts_code,
      code: r.code,
      name: r.name,
      industry: r.industry,
    }));
    pa.start(tsCodes);
  };

  // 本地按代码/名称过滤
  const displayResults = useMemo(() => {
    if (!stockFilter.trim()) return results;
    const q = stockFilter.trim().toLowerCase();
    return results.filter(r =>
      r.code?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q)
    );
  }, [results, stockFilter]);

  // 结果筛选器：用回测结果的行业/概念列表，fallback 到共享列表
  const resultIndustries = meta?.industries?.length ? meta.industries : (sharedIndustries || []);
  const resultConcepts = meta?.concepts?.length ? meta.concepts : (sharedConcepts || []);

  const filename = `回测-${meta?.scanDate || date || new Date().toISOString().slice(0, 10)}`;

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
        hasResults={results.length > 0}
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
                共 {meta.total} 只符合条件
                {meta.wideTotal ? ` (全量 ${meta.wideTotal} 只)` : ''}
                {stockFilter.trim() ? ` → 搜索到 ${displayResults.length} 只` : ''}
                <ExportBar data={displayResults} filename={filename} />
              </span>
              {meta.scanDate && <span>回测日期: {meta.scanDate}</span>}
            </div>
          )}

          <div className="hidden md:block">
            <ResultTable data={displayResults} hotData={hotData} jMode={params.dynamicJ ? 'dynamic' : undefined} />
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {displayResults.map(item => (
              <ResultCard key={item.code} item={item} hotData={hotData} />
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
                    filters={pa.filters}
                    setFilters={pa.setFilters}
                    window={pa.window}
                    setWindow={pa.setWindow}
                    loading={pa.loading}
                    progress={pa.progress}
                    onStart={handleStartPostAnalysis}
                    disabled={!results.length || pa.loading}
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
