const TUSHARE_URL = 'http://api.tushare.pro';

function getToken() {
  return process.env.TUSHARE_TOKEN;
}

async function tushareRequest(apiName, params = {}, fields = '') {
  const res = await fetch(TUSHARE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_name: apiName,
      token: getToken(),
      params,
      fields,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Tushare HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Tushare: ${data.msg}`);
  return data.data;
}

// 解析 Tushare 返回的 fields+items 格式
function parseData(data) {
  if (!data || !data.fields || !data.items) return [];
  return data.items.map(row => {
    const obj = {};
    data.fields.forEach((f, i) => { obj[f] = row[i]; });
    return obj;
  });
}

// 获取全量A股列表
export async function getStockList() {
  const data = await tushareRequest('stock_basic', {
    exchange: '',
    list_status: 'L',
  }, 'ts_code,symbol,name,area,industry,market,list_date');
  return parseData(data);
}

// 获取日线行情（单只股票，最近 N 天）
export async function getDaily(tsCode, startDate) {
  const data = await tushareRequest('daily', {
    ts_code: tsCode,
    start_date: startDate,
  }, 'trade_date,open,high,low,close,vol');
  const rows = parseData(data);
  // Tushare 返回倒序（最新在前），需反转
  rows.reverse();
  return rows;
}

// 获取周线行情
export async function getWeekly(tsCode, startDate) {
  const data = await tushareRequest('weekly', {
    ts_code: tsCode,
    start_date: startDate,
  }, 'trade_date,open,high,low,close,vol');
  const rows = parseData(data);
  rows.reverse();
  return rows;
}

// 获取同花顺概念板块列表
export async function getThsConceptList() {
  const data = await tushareRequest('ths_index', { exchange: 'A', type: 'N' }, 'ts_code,name');
  return parseData(data);
}

// 获取某概念板块的成分股
export async function getThsMembers(tsCode) {
  const data = await tushareRequest('ths_member', { ts_code: tsCode });
  return parseData(data);
}

// 批量获取行情（带限流）
export async function batchGetKlines(stocks, klt = 'daily', startDate) {
  const { TUSHARE_DELAY_MS } = await import('./constants.js');
  const fn = klt === 'weekly' ? getWeekly : getDaily;
  const results = [];
  for (const stock of stocks) {
    try {
      const klines = await fn(stock.ts_code, startDate);
      results.push({ ...stock, klines });
    } catch {
      results.push({ ...stock, klines: null });
    }
    await new Promise(r => setTimeout(r, TUSHARE_DELAY_MS));
  }
  return results;
}
