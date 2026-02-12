import { Table, Tag } from 'antd';

function colorJ(j) {
  if (j < -10) return '#4ade80';
  if (j < 0) return '#86efac';
  return '#fde047';
}

function colorDev(d) {
  if (d > 0) return '#f87171';
  if (d < 0) return '#4ade80';
  return '#cbd5e1';
}

const columns = [
  {
    title: '代码',
    dataIndex: 'code',
    width: 90,
    fixed: 'left',
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '名称',
    dataIndex: 'name',
    width: 100,
    fixed: 'left',
  },
  {
    title: '收盘价',
    dataIndex: 'close',
    width: 90,
    align: 'right',
    sorter: (a, b) => a.close - b.close,
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '最低价',
    dataIndex: 'low',
    width: 90,
    align: 'right',
    sorter: (a, b) => a.low - b.low,
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '短期趋势',
    dataIndex: 'shortTrend',
    width: 100,
    align: 'right',
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '短期偏离',
    dataIndex: 'deviationShort',
    width: 100,
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
    width: 100,
    align: 'right',
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '多空偏离',
    dataIndex: 'deviationBull',
    width: 100,
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
  return (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="code"
      size="small"
      pagination={{ pageSize: 50, showSizeChanger: false, showTotal: t => `共 ${t} 条` }}
      scroll={{ x: 900 }}
    />
  );
}
