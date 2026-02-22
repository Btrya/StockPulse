import { Tabs, Radio, Spin, Empty, Alert, Tag, DatePicker, Checkbox } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import ResultTable from './ResultTable';
import ResultCard from './ResultCard';
import { getLastTradingDate } from '../lib/date';
import dayjs from 'dayjs';

const BOARD_OPTIONS = [
  { label: '创业板', value: 'gem' },
  { label: '科创板', value: 'star' },
  { label: '北交所', value: 'bse' },
];

export default function SwingTradeView({
  subTab, setSubTab,
  line, setLine,
  date, setDate,
  excludeBoards, setExcludeBoards,
  results, meta, loading,
  refresh, hotData,
}) {
  const subItems = [
    { key: 'brickReversal', label: '砖型反转' },
    { key: 'consecutiveLimitUp', label: '二连板' },
  ];

  const showLineSelector = subTab === 'brickReversal';

  return (
    <div>
      <Tabs
        activeKey={subTab}
        onChange={setSubTab}
        items={subItems}
        size="small"
        className="mb-4"
        tabBarExtraContent={
          <div className="flex items-center gap-3">
            <DatePicker
              value={dayjs(date)}
              onChange={v => setDate(v ? v.format('YYYY-MM-DD') : getLastTradingDate())}
              allowClear={false}
              size="small"
              style={{ width: 120 }}
            />
            <span className="text-xs text-slate-400">排除</span>
            <Checkbox.Group
              options={BOARD_OPTIONS}
              value={excludeBoards}
              onChange={setExcludeBoards}
              className="text-xs"
            />
            {showLineSelector && (
              <>
                <span className="text-xs text-slate-400">收盘价在</span>
                <Radio.Group
                  value={line}
                  onChange={e => setLine(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  size="small"
                  options={[
                    { label: '短期线上方', value: 'short' },
                    { label: '多空线上方', value: 'bull' },
                  ]}
                />
              </>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="text-center py-16">
          <Spin size="large" />
          <p className="mt-4 text-slate-400">加载中...</p>
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
              {meta.scanDate && <span>数据日期: {meta.scanDate}</span>}
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
      ) : (
        <Empty
          description="暂无符合条件的数据，请确保已完成当天扫描"
          className="py-12"
        />
      )}
    </div>
  );
}
