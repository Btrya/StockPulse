const axios = require('axios');
const readline = require('readline-sync');

// ========== 配置区 ==========
const TUSHARE_TOKEN = '你的Tushare token'; // 请替换为真实token
const CONCURRENCY = 5; // 并发请求数，避免频率过高
// ============================

// 通用请求函数
async function tushareRequest(apiName, params = {}) {
  const url = 'http://api.tushare.pro';
  const headers = { 'Content-Type': 'application/json' };
  const body = {
    apiname: apiName,
    token: TUSHARE_TOKEN,
    params: params,
    fields: ''
  };
  try {
    const res = await axios.post(url, body, { headers });
    if (res.data.code !== 0) throw new Error(res.data.msg);
    return res.data.data;
  } catch (err) {
    console.error(`Tushare请求失败[${apiName}]:`, err.message);
    return null;
  }
}

// 获取全部A股股票列表（含行业、地域）
async function getStockList() {
  const data = await tushareRequest('stock_basic', {
    exchange: '',
    list_status: 'L',
    fields: 'ts_code,symbol,name,area,industry,market,list_date'
  });
  return data ? data.items.map(item => ({
    ts_code: item[0],
    symbol: item[1],
    name: item[2],
    area: item[3],      // 地域
    industry: item[4],  // 行业
    market: item[5],
    list_date: item[6]
  })) : [];
}

// 获取概念股列表（简化版：只取概念名称，不拆分具体股票，需要额外接口）
async function getConceptStocks() {
  // Tushare概念信息需要通过concept接口逐条获取，为简化，此处返回空
  // 如需概念筛选，可扩展此函数
  console.warn('概念筛选暂未实现，请使用行业/地域筛选');
  return [];
}

// 获取股票历史日线（用于计算均线和KDJ）
async function getDaily(ts_code, start_date) {
  const data = await tushareRequest('daily', {
    ts_code,
    start_date,
    fields: 'trade_date,open,high,low,close,vol'
  });
  if (!data) return null;
  // 按日期升序（从过去到现在）
  return data.items.map(item => ({
    date: item[0],
    open: item[1],
    high: item[2],
    low: item[3],
    close: item[4],
    vol: item[5]
  })).reverse();
}

// ---------- 指标计算 ----------
// EMA
function ema(arr, period) {
  if (arr.length === 0) return 0;
  let k = 2 / (period + 1);
  let emaArr = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    emaArr.push(arr[i] * k + emaArr[i - 1] * (1 - k));
  }
  return emaArr;
}

// SMA（简单移动平均）
function sma(arr, period) {
  let result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += arr[i - j];
      result.push(sum / period);
    }
  }
  return result;
}

// 计算KDJ (9,3,3)，返回最新一天的K、D、J
function kdj(high, low, close) {
  const period = 9;
  if (high.length < period) return { k: null, d: null, j: null };
  let rsvArr = [];
  for (let i = period - 1; i < high.length; i++) {
    let hh = Math.max(...high.slice(i - period + 1, i + 1));
    let ll = Math.min(...low.slice(i - period + 1, i + 1));
    if (hh === ll) {
      rsvArr.push(50);
    } else {
      rsvArr.push((close[i] - ll) / (hh - ll) * 100);
    }
  }
  let kArr = [], dArr = [];
  // K = 2/3 * 前一日K + 1/3 * RSV
  // D = 2/3 * 前一日D + 1/3 * K
  for (let i = 0; i < rsvArr.length; i++) {
    if (i === 0) {
      kArr.push(rsvArr[i]);
      dArr.push(rsvArr[i]);
    } else {
      kArr.push(kArr[i - 1] * 2 / 3 + rsvArr[i] * 1 / 3);
      dArr.push(dArr[i - 1] * 2 / 3 + kArr[i] * 1 / 3);
    }
  }
  let j = 3 * kArr[kArr.length - 1] - 2 * dArr[dArr.length - 1];
  return {
    k: kArr[kArr.length - 1],
    d: dArr[dArr.length - 1],
    j: j
  };
}

