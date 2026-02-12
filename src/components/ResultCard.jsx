import { Card, Tag } from 'antd';

function colorJ(j) {
  if (j < -10) return 'green';
  if (j < 0) return 'cyan';
  return 'gold';
}

export default function ResultCard({ item }) {
  return (
    <Card size="small">
      <div className="flex justify-between items-center mb-2">
        <div>
          <span className="font-medium">{item.name}</span>
          <span className="text-xs text-slate-500 ml-2 num">{item.code}</span>
          {item.industry && <span className="text-xs text-slate-600 ml-2">{item.industry}</span>}
        </div>
        <Tag color={colorJ(item.j)} className="num m-0">J {item.j}</Tag>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">收盘</span>
          <span className="num">{item.close}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">最低</span>
          <span className="num">{item.low}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">短期趋势</span>
          <span className="num">{item.shortTrend} ({item.deviationShort > 0 ? '+' : ''}{item.deviationShort}%)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">多空线</span>
          <span className="num">{item.bullBear} ({item.deviationBull > 0 ? '+' : ''}{item.deviationBull}%)</span>
        </div>
      </div>
    </Card>
  );
}
