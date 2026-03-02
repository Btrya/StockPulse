import { useMemo } from 'react';
import { Table, Tag } from 'antd';
import { buildHotSets, getHotReasons } from '../hooks/useHotData';
import { FireFilled } from '@ant-design/icons';

function colorDev(d) {
  if (d > 0) return '#f87171';
  if (d < 0) return '#4ade80';
  return '#cbd5e1';
}

function renderDev(val, touch) {
  if (val == null) return '-';
  const label = touch === 'H' ? '高' : '低';
  const labelColor = touch === 'H' ? '#94a3b8' : '#64748b';
  return (
    <span className="num">
      <span style={{ color: colorDev(val) }}>{val > 0 ? '+' : ''}{val}%</span>
      <span style={{ color: labelColor, fontSize: 10, marginLeft: 2 }}>{label}</span>
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
    title: '最高',
    dataIndex: 'high',
    width: 80,
    align: 'right',
    sorter: (a, b) => (a.high || 0) - (b.high || 0),
    render: v => <span className="num">{v ?? '-'}</span>,
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
    width: 100,
    align: 'right',
    sorter: (a, b) => a.deviationShort - b.deviationShort,
    render: (v, r) => renderDev(v, r.touchShort),
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
    width: 100,
    align: 'right',
    sorter: (a, b) => a.deviationBull - b.deviationBull,
    render: (v, r) => renderDev(v, r.touchBull),
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

// sensitiveJ 列（动态J值模式使用）
const sensitiveJCol = {
  title: '敏感J',
  dataIndex: 'sensitiveJ',
  width: 80,
  align: 'right',
  sorter: (a, b) => (a.sensitiveJ ?? 0) - (b.sensitiveJ ?? 0),
  render: (v, r) => {
    if (v == null) return <span className="text-slate-500">-</span>;
    const hit = r.j < v;
    return (
      <Tag color={hit ? 'green' : 'default'} className="num">
        {v}
      </Tag>
    );
  },
};

// 连板模式隐藏的列
const LIMIT_UP_HIDE = ['deviationShort', 'shortTrend', 'deviationBull', 'bullBear', 'j'];

// 砖型反转额外列
const changeCol = {
  title: '涨幅',
  dataIndex: 'change',
  width: 80,
  align: 'right',
  sorter: (a, b) => (a.change || 0) - (b.change || 0),
  render: v => {
    if (v == null) return '-';
    const color = v > 0 ? '#f87171' : v < 0 ? '#4ade80' : '#cbd5e1';
    return <span className="num" style={{ color }}>{v > 0 ? '+' : ''}{v}%</span>;
  },
};

const brickCol = {
  title: '砖型',
  dataIndex: 'brick',
  width: 100,
  align: 'right',
  sorter: (a, b) => (a.brick || 0) - (b.brick || 0),
  render: (v, r) => {
    if (v == null) return '-';
    const isRedGtGreen = r.brick > r.brickPrev2;
    return (
      <span className="num text-xs">
        <span style={{ color: '#4ade80' }}>{r.brickPrev2}</span>
        <span className="text-slate-500 mx-0.5">&rarr;</span>
        <span style={{ color: '#f87171' }}>{v}</span>
        {isRedGtGreen && <span className="ml-1 text-amber-400" title="红砖>绿砖">&#9650;</span>}
      </span>
    );
  },
};

const arrangementCol = {
  title: '排列',
  key: 'arrangement',
  width: 60,
  align: 'center',
  render: (_, r) => {
    const isBull = r.shortTrend > r.bullBear;
    return <Tag color={isBull ? 'red' : 'green'} className="m-0">{isBull ? '多' : '空'}</Tag>;
  },
};

// 四线归零列（白线下20策略）
const fl3Col = {
  title: '短期(3)',
  dataIndex: 'fl3',
  width: 80,
  align: 'right',
  sorter: (a, b) => (a.fl3 ?? 0) - (b.fl3 ?? 0),
  render: v => {
    if (v == null) return '-';
    const color = v <= 20 ? '#4ade80' : v >= 80 ? '#f87171' : '#cbd5e1';
    return <span className="num" style={{ color }}>{v}</span>;
  },
};
const fl31Col = {
  title: '长期(31)',
  dataIndex: 'fl31',
  width: 80,
  align: 'right',
  sorter: (a, b) => (a.fl31 ?? 0) - (b.fl31 ?? 0),
  render: v => {
    if (v == null) return '-';
    const color = v >= 70 ? '#f87171' : v <= 20 ? '#4ade80' : '#cbd5e1';
    return <span className="num" style={{ color }}>{v}</span>;
  },
};

// 连板数列
const consecutiveCol = {
  title: '连板',
  dataIndex: 'consecutiveCount',
  width: 70,
  align: 'center',
  defaultSortOrder: 'descend',
  sorter: (a, b) => (a.consecutiveCount || 0) - (b.consecutiveCount || 0),
  render: v => v ? <Tag color={v >= 5 ? 'red' : v >= 3 ? 'orange' : 'blue'}>{v} 板</Tag> : '-',
};

export default function ResultTable({ data, hotData, subTab, jMode }) {
  const hotSets = useMemo(() => buildHotSets(hotData), [hotData]);
  const isLimitUp = subTab === 'consecutiveLimitUp';
  const isBrick = subTab === 'brickReversal';
  const isWhiteBelow = subTab === 'whiteBelowTwenty';

  // 动态生成行业 & 概念 filter
  const industries = [...new Set(data.map(r => r.industry).filter(Boolean))];
  const conceptSet = [...new Set(data.flatMap(r => r.concepts || []))].sort(
    (a, b) => a.localeCompare(b, 'zh-CN')
  );

  let baseCols;
  if (isLimitUp) {
    baseCols = [...columns.filter(c => !LIMIT_UP_HIDE.includes(c.dataIndex)), consecutiveCol];
  } else if (isBrick) {
    // 砖型反转：在收盘后插入涨幅、砖型、排列列
    const idx = columns.findIndex(c => c.dataIndex === 'close');
    baseCols = [
      ...columns.slice(0, idx + 1),
      changeCol,
      brickCol,
      arrangementCol,
      ...columns.slice(idx + 1),
    ];
    // 在 J 值列后插入 sensitiveJ 列
    const jPos = baseCols.findIndex(c => c.dataIndex === 'j');
    if (jPos >= 0) baseCols.splice(jPos + 1, 0, sensitiveJCol);
  } else if (isWhiteBelow) {
    const idx = columns.findIndex(c => c.dataIndex === 'close');
    baseCols = [
      ...columns.slice(0, idx + 1),
      changeCol,
      fl3Col,
      fl31Col,
      ...columns.slice(idx + 1),
    ];
  } else {
    baseCols = [...columns];
    if (jMode === 'dynamic') {
      const jPos = baseCols.findIndex(c => c.dataIndex === 'j');
      if (jPos >= 0) baseCols.splice(jPos + 1, 0, sensitiveJCol);
    }
  }

  const cols = baseCols.map(c => {
    if (c.dataIndex === 'industry') return { ...c, filters: industries.map(i => ({ text: i, value: i })) };
    if (c.dataIndex === 'concepts') return { ...c, filters: conceptSet.map(i => ({ text: i, value: i })) };
    if (c.dataIndex === 'name' && hotSets) {
      return {
        ...c,
        render: (v, record) => {
          const reasons = getHotReasons(record, hotSets);
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
    const reasons = getHotReasons(record, hotSets);
    return reasons.length ? 'hot-row' : '';
  };

  return (
    <Table
      columns={cols}
      dataSource={data}
      rowKey="code"
      size="small"
      rowClassName={rowClassName}
      pagination={{ defaultPageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      scroll={{ x: 900 }}
    />
  );
}