// ---------- 筛选核心 ----------
async function processStock(stock, startDate) {
  // 获取历史日线（至少114天）
  const daily = await getDaily(stock.ts_code, startDate);
  if (!daily || daily.length < 120) return null; // 数据不足

  const closes = daily.map(d => d.close);
  const lows = daily.map(d => d.low);
  const highs = daily.map(d => d.high);

  // 1. 计算短期趋势线：EMA(EMA(C,10),10)
  const ema10 = ema(closes, 10);
  const ema2 = ema(ema10, 10);
  const shortTrend = ema2[ema2.length - 1]; // 最新值

  // 2. 计算多空线：(MA14+MA28+MA57+MA114)/4
  const ma14 = sma(closes, 14).pop();
  const ma28 = sma(closes, 28).pop();
  const ma57 = sma(closes, 57).pop();
  const ma114 = sma(closes, 114).pop();
  if (ma14 === null || ma28 === null || ma57 === null || ma114 === null) return null;
  const duokong = (ma14 + ma28 + ma57 + ma114) / 4;

  // 3. KDJ计算
  const jValue = kdj(highs, lows, closes).j;
  if (jValue === null || jValue >= 0) return null; // 只保留J<0

  // 4. 最低价 > 两条趋势线
  const todayLow = lows[lows.length - 1];
  if (todayLow <= shortTrend || todayLow <= duokong) return null;

  // 通过筛选
  return {
    code: stock.ts_code,
    name: stock.name,
    industry: stock.industry,
    area: stock.area,
    low: todayLow.toFixed(2),
    shortTrend: shortTrend.toFixed(2),
    duokong: duokong.toFixed(2),
    j: jValue.toFixed(2),
  };
}

// ---------- 主程序 ----------
async function main() {
  console.log('正在获取股票列表...');
  let stockList = await getStockList();
  if (!stockList.length) {
    console.error('未获取到股票数据，请检查Token');
    return;
  }
  console.log(`共获取到 ${stockList.length} 只股票`);

  // 交互：板块筛选
  const filterType = readline.question('请选择筛选类型 (1:行业 2:地域 3:概念 [默认:1]): ') || '1';
  let keyword = '';
  if (filterType === '1') {
    keyword = readline.question('请输入行业关键词（留空则不过滤）: ');
  } else if (filterType === '2') {
    keyword = readline.question('请输入地域关键词: ');
  } else {
    console.log('概念筛选暂未实现，将跳过');
  }

  // 根据关键词过滤股票列表
  let filteredStocks = stockList;
  if (keyword) {
    if (filterType === '1') {
      filteredStocks = stockList.filter(s => s.industry && s.industry.includes(keyword));
    } else if (filterType === '2') {
      filteredStocks = stockList.filter(s => s.area && s.area.includes(keyword));
    }
    console.log(`关键词【${keyword}】筛选后剩余 ${filteredStocks.length} 只股票`);
  }

  if (filteredStocks.length === 0) {
    console.log('没有符合条件的股票，退出');
    return;
  }

  // 确定历史数据起始日期（当前日期往前推120天以上）
  const today = new Date();
  const startDate = new Date(today.setDate(today.getDate() - 140)).toISOString().slice(0,10).replace(/-/g,'');

  console.log('开始筛选，请稍候...');
  let results = [];
  // 并发控制
  const chunks = [];
  for (let i = 0; i < filteredStocks.length; i += CONCURRENCY) {
    chunks.push(filteredStocks.slice(i, i + CONCURRENCY));
  }
  for (const chunk of chunks) {
    const promises = chunk.map(stock => processStock(stock, startDate));
    const chunkResults = await Promise.all(promises);
    results = results.concat(chunkResults.filter(r => r !== null));
    process.stdout.write(`已处理 ${results.length}/${filteredStocks.length} 只符合条件\r`);
  }

  console.log('\n====== 筛选结果 ======');
  if (results.length === 0) {
    console.log('无股票满足条件');
  } else {
    console.table(results);
  }
}

main().catch(console.error);