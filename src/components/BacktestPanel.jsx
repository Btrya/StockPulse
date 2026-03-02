import { DatePicker, Select, InputNumber, Input, Radio, Button, Space, Card, Checkbox, Progress, Switch } from 'antd';
import { ExperimentOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { buildHotOptions } from '../hooks/useHotData';

const KLT_OPTIONS = [
  { label: '日线', value: 'daily' },
  { label: '周线', value: 'weekly' },
];

const SCREEN_MODE_OPTIONS = [
  { label: '波段', value: 'band' },
  { label: '砖型反转', value: 'brickReversal' },
  { label: '连板', value: 'consecutiveLimitUp' },
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

  const isBand = params.screenMode === 'band';
  const isBrick = params.screenMode === 'brickReversal';
  const isLimitUp = params.screenMode === 'consecutiveLimitUp';

  const resetParams = () => {
    setParams(prev => ({
      klt: prev.klt, screenMode: prev.screenMode,
      j: 0, tolerance: 2, industries: [], excludeBoards: [], concepts: [],
      dynamicJ: false,
      maxGain: null, maxJ: null, arrangement: 'any',
      nearLine: false, redGtGreen: false, upperLeBody: false,
      weeklyBull: false, weeklyLowJ: false,
      closeAboveShort: false, hasVolumeDouble: false,
      hasShrinkingPullback: false, hasConsecutiveShrink: false,
    }));
  };

  return (
    <Card size="small" className="mb-4" styles={{ body: { padding: '16px' } }}>
      <div className="flex flex-col gap-4">
        {/* 第一行：日期 + K线 + 筛选模式 + 回测按钮 */}
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
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">筛选模式</span>
            <Radio.Group
              options={SCREEN_MODE_OPTIONS}
              value={params.screenMode}
              onChange={e => update('screenMode', e.target.value)}
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

        {/* 砖型反转二次筛选参数面板 */}
        {hasResults && isBrick && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-700 pt-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">涨幅 &le;</span>
              <InputNumber
                value={params.maxGain}
                onChange={v => update('maxGain', v)}
                placeholder="不限"
                min={0} max={20} step={1}
                size="small"
                style={{ width: 70 }}
              />
              <span className="text-slate-400">%</span>
            </div>

            {!params.dynamicJ && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">J &lt;</span>
                <InputNumber
                  value={params.maxJ}
                  onChange={v => update('maxJ', v)}
                  placeholder="不限"
                  min={-50} max={100} step={1}
                  size="small"
                  style={{ width: 70 }}
                />
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">排列</span>
              <Radio.Group
                value={params.arrangement}
                onChange={e => update('arrangement', e.target.value)}
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
              <Switch checked={params.nearLine} onChange={v => update('nearLine', v)} size="small" />
              <span className="text-slate-400">触碰趋势线</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={params.redGtGreen} onChange={v => update('redGtGreen', v)} size="small" />
              <span className="text-slate-400">红砖&gt;绿砖</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={params.upperLeBody} onChange={v => update('upperLeBody', v)} size="small" />
              <span className="text-slate-400">上影线&le;实体</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={params.weeklyBull} onChange={v => update('weeklyBull', v)} size="small" />
              <span className="text-slate-400">周线多头</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={params.weeklyLowJ} onChange={v => update('weeklyLowJ', v)} size="small" />
              <span className="text-slate-400">周线低位</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={params.dynamicJ} onChange={v => update('dynamicJ', v)} size="small" />
              <span className="text-slate-400">动态J值</span>
            </div>
          </div>
        )}

        {/* 入场条件（波段 + 砖型反转模式下显示） */}
        {hasResults && (isBand || isBrick) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-700 pt-4 text-xs">
            <span className="text-slate-400 font-medium">入场条件</span>
            <div className="flex items-center gap-1.5">
              <Switch checked={params.closeAboveShort} onChange={v => update('closeAboveShort', v)} size="small" />
              <span className="text-slate-400">收盘&gt;短趋</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={params.hasVolumeDouble} onChange={v => update('hasVolumeDouble', v)} size="small" />
              <span className="text-slate-400">倍量</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={params.hasShrinkingPullback} onChange={v => update('hasShrinkingPullback', v)} size="small" />
              <span className="text-slate-400">缩量回踩</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={params.hasConsecutiveShrink} onChange={v => update('hasConsecutiveShrink', v)} size="small" />
              <span className="text-slate-400">连续缩量</span>
            </div>
          </div>
        )}

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
            {/* 波段模式下显示 J 值和动态 J */}
            {isBand && !params.dynamicJ && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">J 值阈值</span>
                <InputNumber
                  value={params.j}
                  onChange={v => update('j', v ?? 0)}
                  style={{ width: 100 }}
                  step={5}
                />
              </div>
            )}
            {isBand && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">动态J值</span>
                <Switch
                  checked={params.dynamicJ}
                  onChange={v => update('dynamicJ', v)}
                />
              </div>
            )}
            {/* 连板模式下隐藏 J 和容差 */}
            {!isLimitUp && (
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
            )}
            <Space>
              <Button icon={<SearchOutlined />} onClick={onSearch} loading={loading}>筛选</Button>
              <Button icon={<ReloadOutlined />} onClick={resetParams}>重置</Button>
            </Space>
          </div>
        )}
      </div>
    </Card>
  );
}
