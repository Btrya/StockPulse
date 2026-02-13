import { useState, useRef } from 'react';
import { Input, Spin, Tag, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { searchStocks } from '../lib/api';

export default function StockSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const handleSearch = (val) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim()) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchStocks(val.trim());
        setResults(res.data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  return (
    <div>
      <Input
        prefix={<SearchOutlined />}
        placeholder="输入代码或名称查询行业/概念"
        value={query}
        onChange={e => handleSearch(e.target.value)}
        allowClear
        size="middle"
      />
      {loading && <div className="text-center py-4"><Spin size="small" /></div>}
      {!loading && query && results.length === 0 && (
        <Empty description="未找到匹配的股票" image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-4" />
      )}
      {!loading && results.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 max-h-80 overflow-y-auto">
          {results.map(s => (
            <div key={s.ts_code} className="p-2 rounded bg-slate-800/50 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="num font-medium">{s.code}</span>
                <span>{s.name}</span>
                {s.industry && <Tag color="default" className="m-0 text-xs">{s.industry}</Tag>}
              </div>
              {s.concepts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.concepts.map(c => (
                    <Tag key={c} color="blue" className="m-0 text-xs">{c}</Tag>
                  ))}
                </div>
              )}
              {s.concepts.length === 0 && (
                <span className="text-xs text-slate-500">暂无概念数据</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
