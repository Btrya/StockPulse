import { Card, Tag } from 'antd';

function colorJ(j) {
  if (j < -10) return 'green';
  if (j < 0) return 'cyan';
  return 'gold';
}

function directionLabel(dir) {
  if (dir === 'rising') return { text: '上升', color: 'green' };
  if (dir === 'falling') return { text: '下降', color: 'red' };
  return { text: '持平', color: 'default' };
}

export default function TrackingCard({ item }) {
  const dir = directionLabel(item.jDirection);
  const daysColor = item.consecutiveDays >= 4 ? 'red' : item.consecutiveDays >= 3 ? 'orange' : 'blue';

  return (
    <Card size="small">
      <div className="flex justify-between items-center mb-2">
        <div>
          <span className="font-medium">{item.name}</span>
          <span className="text-xs text-slate-500 ml-2 num">{item.code}</span>
          {item.industry && <span className="text-xs text-slate-600 ml-2">{item.industry}</span>}
        </div>
        <div className="flex gap-1">
          <Tag color={daysColor} className="m-0">连续{item.consecutiveDays}天</Tag>
          <Tag color={dir.color} className="m-0">{dir.text}</Tag>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-2 text-xs">
        <span className="text-slate-400">J趋势:</span>
        {item.jTrend?.map((j, i) => (
          <span key={i} className="num">
            <span style={{ color: j < 0 ? '#4ade80' : '#facc15' }}>{j}</span>
            {i < item.jTrend.length - 1 && <span className="text-slate-500"> → </span>}
          </span>
        ))}
      </div>

      {item.latest?.concepts?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {item.latest.concepts.slice(0, 4).map(c => (
            <Tag key={c} color="blue" className="m-0 text-xs">{c}</Tag>
          ))}
          {item.latest.concepts.length > 4 && (
            <span className="text-xs text-slate-400">+{item.latest.concepts.length - 4}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">收盘</span>
          <span className="num">{item.latest?.close}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">最新J</span>
          <Tag color={colorJ(item.latest?.j)} className="num m-0">{item.latest?.j}</Tag>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">短期偏离</span>
          <span className="num">
            {item.latest?.deviationShort != null
              ? <>{item.latest.deviationShort > 0 ? '+' : ''}{item.latest.deviationShort}% <span className="text-slate-500">{item.latest.touchShort === 'H' ? '高' : '低'}</span></>
              : '-'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">多空偏离</span>
          <span className="num">
            {item.latest?.deviationBull != null
              ? <>{item.latest.deviationBull > 0 ? '+' : ''}{item.latest.deviationBull}% <span className="text-slate-500">{item.latest.touchBull === 'H' ? '高' : '低'}</span></>
              : '-'}
          </span>
        </div>
      </div>

      <div className="mt-1 text-xs text-slate-500 num">
        {item.dates?.join(' → ')}
      </div>
    </Card>
  );
}
