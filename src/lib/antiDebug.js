/**
 * 反调试：非高级用户打开 devtools 时持续触发 debugger。
 *
 * 原理：debugger 语句在 devtools 打开时会暂停执行，
 * 通过检测函数 toString 时间差来判断是否处于调试状态。
 */

let _timer = null;

function isDevToolsOpen() {
  const threshold = 200;
  const start = performance.now();
  // eslint-disable-next-line no-debugger
  debugger;
  return performance.now() - start > threshold;
}

export function startAntiDebug() {
  if (_timer) return;
  _timer = setInterval(() => {
    if (isDevToolsOpen()) {
      // 持续触发，让 devtools 卡住
      // eslint-disable-next-line no-debugger
      debugger;
    }
  }, 500);
}

export function stopAntiDebug() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
