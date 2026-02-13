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

export default function ResultTable({ data, hotData }) {
  const hotSets = useMemo(() => buildHotSets(hotData), [hotData]);

  // 动态生成行业 & 概念 filter
  const industries = [...new Set(data.map(r => r.industry).filter(Boolean))];
  const conceptSet = [...new Set(data.flatMap(r => r.concepts || []))].sort(
    (a, b) => a.localeCompare(b, 'zh-CN')
  );
  const cols = columns.map(c => {
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
      pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      scroll={{ x: 900 }}
    />
  );
}
