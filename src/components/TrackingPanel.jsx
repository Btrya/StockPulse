import { Select, InputNumber, Radio, Button, Space, Card, Checkbox, DatePicker } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { buildHotOptions } from '../hooks/useHotData';
import { getLastTradingDate } from '../lib/date';
import dayjs from 'dayjs';

const KLT_OPTIONS = [
  { label: '日线', value: 'daily' },
  { label: '周线', value: 'weekly' },
];

const BOARD_OPTIONS = [
  { label: '创业板', value: 'gem' },
  { label: '科创板', value: 'star' },
  { label: '北交所', value: 'bse' },
];

const MIN_DAYS_OPTIONS = [
  { label: '2+', value: 2 },
  { label: '3+', value: 3 },
  { label: '4+', value: 4 },
  { label: '5+', value: 5 },
];

export default function TrackingPanel({ params, setParams, date, setDate, industries, concepts, onSearch, loading, hotData }) {
  const update = (key, val) => setParams(prev => ({ ...prev, [key]: val }));

  const industryOptions = buildHotOptions(industries, hotData?.hotIndustries);
  const conceptOptions = buildHotOptions(concepts, hotData?.hotConcepts);

  return (
    <Card size="small" className="mb-4" styles={{ body: { padding: '16px' } }}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-slate-400">行业筛选</span>
            <Select
              mode="multiple"
              showSearch
              placeholder="选择行业"
              optionFilterProp="label"
              options={industryOptions}
              value={params.industries}
              onChange={v => update('industries', v)}
              maxTagCount="responsive"
              style={{ width: '100%' }}
              allowClear
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-slate-400">概念筛选</span>
            <Select
              mode="multiple"
              showSearch
              placeholder="选择概念"
              optionFilterProp="label"
              options={conceptOptions}
              value={params.concepts}
              onChange={v => update('concepts', v)}
              maxTagCount="responsive"
              style={{ width: '100%' }}
              allowClear
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">排除板块</span>
            <Checkbox.Group
              options={BOARD_OPTIONS}
              value={params.excludeBoards}
              onChange={v => update('excludeBoards', v)}
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">数据日期</span>
            <DatePicker
              value={dayjs(date)}
              onChange={v => setDate(v ? v.format('YYYY-MM-DD') : getLastTradingDate())}
              allowClear={false}
              size="middle"
              style={{ width: 130 }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">K线周期</span>
            <Radio.Group
              options={KLT_OPTIONS}
              value={params.klt}
              onChange={e => update('klt', e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="middle"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">最少连续天数</span>
            <Radio.Group
              options={MIN_DAYS_OPTIONS}
              value={params.minDays}
              onChange={e => update('minDays', e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="middle"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">J 值阈值</span>
            <InputNumber
              value={params.j}
              onChange={v => update('j', v ?? 0)}
              style={{ width: 100 }}
              step={5}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">容差 %</span>
            <InputNumber
              value={params.tolerance}
              onChange={v => update('tolerance', v ?? 2)}
              min={0.5}
              max={10}
              step={0.5}
              style={{ width: 100 }}
            />
          </div>

          <Space>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={onSearch}
              loading={loading}
            >
              查询
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => { setParams({ klt: 'daily', minDays: 2, j: 0, tolerance: 2, industries: [], excludeBoards: [], concepts: [] }); setDate(getLastTradingDate()); }}
            >
              重置
            </Button>
          </Space>
        </div>
      </div>
    </Card>
  );
}
