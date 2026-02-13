import { useMemo } from 'react';
import { Card, Tag } from 'antd';
import { FireFilled } from '@ant-design/icons';
import { buildHotSets, getHotReasons } from '../hooks/useHotData';

function colorJ(j) {
  if (j < -10) return 'green';
  if (j < 0) return 'cyan';
  return 'gold';
}

function touchLabel(t) {
  return t === 'H' ? '高' : '低';
}

export default function ResultCard({ item, hotData }) {
  const hotSets = useMemo(() => buildHotSets(hotData), [hotData]);
  const reasons = hotSets ? getHotReasons(item, hotSets) : [];
  const isHot = reasons.length > 0;

  return (
    <Card size="small" className={isHot ? 'hot-card' : ''}>
      <div className="flex justify-between items-center mb-2">
        <div>
          <span className="font-medium">{item.name}</span>
          <span className="text-xs text-slate-500 ml-2 num">{item.code}</span>
          {item.industry && <span className="text-xs text-slate-600 ml-2">{item.industry}</span>}
          {reasons.map(r => (
            <Tag key={r} color="volcano" className="m-0 ml-1 text-xs" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
              <FireFilled /> {r}
            </Tag>
          ))}
        </div>
        <Tag color={colorJ(item.j)} className="num m-0">J {item.j}</Tag>
      </div>
      {item.concepts?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {item.concepts.slice(0, 4).map(c => (
            <Tag key={c} color="blue" className="m-0 text-xs">{c}</Tag>
          ))}
          {item.concepts.length > 4 && (
            <span className="text-xs text-slate-400">+{item.concepts.length - 4}</span>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">收盘</span>
          <span className="num">{item.close}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">最低 / 最高</span>
          <span className="num">{item.low} / {item.high ?? '-'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">短趋偏离</span>
          <span className="num">{item.deviationShort > 0 ? '+' : ''}{item.deviationShort}% <span className="text-slate-500">{touchLabel(item.touchShort)}</span></span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">多空偏离</span>
          <span className="num">{item.deviationBull > 0 ? '+' : ''}{item.deviationBull}% <span className="text-slate-500">{touchLabel(item.touchBull)}</span></span>
        </div>
      </div>
    </Card>
  );
}
