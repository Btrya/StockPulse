import { useMemo } from 'react';
import { Spin, Empty, Alert } from 'antd';
import TrackingPanel from './TrackingPanel';
import TrackingTable from './TrackingTable';
import TrackingCard from './TrackingCard';
import ExportBar from './ExportBar';
import { buildHotSets, getHotReasons } from '../hooks/useHotData';
import { useAuth } from '../contexts/AuthContext';
import { can } from '../lib/permissions';

export default function TrackingView({ params, setParams, date, setDate, results, meta, loading, refresh, sharedIndustries, sharedConcepts, hotData }) {
  const { role } = useAuth();
  const showJ = can(role, 'param_jThreshold');

  // 追踪结果有行业/概念就用，否则 fallback 到 screener 共享的列表
  const panelIndustries = meta?.industries?.length ? meta.industries : (sharedIndustries || []);
  const panelConcepts = meta?.concepts?.length ? meta.concepts : (sharedConcepts || []);

  const displayResults = useMemo(() => {
    if (!params.onlyHot) return results;
    const hotSets = buildHotSets(hotData);
    if (!hotSets) return results;
    return results.filter(r => {
      const target = { ts_code: r.ts_code, industry: r.industry, concepts: r.latest?.concepts || [] };
      return getHotReasons(target, hotSets).length > 0;
    });
  }, [results, params.onlyHot, hotData]);

  const filename = `追踪-${meta?.scanDates?.[0] || new Date().toISOString().slice(0, 10)}`;

  return (
    <div>
      <TrackingPanel
        params={params}
        setParams={setParams}
        date={date}
        setDate={setDate}
        industries={panelIndustries}
        concepts={panelConcepts}
        onSearch={refresh}
        loading={loading}
        hotData={hotData}
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
              <span>
                共 {displayResults.length} 只连续入选
                {params.onlyHot && displayResults.length !== results.length ? ` (全量 ${results.length} 只)` : ''}
                <ExportBar data={displayResults} filename={filename} />
              </span>
              {meta.scanDates && (
                <span>覆盖日期: {meta.scanDates.join(', ')}</span>
              )}
            </div>
          )}

          <div className="hidden md:block">
            <TrackingTable data={displayResults} hotData={hotData} showJ={showJ} />
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {displayResults.map(item => (
              <TrackingCard key={item.ts_code} item={item} hotData={hotData} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
