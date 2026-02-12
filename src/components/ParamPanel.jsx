import { Select, InputNumber, Radio, Button, Space, Card, Checkbox } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';

const KLT_OPTIONS = [
  { label: '日线', value: 'daily' },
  { label: '周线', value: 'weekly' },
];

const BOARD_OPTIONS = [
  { label: '创业板', value: 'gem' },
  { label: '科创板', value: 'star' },
  { label: '北交所', value: 'bse' },
];

export default function ParamPanel({ params, setParams, industries, onSearch, loading }) {
  const update = (key, val) => setParams(prev => ({ ...prev, [key]: val }));

  const industryOptions = (industries || []).map(i => ({ label: i, value: i }));

  return (
    <Card size="small" className="mb-4" styles={{ body: { padding: '16px' } }}>
      <div className="flex flex-col gap-4">
        {/* 第一行：行业 + 排除板块 */}
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
              onClick={() => setParams({ klt: 'daily', j: 0, tolerance: 2, industries: [], excludeBoards: [] })}
            >
              重置
            </Button>
          </Space>
        </div>
      </div>
    </Card>
  );
}
