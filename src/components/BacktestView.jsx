import { useEffect } from 'react';
import { Spin, Empty, Alert } from 'antd';
import BacktestPanel from './BacktestPanel';
import ResultTable from './ResultTable';
import ResultCard from './ResultCard';

export default function BacktestView({
  params, setParams,
  date, setDate,
  results, meta, loading,
  scanning, scanInfo,
  startBacktest, refresh, cleanup,
  sharedIndustries, sharedConcepts,
  hotData,
}) {
  useEffect(() => cleanup, [cleanup]);

  const handleStartBacktest = () => {
    startBacktest(date, params.klt, false);
  };

  // 结果筛选器：用回测结果的行业/概念列表，fallback 到共享列表
  const resultIndustries = meta?.industries?.length ? meta.industries : (sharedIndustries || []);
  const resultConcepts = meta?.concepts?.length ? meta.concepts : (sharedConcepts || []);

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
                {meta.wideTotal ? ` (全量 ${meta.wideTotal} 只)` : ''}
              </span>
              {meta.scanDate && <span>回测日期: {meta.scanDate}</span>}
            </div>
          )}

          <div className="hidden md:block">
            <ResultTable data={results} hotData={hotData} />
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {results.map(item => (
              <ResultCard key={item.code} item={item} hotData={hotData} />
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
