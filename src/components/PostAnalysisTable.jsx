import { Table, Tag } from 'antd';
import { STRATEGY_LABELS } from '../lib/simulate';

function colorPnl(v) {
  if (v > 0) return '#f87171';
  if (v < 0) return '#4ade80';
  return '#cbd5e1';
}

function fmtPct(v) {
  if (v == null) return '-';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

const EXIT_REASON_COLORS = {
  breakEntryLow: 'red',
  breakBullBear: 'orange',
  fixedStopLoss: 'volcano',
  timeStop: 'gold',
  fixedTakeProfit: 'green',
  bigCandleExit: 'cyan',
  breakShortTrend: 'blue',
  windowEnd: 'default',
};

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
    title: '买入价',
    dataIndex: 'buyPrice',
    width: 80,
    align: 'right',
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '卖出价',
    dataIndex: 'sellPrice',
    width: 80,
    align: 'right',
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '收益%',
    dataIndex: 'ret',
    width: 90,
    align: 'right',
    defaultSortOrder: 'descend',
    sorter: (a, b) => a.ret - b.ret,
    render: v => <span className="num" style={{ color: colorPnl(v) }}>{fmtPct(v)}</span>,
  },
  {
    title: '最大涨幅',
    dataIndex: 'maxPnl',
    width: 90,
    align: 'right',
    sorter: (a, b) => a.maxPnl - b.maxPnl,
    render: v => <span className="num" style={{ color: colorPnl(v) }}>{fmtPct(v)}</span>,
  },
  {
    title: '到最高天数',
    dataIndex: 'maxPnlDay',
    width: 80,
    align: 'right',
    sorter: (a, b) => a.maxPnlDay - b.maxPnlDay,
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '首根大阳',
    dataIndex: 'bigCandleDay',
    width: 80,
    align: 'right',
    render: v => v ? <span className="num">第{v}天</span> : '-',
  },
  {
    title: '持有天数',
    dataIndex: 'holdDays',
    width: 80,
    align: 'right',
    sorter: (a, b) => a.holdDays - b.holdDays,
    render: v => <span className="num">{v}</span>,
  },
  {
    title: '退出原因',
    dataIndex: 'exitReason',
    width: 120,
    filters: [],
    onFilter: (value, record) => record.exitReason === value,
    render: v => (
      <Tag color={EXIT_REASON_COLORS[v] || 'default'} className="m-0">
        {STRATEGY_LABELS[v] || (v === 'windowEnd' ? '窗口到期' : v)}
      </Tag>
    ),
  },
];

export default function PostAnalysisTable({ data }) {
  const industries = [...new Set(data.map(r => r.industry).filter(Boolean))];
  const reasons = [...new Set(data.map(r => r.exitReason).filter(Boolean))];

  const cols = columns.map(c => {
    if (c.dataIndex === 'industry') {
      return { ...c, filters: industries.map(i => ({ text: i, value: i })) };
    }
    if (c.dataIndex === 'exitReason') {
      return {
        ...c,
        filters: reasons.map(r => ({
          text: STRATEGY_LABELS[r] || (r === 'windowEnd' ? '窗口到期' : r),
          value: r,
        })),
      };
    }
    return c;
  });

  return (
    <Table
      columns={cols}
      dataSource={data}
      rowKey="code"
      size="small"
      pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      scroll={{ x: 1000 }}
    />
  );
}
