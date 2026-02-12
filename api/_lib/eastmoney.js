import { CONCURRENCY, BATCH_DELAY_MS, KLINE_LIMIT } from './constants.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Referer: 'https://quote.eastmoney.com/',
};

const BASE = 'https://push2.eastmoney.com/api/qt/clist/get';
const KLINE_BASE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

async function fetchJSON(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 行业板块列表
export async function getSectors() {
  const params = new URLSearchParams({
    pn: '1', pz: '200', po: '1', np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2', invt: '2', fid: 'f3',
    fs: 'm:90+t:2+f:!50',
    fields: 'f12,f14',
  });
  const data = await fetchJSON(`${BASE}?${params}`);
  if (!data?.data?.diff) return [];
  return data.data.diff.map(d => ({ code: d.f12, name: d.f14 }));
}

// 板块成分股
export async function getSectorStocks(sectorCode) {
  const params = new URLSearchParams({
    pn: '1', pz: '1000', po: '1', np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2', invt: '2', fid: 'f3',
    fs: `b:${sectorCode}+f:!50`,
    fields: 'f12,f13,f14',
  });
  const data = await fetchJSON(`${BASE}?${params}`);
  if (!data?.data?.diff) return [];
  return data.data.diff.map(d => ({
    code: d.f12,
    market: d.f13,   // 0=深 1=沪
    name: d.f14,
  }));
}

// 单只股票K线 (klt: 101=日线 102=周线)
export async function getKline(market, code, klt = '101') {
  const secid = `${market}.${code}`;
  const params = new URLSearchParams({
    secid,
    klt, fqt: '1',
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56',
    beg: '0', end: '20500101',
    lmt: String(KLINE_LIMIT),
  });
  const data = await fetchJSON(`${KLINE_BASE}?${params}`);
  if (!data?.data?.klines) return null;
  return data.data.klines.map(line => {
    const [date, open, close, high, low, vol] = line.split(',');
    return {
      date,
      open: +open,
      close: +close,
      high: +high,
      low: +low,
      vol: +vol,
    };
  });
}

// 批量拉取K线（并发控制）
export async function batchGetKlines(stocks, klt = '101') {
  const results = [];
  for (let i = 0; i < stocks.length; i += CONCURRENCY) {
    const batch = stocks.slice(i, i + CONCURRENCY);
    const promises = batch.map(s =>
      getKline(s.market, s.code, klt)
        .then(klines => ({ ...s, klines }))
        .catch(() => ({ ...s, klines: null }))
    );
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
    if (i + CONCURRENCY < stocks.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return results;
}
