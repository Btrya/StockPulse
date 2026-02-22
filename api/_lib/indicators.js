// EMA 计算（返回完整数组）
export function ema(arr, period) {
  if (arr.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    out.push(arr[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

// SMA(X, N, M) 递归加权平均（返回完整数组）
// result[i] = (M * X[i] + (N - M) * result[i-1]) / N
export function smaCN(arr, n, m) {
  if (arr.length === 0) return [];
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    out.push((m * arr[i] + (n - m) * out[i - 1]) / n);
  }
  return out;
}

// SMA - 只返回最后一个值（性能优化）
export function smaLast(arr, period) {
  if (arr.length < period) return null;
  let sum = 0;
  for (let i = arr.length - period; i < arr.length; i++) {
    sum += arr[i];
  }
  return sum / period;
}

// KDJ(9,3,3) - 返回最新 K, D, J
export function kdj(highs, lows, closes) {
  const period = 9;
  if (highs.length < period) return { k: null, d: null, j: null };

  // 构建 RSV 数组
  const rsvArr = [];
  for (let i = period - 1; i < highs.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    rsvArr.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
  }

  // K = 2/3 * prevK + 1/3 * RSV
  // D = 2/3 * prevD + 1/3 * K
  let kVal = rsvArr[0];
  let dVal = rsvArr[0];
  for (let i = 1; i < rsvArr.length; i++) {
    kVal = (kVal * 2) / 3 + (rsvArr[i] * 1) / 3;
    dVal = (dVal * 2) / 3 + (kVal * 1) / 3;
  }
  const jVal = 3 * kVal - 2 * dVal;

  return { k: kVal, d: dVal, j: jVal };
}

// 短期趋势线: EMA(EMA(Close, 10), 10) 最新值
export function shortTrendLine(closes) {
  const e1 = ema(closes, 10);
  const e2 = ema(e1, 10);
  return e2.length > 0 ? e2[e2.length - 1] : null;
}

// 多空线: (MA14 + MA28 + MA57 + MA114) / 4
export function bullBearLine(closes) {
  const ma14 = smaLast(closes, 14);
  const ma28 = smaLast(closes, 28);
  const ma57 = smaLast(closes, 57);
  const ma114 = smaLast(closes, 114);
  if (ma14 === null || ma28 === null || ma57 === null || ma114 === null) return null;
  return (ma14 + ma28 + ma57 + ma114) / 4;
}

// 砖型图指标：返回最近三天的值（判断绿转红需要三天）
// N=4（HHV/LLV 窗口），M=6（双重平滑周期）
export function brickChart(highs, lows, closes, n = 4, m = 6) {
  if (closes.length < n + m + 3) return { brick: null, brickPrev: null, brickPrev2: null };

  // 构建 HHV(HIGH,N) 和 LLV(LOW,N) 序列
  const len = closes.length;
  const var1aArr = [];
  const var3aArr = [];

  for (let i = n - 1; i < len; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    const span = hh - ll === 0 ? 1 : hh - ll;
    var1aArr.push((hh - closes[i]) / span * 100 - 90);
    var3aArr.push((closes[i] - ll) / span * 100);
  }

  // VAR2A = smaCN(VAR1A, N, 1) + 100
  const var2aRaw = smaCN(var1aArr, n, 1);
  const var2a = var2aRaw.map(v => v + 100);

  // VAR4A = smaCN(VAR3A, M, 1)
  const var4a = smaCN(var3aArr, m, 1);

  // VAR5A = smaCN(VAR4A, M, 1) + 100
  const var5aRaw = smaCN(var4a, m, 1);
  const var5a = var5aRaw.map(v => v + 100);

  // VAR6A = VAR5A - VAR2A, 砖型图 = max(VAR6A - 4, 0)
  const minLen = Math.min(var2a.length, var5a.length);
  if (minLen < 3) return { brick: null, brickPrev: null, brickPrev2: null };

  const offset = var2a.length - minLen;
  const last = minLen - 1;

  const brickAt = (i) => {
    const v = var5a[i] - var2a[offset + i];
    return v > 4 ? v - 4 : 0;
  };

  return {
    brick: brickAt(last),
    brickPrev: brickAt(last - 1),
    brickPrev2: brickAt(last - 2),
  };
}
