import { Table, Tag } from 'antd';

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
    title: '短期偏离(低)',
    dataIndex: ['latest', 'deviationShort'],
    width: 100,
    align: 'right',
    render: v => (
      <span className="num" style={{ color: colorDev(v) }}>
        {v > 0 ? '+' : ''}{v}%
      </span>
    ),
  },
  {
    title: '短期偏离(高)',
    dataIndex: ['latest', 'deviationShortHigh'],
    width: 100,
    align: 'right',
    render: v => v != null ? (
      <span className="num" style={{ color: colorDev(v) }}>
        {v > 0 ? '+' : ''}{v}%
      </span>
    ) : '-',
  },
  {
    title: '多空偏离(低)',
    dataIndex: ['latest', 'deviationBull'],
    width: 100,
    align: 'right',
    render: v => (
      <span className="num" style={{ color: colorDev(v) }}>
        {v > 0 ? '+' : ''}{v}%
      </span>
    ),
  },
  {
    title: '多空偏离(高)',
    dataIndex: ['latest', 'deviationBullHigh'],
    width: 100,
    align: 'right',
    render: v => v != null ? (
      <span className="num" style={{ color: colorDev(v) }}>
        {v > 0 ? '+' : ''}{v}%
      </span>
    ) : '-',
  },
];

export default function TrackingTable({ data }) {
  const industries = [...new Set(data.map(r => r.industry).filter(Boolean))];
  const cols = columns.map(c => {
    if (c.dataIndex === 'industry') return { ...c, filters: industries.map(i => ({ text: i, value: i })) };
    return c;
  });

  return (
    <Table
      columns={cols}
      dataSource={data}
      rowKey="ts_code"
      size="small"
      pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      scroll={{ x: 1000 }}
    />
  );
}
