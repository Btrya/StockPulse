import { Spin, Empty, Alert, Progress, Descriptions } from 'antd';
import ResultTable from './ResultTable';
import ResultCard from './ResultCard';

function DiagPanel({ diag }) {
  if (!diag || !Array.isArray(diag) || !diag.length) return null;

  const totals = diag.reduce(
    (acc, d) => ({
      stocks: acc.stocks + (d.stockCount || 0),
      ok: acc.ok + (d.klineOk || 0),
      fail: acc.fail + (d.klineNull || 0),
      short: acc.short + (d.klineShort || 0),
    }),
    { stocks: 0, ok: 0, fail: 0, short: 0 }
  );

  return (
    <Descriptions size="small" column={{ xs: 2, md: 4 }} className="mb-3">
      <Descriptions.Item label="成分股总数">{totals.stocks}</Descriptions.Item>
      <Descriptions.Item label="K线正常">{totals.ok}</Descriptions.Item>
      <Descriptions.Item label="K线获取失败">{totals.fail}</Descriptions.Item>
      <Descriptions.Item label="K线不足120根">{totals.short}</Descriptions.Item>
    </Descriptions>
  );
}

export default function ResultList({ results, meta, loading, progress }) {
  if (loading) {
    return (
      <div className="text-center py-16">
        <Spin size="large" />
        {progress && (
          <div className="mt-4 max-w-xs mx-auto">
            <Progress
              percent={Math.round((progress.done / progress.total) * 100)}
              size="small"
              format={() => `${progress.done}/${progress.total} 板块`}
            />
          </div>
        )}
        <p className="mt-2 text-slate-400">正在扫描，拉取K线并计算指标...</p>
        {results.length > 0 && (
          <p className="text-slate-500 text-xs">已找到 {results.length} 只</p>
        )}
      </div>
    );
  }

  if (meta?.error) {
    return <Alert type="error" message="查询失败" description={meta.error} showIcon className="mb-4" />;
  }

  if (!results.length && meta) {
    return (
      <div>
        <DiagPanel diag={meta.diag} />
        <Empty
          description={
            meta.diag
              ? '当前参数下无符合条件的股票（可尝试提高 J 阈值或增大容差）'
              : (meta.message || '选择行业板块开始筛选')
          }
          className="py-12"
        />
      </div>
    );
  }

  if (!results.length) {
    return (
      <Empty
        description="选择行业板块开始筛选"
        className="py-16"
      />
    );
  }

  return (
    <div>
      <DiagPanel diag={meta?.diag} />

      {meta && (
        <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
          <span>
            共 {meta.total} 只符合条件
            {meta.wideTotal ? ` (宽阈值 ${meta.wideTotal} 只)` : ''}
            {meta.sectorCount > 1 ? ` · ${meta.sectorCount} 个板块` : ''}
          </span>
          {meta.scanDate && <span>数据日期: {meta.scanDate}</span>}
        </div>
      )}

      {/* 桌面：表格 */}
      <div className="hidden md:block">
        <ResultTable data={results} />
      </div>

      {/* 移动：卡片 */}
      <div className="md:hidden flex flex-col gap-3">
        {results.map(item => (
          <ResultCard key={item.code} item={item} />
        ))}
      </div>
    </div>
  );
}
