// 获取北京时间当天日期 YYYY-MM-DD
function getCNDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

// 获取最近一个交易日（周末回退到周五）
export function getLastTradingDate(now = new Date()) {
  const cnDate = getCNDate(now);
  const d = new Date(cnDate + 'T12:00:00+08:00');
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() - 2);
  else if (day === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
