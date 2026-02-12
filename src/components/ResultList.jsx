import { Spin, Empty, Alert } from 'antd';
import ResultTable from './ResultTable';
import ResultCard from './ResultCard';

export default function ResultList({ results, meta, loading }) {
  if (loading) {
    return (
      <div className="text-center py-16">
        <Spin size="large" />
        <p className="mt-4 text-slate-400">正在查询...</p>
      </div>
    );
  }

  if (meta?.error) {
    return <Alert type="error" message="查询失败" description={meta.error} showIcon className="mb-4" />;
  }

  if (!results.length && meta) {
    return (
      <Empty
        description={meta.message || '当前参数下无符合条件的股票（可尝试提高 J 阈值或增大容差）'}
        className="py-12"
      />
    );
  }

  if (!results.length) {
    return (
      <Empty description="加载中..." className="py-16" />
    );
  }

  return (
    <div>
      {meta && (
        <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
          <span>
            共 {meta.total} 只符合条件
            {meta.wideTotal ? ` (宽阈值 ${meta.wideTotal} 只)` : ''}
          </span>
          {meta.scanDate && <span>数据日期: {meta.scanDate}</span>}
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
  );
}
