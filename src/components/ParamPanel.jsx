import { Select, InputNumber, Radio, Button, Space, Card } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';

const KLT_OPTIONS = [
  { label: '日线', value: '101' },
  { label: '周线', value: '102' },
];

export default function ParamPanel({ params, setParams, sectors, sectorsLoading, onSearch, loading }) {
  const update = (key, val) => setParams(prev => ({ ...prev, [key]: val }));

  const sectorOptions = sectors.map(s => ({ label: s.name, value: s.code }));

  return (
    <Card size="small" className="mb-4" styles={{ body: { padding: '16px' } }}>
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-end flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">行业板块</span>
          <Select
            showSearch
            placeholder="选择行业板块"
            optionFilterProp="label"
            options={sectorOptions}
            value={params.sector || undefined}
            onChange={v => update('sector', v)}
            loading={sectorsLoading}
            style={{ width: 180 }}
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
            disabled={!params.sector}
          >
            筛选
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setParams({ sector: '', j: 0, tolerance: 2, klt: '101' })}
          >
            重置
          </Button>
        </Space>
      </div>
    </Card>
  );
}
