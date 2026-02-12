import { Table, Tag } from 'antd';

function colorDev(d) {
  if (d > 0) return '#f87171';
  if (d < 0) return '#4ade80';
  return '#cbd5e1';
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
    title: '概念',
    dataIndex: 'concepts',
    width: 120,
    filters: [],
    onFilter: (value, record) => (record.concepts || []).includes(value),
    render: v => {
      const list = v || [];
      if (!list.length) return '-';
      const show = list.slice(0, 3);
      const rest = list.length - 3;
      return (
        <span className="text-xs">
          {show.join('、')}{rest > 0 ? ` +${rest}` : ''}
        </span>
      );
    },
  },
  {
    title: '收盘',
    dataIndex: 'close',
    width: 80,
    align: 'right',
    sorter: (a, b) => a.close - b.close,
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '最低',
    dataIndex: 'low',
    width: 80,
    align: 'right',
    sorter: (a, b) => a.low - b.low,
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '短期趋势',
    dataIndex: 'shortTrend',
    width: 90,
    align: 'right',
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '短期偏离',
    dataIndex: 'deviationShort',
    width: 90,
    align: 'right',
    sorter: (a, b) => a.deviationShort - b.deviationShort,
    render: v => (
      <span className="num" style={{ color: colorDev(v) }}>
        {v > 0 ? '+' : ''}{v}%
      </span>
    ),
  },
  {
    title: '多空线',
    dataIndex: 'bullBear',
    width: 90,
    align: 'right',
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '多空偏离',
    dataIndex: 'deviationBull',
    width: 90,
    align: 'right',
    sorter: (a, b) => a.deviationBull - b.deviationBull,
    render: v => (
      <span className="num" style={{ color: colorDev(v) }}>
        {v > 0 ? '+' : ''}{v}%
      </span>
    ),
  },
  {
    title: 'J 值',
    dataIndex: 'j',
    width: 80,
    align: 'right',
    defaultSortOrder: 'ascend',
    sorter: (a, b) => a.j - b.j,
    render: v => (
      <Tag color={v < -10 ? 'green' : v < 0 ? 'cyan' : 'gold'} className="num">
        {v}
      </Tag>
    ),
  },
];

export default function ResultTable({ data }) {
  // 动态生成行业 & 概念 filter
  const industries = [...new Set(data.map(r => r.industry).filter(Boolean))];
  const conceptSet = [...new Set(data.flatMap(r => r.concepts || []))].sort(
    (a, b) => a.localeCompare(b, 'zh-CN')
  );
  const cols = columns.map(c => {
    if (c.dataIndex === 'industry') return { ...c, filters: industries.map(i => ({ text: i, value: i })) };
    if (c.dataIndex === 'concepts') return { ...c, filters: conceptSet.map(i => ({ text: i, value: i })) };
    return c;
  });

  return (
    <Table
      columns={cols}
      dataSource={data}
      rowKey="code"
      size="small"
      pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      scroll={{ x: 900 }}
    />
  );
}
