import { Spin, Empty, Alert } from 'antd';
import TrackingPanel from './TrackingPanel';
import TrackingTable from './TrackingTable';
import TrackingCard from './TrackingCard';

export default function TrackingView({ params, setParams, results, meta, loading, refresh, sharedIndustries, sharedConcepts }) {
  // 追踪结果有行业/概念就用，否则 fallback 到 screener 共享的列表
  const panelIndustries = meta?.industries?.length ? meta.industries : (sharedIndustries || []);
  const panelConcepts = meta?.concepts?.length ? meta.concepts : (sharedConcepts || []);

  return (
    <div>
      <TrackingPanel
        params={params}
        setParams={setParams}
        industries={panelIndustries}
        concepts={panelConcepts}
        onSearch={refresh}
        loading={loading}
      />

      {loading ? (
        <div className="text-center py-16">
          <Spin size="large" />
          <p className="mt-4 text-slate-400">正在查询追踪数据...</p>
        </div>
      ) : meta?.error ? (
        <Alert type="error" message="查询失败" description={meta.error} showIcon className="mb-4" />
      ) : !results.length && meta ? (
        <Empty
          description={meta.scanDates?.length
            ? '当前参数下无连续入选的股票（可尝试降低最少连续天数或放宽条件）'
            : '暂无扫描历史数据，请等待至少一次完整扫描完成'}
          className="py-12"
        />
      ) : !results.length ? (
        <Empty description="加载中..." className="py-16" />
      ) : (
        <div>
          {meta && (
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <span>共 {results.length} 只连续入选</span>
              {meta.scanDates && (
                <span>覆盖日期: {meta.scanDates.join(', ')}</span>
              )}
            </div>
          )}

          <div className="hidden md:block">
            <TrackingTable data={results} />
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {results.map(item => (
              <TrackingCard key={item.ts_code} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
