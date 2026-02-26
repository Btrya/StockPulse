import { Statistic, Card, Row, Col } from 'antd';

function fmtPct(v) {
  if (v == null || !isFinite(v)) return '-';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

function pctColor(v) {
  if (v > 0) return '#f87171';
  if (v < 0) return '#4ade80';
  return '#cbd5e1';
}

export default function PostAnalysisStats({ stats }) {
  if (!stats) return null;

  const items = [
    { title: '交易数', value: stats.total, suffix: '只' },
    { title: '胜率', value: stats.winRate, suffix: '%', color: stats.winRate >= 50 ? '#f87171' : '#4ade80' },
    { title: '平均收益', value: fmtPct(stats.avgReturn), color: pctColor(stats.avgReturn) },
    { title: '中位数收益', value: fmtPct(stats.medianReturn), color: pctColor(stats.medianReturn) },
    { title: '盈亏比', value: isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞' },
    { title: '平均持有天数', value: stats.avgHoldDays, suffix: '天' },
    { title: '最大盈利', value: fmtPct(stats.maxWin), color: '#f87171' },
    { title: '最大亏损', value: fmtPct(stats.maxLoss), color: '#4ade80' },
  ];

  return (
    <Row gutter={[12, 12]} className="mb-4">
      {items.map(item => (
        <Col key={item.title} xs={12} sm={8} md={6} lg={3}>
          <Card size="small" className="text-center">
            <Statistic
              title={<span className="text-xs">{item.title}</span>}
              value={item.value}
              suffix={item.suffix}
              valueStyle={{ fontSize: 16, color: item.color || undefined }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
