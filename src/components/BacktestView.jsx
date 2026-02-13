import { useEffect } from 'react';
import { Spin, Empty, Alert } from 'antd';
import BacktestPanel from './BacktestPanel';
import ResultTable from './ResultTable';
import ResultCard from './ResultCard';

export default function BacktestView({
  params, setParams,
  date, setDate,
  backtestIndustries, setBacktestIndustries,
  backtestConcepts, setBacktestConcepts,
  results, meta, loading,
  scanning, scanInfo,
  startBacktest, refresh, cleanup,
}) {
  useEffect(() => cleanup, [cleanup]);

  const handleStartBacktest = () => {
    startBacktest(date, params.klt, backtestIndustries, backtestConcepts, false);
  };

  // 从结果 meta 或最新 results 拿行业/概念列表（用于面板筛选）
  const industries = meta?.industries || [];
  const concepts = meta?.concepts || [];

  return (
    <div>
      <BacktestPanel
        params={params}
        setParams={setParams}
        date={date}
        setDate={setDate}
        backtestIndustries={backtestIndustries}
        setBacktestIndustries={setBacktestIndustries}
        backtestConcepts={backtestConcepts}
        setBacktestConcepts={setBacktestConcepts}
        industries={industries}
        concepts={concepts}
        onStartBacktest={handleStartBacktest}
        onSearch={refresh}
        scanning={scanning}
        scanInfo={scanInfo}
        loading={loading}
        hasResults={results.length > 0}
      />

      {loading ? (
        <div className="text-center py-16">
          <Spin size="large" />
          <p className="mt-4 text-slate-400">正在加载回测结果...</p>
        </div>
      ) : scanning ? (
        <div className="text-center py-16">
          <Spin size="large" />
          <p className="mt-4 text-slate-400">回测扫描中，请稍候...</p>
        </div>
      ) : meta?.error ? (
        <Alert type="error" message="查询失败" description={meta.error} showIcon className="mb-4" />
      ) : results.length > 0 ? (
        <div>
          {meta && (
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <span>
                共 {meta.total} 只符合条件
                {meta.wideTotal ? ` (宽阈值 ${meta.wideTotal} 只)` : ''}
              </span>
              {meta.scanDate && <span>回测日期: {meta.scanDate}</span>}
            </div>
          )}

          <div className="hidden md:block">
            <ResultTable data={results} />
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {results.map(item => (
              <ResultCard key={item.code} item={item} />
            ))}
          </div>
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
