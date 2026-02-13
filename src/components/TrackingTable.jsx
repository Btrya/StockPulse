import { useMemo } from 'react';
import { Table, Tag } from 'antd';
import { FireFilled } from '@ant-design/icons';
import { buildHotSets, getHotReasons } from '../hooks/useHotData';

function colorJ(j) {
  if (j < -10) return 'green';
  if (j < 0) return 'cyan';
  return 'gold';
}

function colorDev(d) {
  if (d > 0) return '#f87171';
  if (d < 0) return '#4ade80';
  return '#cbd5e1';
}

function directionLabel(dir) {
  if (dir === 'rising') return { text: '上升', color: '#4ade80', arrow: '\u2191' };
  if (dir === 'falling') return { text: '下降', color: '#f87171', arrow: '\u2193' };
  return { text: '持平', color: '#cbd5e1', arrow: '\u2192' };
}

function renderDev(val, touch) {
  if (val == null) return '-';
  const label = touch === 'H' ? '高' : '低';
  return (
    <span className="num">
      <span style={{ color: colorDev(val) }}>{val > 0 ? '+' : ''}{val}%</span>
      <span style={{ color: '#94a3b8', fontSize: 10, marginLeft: 2 }}>{label}</span>
    </span>
  );
}

const columns = [
  {
    title: '代码',
    dataIndex: 'code',
    width: 80,
    fixed: 'left',
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '名称',
    dataIndex: 'name',
    width: 90,
    fixed: 'left',
  },
  {
    title: '行业',
    dataIndex: 'industry',
    width: 80,
    filters: [],
    onFilter: (value, record) => record.industry === value,
  },
  {
    title: '连续',
    dataIndex: 'consecutiveDays',
    width: 70,
    align: 'center',
    sorter: (a, b) => a.consecutiveDays - b.consecutiveDays,
    defaultSortOrder: 'descend',
    render: (v, record) => {
      const color = v >= 4 ? 'red' : v >= 3 ? 'orange' : 'blue';
      return <Tag color={color}>{v}{record.latest?.klt === 'weekly' ? '周' : '天'}</Tag>;
    },
  },
  {
    title: 'J 值趋势',
    dataIndex: 'jTrend',
    width: 200,
    render: (trend, record) => {
      if (!trend || !trend.length) return '-';
      const dir = directionLabel(record.jDirection);
      return (
        <span className="num text-xs">
          {trend.map((j, i) => (
            <span key={i}>
              <span style={{ color: j < 0 ? '#4ade80' : '#facc15' }}>{j}</span>
              {i < trend.length - 1 && <span className="text-slate-500"> {'\u2192'} </span>}
            </span>
          ))}
          <span style={{ color: dir.color, marginLeft: 4 }}>{dir.arrow}</span>
        </span>
      );
    },
  },
  {
    title: '日期',
    dataIndex: 'dates',
    width: 160,
    render: dates => <span className="num text-xs text-slate-400">{(dates || []).join(', ')}</span>,
  },
  {
    title: '最新J',
    dataIndex: ['latest', 'j'],
    width: 80,
    align: 'right',
    sorter: (a, b) => a.latest.j - b.latest.j,
    render: v => <Tag color={colorJ(v)} className="num m-0">{v}</Tag>,
  },
  {
    title: '收盘',
    dataIndex: ['latest', 'close'],
    width: 80,
    align: 'right',
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '短期偏离',
    dataIndex: ['latest', 'deviationShort'],
    width: 100,
    align: 'right',
    render: (v, r) => renderDev(v, r.latest?.touchShort),
  },
  {
    title: '多空偏离',
    dataIndex: ['latest', 'deviationBull'],
    width: 100,
    align: 'right',
    render: (v, r) => renderDev(v, r.latest?.touchBull),
  },
];

// 从 tracking record 构造 getHotReasons 需要的对象
function toHotTarget(record) {
  return {
    ts_code: record.ts_code,
    industry: record.industry,
    concepts: record.latest?.concepts || [],
  };
}

export default function TrackingTable({ data, hotData }) {
  const hotSets = useMemo(() => buildHotSets(hotData), [hotData]);

  const industries = [...new Set(data.map(r => r.industry).filter(Boolean))];
  const cols = columns.map(c => {
    if (c.dataIndex === 'industry') return { ...c, filters: industries.map(i => ({ text: i, value: i })) };
    if (c.dataIndex === 'name' && hotSets) {
      return {
        ...c,
        render: (v, record) => {
          const reasons = getHotReasons(toHotTarget(record), hotSets);
          return (
            <span>
              {v}
              {reasons.map(r => (
                <Tag key={r} color="volcano" className="m-0 ml-1 text-xs" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                  <FireFilled /> {r}
                </Tag>
              ))}
            </span>
          );
        },
      };
    }
    return c;
  });

  const rowClassName = (record) => {
    if (!hotSets) return '';
    const reasons = getHotReasons(toHotTarget(record), hotSets);
    return reasons.length ? 'hot-row' : '';
  };

  return (
    <Table
      columns={cols}
      dataSource={data}
      rowKey="ts_code"
      size="small"
      rowClassName={rowClassName}
      pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      scroll={{ x: 1000 }}
    />
  );
}
