/**
 * 本地更新热榜数据到 Redis
 * 用法：node scripts/update-hot.mjs
 *
 * 会从 Tushare 拉取热股/行业/概念板块热榜，写入 Upstash Redis。
 * Vercel 函数读到缓存后直接返回，不再实时调 Tushare。
 */

import fs from 'node:fs';
import path from 'node:path';

// 读 .env.local
const envFile = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const TUSHARE_TOKEN = process.env.TUSHARE_TOKEN;
const REDIS_URL     = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN   = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!TUSHARE_TOKEN || !REDIS_URL || !REDIS_TOKEN) {
  console.error('缺少环境变量：TUSHARE_TOKEN / UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
  process.exit(1);
}

// ── Tushare ──────────────────────────────────────────────────
async function tushareCall(apiName, params) {
  const res = await fetch('http://api.tushare.pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_name: apiName, token: TUSHARE_TOKEN, params, fields: '' }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Tushare HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(`Tushare: ${json.msg}`);
  return json.data;
}

function parseData(raw) {
  if (!raw?.items?.length) return [];
  const { fields, items } = raw;
  return items.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
}

async function getThsHot(tradeDate, market) {
  try {
    const data = await tushareCall('ths_hot', { trade_date: tradeDate, market, is_new: 'Y' });
    return parseData(data);
  } catch (e) {
    console.warn(`  ths_hot ${market} ${tradeDate} 失败: ${e.message}`);
    return [];
  }
}

// ── 日期工具 ──────────────────────────────────────────────────
function getCNDate(d) {
  return d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
    .replace(/\//g, '-').split('-').map(s => s.padStart(2, '0')).join('');
}

// ── 去重取最高热度 ────────────────────────────────────────────
function dedupe(arr, keyFn) {
  const map = new Map();
  for (const r of arr) {
    const k = keyFn(r);
    if (!k) continue;
    const prev = map.get(k);
    if (!prev || Number(r.hot) > Number(prev.hot)) map.set(k, r);
  }
  return [...map.values()].sort((a, b) => a.rank - b.rank);
}

// ── Redis SET ─────────────────────────────────────────────────
async function redisSET(key, value, ttlSeconds) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Redis: ${json.error}`);
  return json.result;
}

// ── 主流程 ────────────────────────────────────────────────────
const now = new Date();
let fetchDate = getCNDate(now);

console.log(`开始拉取热榜数据，初始日期: ${fetchDate}`);

let hotStocks = [], hotIndustries = [], hotConcepts = [];

for (let i = 0; i <= 5; i++) {
  const d = getCNDate(new Date(now.getTime() - i * 86400000));
  console.log(`  尝试日期: ${d}`);
  const [s, ind, c] = await Promise.all([
    getThsHot(d, '热股'),
    getThsHot(d, '行业板块'),
    getThsHot(d, '概念板块'),
  ]);
  if (s.length || ind.length || c.length) {
    hotStocks = s; hotIndustries = ind; hotConcepts = c;
    fetchDate = d;
    console.log(`  ✓ 命中: 热股 ${s.length} 条，行业 ${ind.length} 条，概念 ${c.length} 条`);
    break;
  }
}

if (!hotStocks.length && !hotIndustries.length && !hotConcepts.length) {
  console.error('所有日期均无数据，请检查 Tushare 权限或当前是否为非交易日');
  process.exit(1);
}

const data = {
  hotStocks:     dedupe(hotStocks,     r => r.ts_code).map(r => ({ ts_code: r.ts_code, name: r.ts_name, rank: r.rank, hot: r.hot })),
  hotIndustries: dedupe(hotIndustries, r => r.ts_name).map(r => ({ name: r.ts_name, rank: r.rank, hot: r.hot })),
  hotConcepts:   dedupe(hotConcepts,   r => r.ts_name).map(r => ({ name: r.ts_name, rank: r.rank, hot: r.hot })),
};

const TTL = 86400; // 24h（本地更新时给更长 TTL，避免频繁手动执行）
await redisSET('hot:data', data, TTL);

console.log(`\n✓ 写入 Redis 成功`);
console.log(`  数据日期: ${fetchDate}`);
console.log(`  热股: ${data.hotStocks.length} 条`);
console.log(`  行业: ${data.hotIndustries.length} 条`);
console.log(`  概念: ${data.hotConcepts.length} 条`);
console.log(`  TTL: ${TTL}s (${TTL / 3600}h)`);
