// 验证砖型图指标的正确性
// 用法: node --env-file=.env.local scripts/verify-brick.mjs [股票代码]
// 示例: node --env-file=.env.local scripts/verify-brick.mjs 000987.SZ

import { getDaily } from '../api/_lib/tushare.js';
import { brickChart, smaCN } from '../api/_lib/indicators.js';

const tsCode = process.argv[2] || '000001.SZ';
const days = 200; // 拉足够多的数据让递归 SMA 收敛

async function main() {
  const startDate = new Date(Date.now() - days * 86400000)
    .toISOString().slice(0, 10).replace(/-/g, '');

  console.log(`拉取 ${tsCode} 日线数据，起始日期 ${startDate} ...`);
  const klines = await getDaily(tsCode, startDate);
  console.log(`共 ${klines.length} 根 K 线\n`);

  if (klines.length < 30) {
    console.log('数据不足，无法计算');
    process.exit(1);
  }

  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const closes = klines.map(k => k.close);

  // ── 逐日计算完整砖型图序列（和通达信对照用） ──
  const N = 4, M = 6;

  // 构建 VAR1A, VAR3A 完整序列
  const var1aArr = [];
  const var3aArr = [];
  for (let i = N - 1; i < klines.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - N + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    const span = hh - ll === 0 ? 1 : hh - ll;
    var1aArr.push((hh - closes[i]) / span * 100 - 90);
    var3aArr.push((closes[i] - ll) / span * 100);
  }

  const var2a = smaCN(var1aArr, N, 1).map(v => v + 100);
  const var4a = smaCN(var3aArr, M, 1);
  const var5a = smaCN(var4a, M, 1).map(v => v + 100);

  const minLen = Math.min(var2a.length, var5a.length);
  const offset = var2a.length - minLen;

  const bricks = [];
  for (let i = 0; i < minLen; i++) {
    const v6 = var5a[i] - var2a[offset + i];
    bricks.push(v6 > 4 ? v6 - 4 : 0);
  }

  // 打印最近 15 天
  const showDays = 15;
  const startIdx = klines.length - showDays;
  const brickOffset = klines.length - (N - 1) - minLen; // klines index → bricks index 的偏移

  console.log('日期         收盘     最高     最低     砖型图    前日砖型图  颜色     绿转红');
  console.log('─'.repeat(90));

  for (let i = startIdx; i < klines.length; i++) {
    const k = klines[i];
    const bi = i - (N - 1) - brickOffset;
    if (bi < 1 || bi >= bricks.length) continue;

    const brick = bricks[bi];
    const brickPrev = bricks[bi - 1];
    const brickPrev2 = bi >= 2 ? bricks[bi - 2] : null;

    const isRed = brick > brickPrev;
    const isGreen = brick < brickPrev;
    const color = isRed ? '红 ▲' : isGreen ? '绿 ▼' : '平 —';

    // VALIDGREENTORED 判断
    let reversal = '';
    if (brickPrev2 != null) {
      const prevGreen = brickPrev < brickPrev2;
      const nowRed = brick > brickPrev;
      const validForce = brick > brickPrev * 2 / 3;
      if (prevGreen && nowRed && validForce) reversal = '← 有效反转';
    }

    const date = k.trade_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    console.log(
      `${date}   ${k.close.toFixed(2).padStart(7)}  ${k.high.toFixed(2).padStart(7)}  ${k.low.toFixed(2).padStart(7)}  ` +
      `${brick.toFixed(4).padStart(9)}  ${brickPrev.toFixed(4).padStart(9)}   ${color}  ${reversal}`
    );
  }

  // ── 用 brickChart 函数验证最后一天的值 ──
  console.log('\n── brickChart() 函数返回值验证 ──');
  const result = brickChart(highs, lows, closes);
  console.log(`brick:      ${result.brick?.toFixed(4)}`);
  console.log(`brickPrev:  ${result.brickPrev?.toFixed(4)}`);
  console.log(`brickPrev2: ${result.brickPrev2?.toFixed(4)}`);

  // 和逐日计算的最后三天对比
  const last = bricks.length - 1;
  console.log(`\n逐日计算验证:`);
  console.log(`bricks[${last}]:   ${bricks[last]?.toFixed(4)}  ${bricks[last]?.toFixed(4) === result.brick?.toFixed(4) ? '✓' : '✗ 不一致!'}`);
  console.log(`bricks[${last-1}]: ${bricks[last-1]?.toFixed(4)}  ${bricks[last-1]?.toFixed(4) === result.brickPrev?.toFixed(4) ? '✓' : '✗ 不一致!'}`);
  console.log(`bricks[${last-2}]: ${bricks[last-2]?.toFixed(4)}  ${bricks[last-2]?.toFixed(4) === result.brickPrev2?.toFixed(4) ? '✓' : '✗ 不一致!'}`);
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
