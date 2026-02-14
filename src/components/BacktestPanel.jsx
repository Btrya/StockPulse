import { DatePicker, Select, InputNumber, Input, Radio, Button, Space, Card, Checkbox, Progress } from 'antd';
import { ExperimentOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { buildHotOptions } from '../hooks/useHotData';

const KLT_OPTIONS = [
  { label: '日线', value: 'daily' },
  { label: '周线', value: 'weekly' },
];

const BOARD_OPTIONS = [
  { label: '创业板', value: 'gem' },
  { label: '科创板', value: 'star' },
  { label: '北交所', value: 'bse' },
];

export default function BacktestPanel({
  params, setParams,
  date, setDate,
  resultIndustries, resultConcepts,
  onStartBacktest, onSearch,
  scanning, scanInfo, loading, hasResults,
  stockFilter, onStockFilterChange,
  hotData, queue,
}) {
  const update = (key, val) => setParams(prev => ({ ...prev, [key]: val }));

  const resultIndustryOpts = buildHotOptions(resultIndustries, hotData?.hotIndustries);
  const resultConceptOpts = buildHotOptions(resultConcepts, hotData?.hotConcepts);

  const pct = scanInfo?.total ? Math.round((scanInfo.idx / scanInfo.total) * 100) : 0;

  return (
    <Card size="small" className="mb-4" styles={{ body: { padding: '16px' } }}>
      <div className="flex flex-col gap-4">
        {/* 第一行：日期 + K线 + 回测按钮 */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">回测日期</span>
            <DatePicker
              value={date ? dayjs(date) : null}
              onChange={d => setDate(d ? d.format('YYYY-MM-DD') : null)}
              disabledDate={d => d && d.isAfter(dayjs())}
              style={{ width: 160 }}
              placeholder="选择历史日期"
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
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            onClick={onStartBacktest}
            disabled={!date}
          >
            {scanning ? '加入队列' : '开始回测'}
          </Button>

          {scanning && scanInfo && (
            <div className="flex-1 max-w-md">
              <Progress
                percent={pct}
                size="small"
                format={() => {
                  const qLen = (queue || []).length;
                  const base = `回测 ${scanInfo.currentDate || date} ${scanInfo.idx}/${scanInfo.total}`;
                  return qLen > 0 ? `${base}，队列 ${qLen} 天` : base;
                }}
              />
            </div>
          )}
        </div>

        {/* 结果筛选参数（有结果时才展示） */}
        {hasResults && (
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end flex-wrap border-t border-slate-700 pt-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">搜索股票</span>
              <Input
                placeholder="代码或名称"
                value={stockFilter}
                onChange={e => onStockFilterChange(e.target.value)}
                allowClear
                style={{ width: 140 }}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <span className="text-xs text-slate-400">行业筛选</span>
              <Select
                mode="multiple"
                showSearch
                placeholder="筛选行业"
                optionFilterProp="label"
                options={resultIndustryOpts}
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
                placeholder="筛选概念"
                optionFilterProp="label"
                options={resultConceptOpts}
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
              <Button icon={<SearchOutlined />} onClick={onSearch} loading={loading}>筛选</Button>
              <Button icon={<ReloadOutlined />} onClick={() => setParams({ klt: params.klt, j: 0, tolerance: 2, industries: [], excludeBoards: [], concepts: [] })}>重置</Button>
            </Space>
          </div>
        )}
      </div>
    </Card>
  );
}
