import { Tabs, Radio, Spin, Empty, Alert, DatePicker, Checkbox, InputNumber, Switch } from 'antd';
import ResultTable from './ResultTable';
import ResultCard from './ResultCard';
import ExportBar from './ExportBar';
import { getLastTradingDate } from '../lib/date';
import dayjs from 'dayjs';

const BOARD_OPTIONS = [
  { label: '创业板', value: 'gem' },
  { label: '科创板', value: 'star' },
  { label: '北交所', value: 'bse' },
];

export default function SwingTradeView({
  subTab, setSubTab,
  date, setDate,
  excludeBoards, setExcludeBoards,
  maxGain, setMaxGain,
  maxJ, setMaxJ,
  arrangement, setArrangement,
  nearLine, setNearLine,
  redGtGreen, setRedGtGreen,
  upperLeBody, setUpperLeBody,
  weeklyBull, setWeeklyBull,
  results, rawTotal, meta, loading,
  hotData,
}) {
  const subItems = [
    { key: 'brickReversal', label: '砖型反转' },
    { key: 'consecutiveLimitUp', label: '连板' },
  ];

  const isBrick = subTab === 'brickReversal';

  const filename = `超短线-${subTab}-${meta?.scanDate || date || new Date().toISOString().slice(0, 10)}`;

  return (
    <div>
      <Tabs
        activeKey={subTab}
        onChange={setSubTab}
        items={subItems}
        size="small"
        className="mb-2"
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
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
      </div>

      {isBrick && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">涨幅 &le;</span>
            <InputNumber
              value={maxGain}
              onChange={setMaxGain}
              placeholder="不限"
              min={0}
              max={20}
              step={1}
              size="small"
              style={{ width: 70 }}
            />
            <span className="text-slate-400">%</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">J &lt;</span>
            <InputNumber
              value={maxJ}
              onChange={setMaxJ}
              placeholder="不限"
              min={-50}
              max={100}
              step={1}
              size="small"
              style={{ width: 70 }}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">排列</span>
            <Radio.Group
              value={arrangement}
              onChange={e => setArrangement(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
              options={[
                { label: '不限', value: 'any' },
                { label: '多头', value: 'bull' },
                { label: '空头', value: 'bear' },
              ]}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Switch
              checked={nearLine}
              onChange={setNearLine}
              size="small"
            />
            <span className="text-slate-400">触碰趋势线</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Switch
              checked={redGtGreen}
              onChange={setRedGtGreen}
              size="small"
            />
            <span className="text-slate-400">红砖&gt;绿砖</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Switch
              checked={upperLeBody}
              onChange={setUpperLeBody}
              size="small"
            />
            <span className="text-slate-400">上影线&le;实体</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Switch
              checked={weeklyBull}
              onChange={setWeeklyBull}
              size="small"
            />
            <span className="text-slate-400">周线多头</span>
          </div>
        </div>
      )}

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
                共 {results.length} 只符合条件
                {isBrick && rawTotal != null ? ` (反转信号 ${rawTotal} 只)` : meta.wideTotal ? ` (全量 ${meta.wideTotal} 只)` : ''}
                <ExportBar data={results} filename={filename} />
              </span>
              {meta.scanDate && <span>数据日期: {meta.scanDate}</span>}
            </div>
          )}

          <div className="hidden md:block">
            <ResultTable data={results} hotData={hotData} subTab={subTab} />
          </div>
          <div className="md:hidden flex flex-col gap-3">
            {results.map(item => (
              <ResultCard key={item.code} item={item} hotData={hotData} subTab={subTab} />
            ))}
          </div>
        </div>
      ) : (
        <Empty
          description={isBrick && rawTotal > 0 ? '当前筛选条件无匹配，请调整参数' : '暂无符合条件的数据，请确保已完成当天扫描'}
          className="py-12"
        />
      )}
    </div>
  );
}
