import { useState } from 'react';
import { Select, InputNumber, Radio, Button, Space, Card, Checkbox, DatePicker, Switch, message } from 'antd';
import { SearchOutlined, ReloadOutlined, TagsOutlined } from '@ant-design/icons';
import { buildConcepts } from '../lib/api';
import { buildHotOptions } from '../hooks/useHotData';
import { getLastTradingDate } from '../lib/date';
import { useAuth } from '../contexts/AuthContext';
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

export default function ParamPanel({ params, setParams, date, setDate, industries, concepts, onSearch, loading, hotData }) {
  const update = (key, val) => setParams(prev => ({ ...prev, [key]: val }));
  const [buildingConcepts, setBuildingConcepts] = useState(false);
  const { hasRole } = useAuth();
  const isPremium = hasRole('premium');
  const isAdmin = hasRole('admin');

  const handleBuildConcepts = async () => {
    setBuildingConcepts(true);
    try {
      let result = await buildConcepts();
      while (result.needContinue) {
        message.info(`概念构建中... ${result.idx}/${result.total}`);
        result = await buildConcepts();
      }
      message.success(`概念构建完成，覆盖 ${result.stocks} 只股票`);
    } catch (err) {
      message.error(`概念构建失败: ${err.message}`);
    } finally {
      setBuildingConcepts(false);
    }
  };

  const industryOptions = buildHotOptions(industries, hotData?.hotIndustries);
  const conceptOptions = buildHotOptions(concepts, hotData?.hotConcepts);

  return (
    <Card size="small" className="mb-4" styles={{ body: { padding: '16px' } }}>
      <div className="flex flex-col gap-4">
        {/* 第一行：行业 + 概念 + 排除板块 */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-slate-400">行业筛选（留空=全部）</span>
            <Select
              mode="multiple"
              showSearch
              placeholder="选择行业（支持搜索）"
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
            <span className="text-xs text-slate-400">概念筛选（OR 逻辑，留空=全部）</span>
            <Select
              mode="multiple"
              showSearch
              placeholder="选择概念（支持搜索）"
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

        {/* 第二行：参数 + 按钮 */}
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
              onChange={e => {
                const v = e.target.value;
                // 切换周期时清除对方的跨周期条件
                const clear = v === 'weekly'
                  ? { weeklyBull: false, weeklyLowJ: false }
                  : { dailyLowJ: false };
                setParams(prev => ({ ...prev, klt: v, ...clear }));
              }}
              optionType="button"
              buttonStyle="solid"
              size="middle"
            />
          </div>

          {isPremium && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">J 值模式</span>
              <Radio.Group
                value={params.jMode || 'fixed'}
                onChange={e => update('jMode', e.target.value)}
                optionType="button"
                buttonStyle="solid"
                size="middle"
                options={[
                  { label: '固定', value: 'fixed' },
                  { label: '动态', value: 'dynamic' },
                ]}
              />
            </div>
          )}

          {isPremium && (params.jMode || 'fixed') === 'fixed' && (
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

          {isPremium && (
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

          {isPremium && params.klt === 'daily' && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">周线多头</span>
              <Switch
                checked={params.weeklyBull}
                onChange={v => update('weeklyBull', v)}
              />
            </div>
          )}

          {isPremium && params.klt === 'daily' && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">周线低位</span>
              <Switch
                checked={params.weeklyLowJ}
                onChange={v => update('weeklyLowJ', v)}
              />
            </div>
          )}

          {isPremium && params.klt === 'weekly' && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">日线低位</span>
              <Switch
                checked={params.dailyLowJ}
                onChange={v => update('dailyLowJ', v)}
              />
            </div>
          )}

          {isPremium && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">收盘&gt;短趋</span>
              <Switch
                checked={params.closeAboveShort}
                onChange={v => update('closeAboveShort', v)}
              />
            </div>
          )}

          {isPremium && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">倍量</span>
              <Switch
                checked={params.hasVolumeDouble}
                onChange={v => update('hasVolumeDouble', v)}
              />
            </div>
          )}

          {isPremium && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">缩量回踩</span>
              <Switch
                checked={params.hasShrinkingPullback}
                onChange={v => update('hasShrinkingPullback', v)}
              />
            </div>
          )}

          {isPremium && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">连续缩量</span>
              <Switch
                checked={params.hasConsecutiveShrink}
                onChange={v => update('hasConsecutiveShrink', v)}
              />
            </div>
          )}

          {isPremium && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">白线下20</span>
              <Switch
                checked={params.whiteBelowTwenty}
                onChange={v => update('whiteBelowTwenty', v)}
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">只看热门</span>
            <Switch
              checked={params.onlyHot}
              onChange={v => update('onlyHot', v)}
            />
          </div>

          <Space>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={onSearch}
              loading={loading}
            >
              筛选
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => { setParams({ klt: 'daily', j: 0, tolerance: 2, jMode: 'fixed', industries: [], excludeBoards: [], concepts: [], weeklyBull: false, weeklyLowJ: false, dailyLowJ: false, closeAboveShort: false, hasVolumeDouble: false, hasShrinkingPullback: false, hasConsecutiveShrink: false, whiteBelowTwenty: false, onlyHot: false }); setDate(getLastTradingDate()); }}
            >
              重置
            </Button>
            {isAdmin && !conceptOptions.length && (
              <Button
                icon={<TagsOutlined />}
                onClick={handleBuildConcepts}
                loading={buildingConcepts}
              >
                构建概念
              </Button>
            )}
          </Space>
        </div>
      </div>
    </Card>
  );
}
