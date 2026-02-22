import { useState } from 'react';
import { Select, InputNumber, Radio, Button, Space, Card, Checkbox, DatePicker, message } from 'antd';
import { SearchOutlined, ReloadOutlined, TagsOutlined } from '@ant-design/icons';
import { buildConcepts } from '../lib/api';
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

export default function ParamPanel({ params, setParams, date, setDate, industries, concepts, onSearch, loading, hotData }) {
  const update = (key, val) => setParams(prev => ({ ...prev, [key]: val }));
  const [buildingConcepts, setBuildingConcepts] = useState(false);

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
              onChange={e => update('klt', e.target.value)}
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
              筛选
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => { setParams({ klt: 'daily', j: 0, tolerance: 2, industries: [], excludeBoards: [], concepts: [] }); setDate(getLastTradingDate()); }}
            >
              重置
            </Button>
            {!conceptOptions.length && (
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
