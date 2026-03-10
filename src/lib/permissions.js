/**
 * 功能权限配置（前端）
 * 修改这里即可控制各功能对不同角色的显隐/开放。
 *
 * 角色等级：guest < user < premium < admin
 * 值填写所需的最低角色，低于该角色则隐藏/禁用。
 */
export const PERMISSIONS = {
  // ── Tab 页面 ──────────────────────────────────────────
  tab_tracking:        'user',
  tab_backtest:        'user',
  tab_swing:           'user',

  // ── 筛选参数（通用）──────────────────────────────────
  param_jMode:              'premium',  // J 值模式（固定/动态）/ 动态J值
  param_jThreshold:         'premium',  // J 值阈值 / J值上限（含结果列显示）
  param_tolerance:          'user',     // 容差 %
  param_weeklyBull:         'user',     // 周线多头
  param_weeklyLowJ:         'user',     // 周线低位
  param_dailyLowJ:          'user',     // 日线低位
  param_closeAboveShort:    'premium',  // 收盘>短趋
  param_volumeDouble:       'user',     // 倍量
  param_shrinkingPullback:  'user',     // 缩量回踩
  param_consecutiveShrink:  'user',     // 连续缩量
  param_whiteBelowTwenty:   'premium',  // 白线下20
  param_onlyHot:            'user',     // 只看热门

  // ── 超短线独有参数 ────────────────────────────────────
  param_maxGain:            'user',     // 涨幅上限
  param_arrangement:        'user',     // 均线排列（多头/空头/不限）
  param_nearLine:           'user',     // 触碰趋势线
  param_redGtGreen:         'premium',  // 红砖>绿砖
  param_upperLeBody:        'premium',  // 上影线≤实体

  // ── 管理操作 ──────────────────────────────────────────
  action_triggerScan:       'admin',   // 手动触发数据扫描
  action_buildConcepts:     'admin',   // 构建概念
};

const ROLE_ORDER = ['guest', 'user', 'premium', 'admin'];

/** 判断 role 是否满足 key 对应的最低权限 */
export function can(role, key) {
  const required = PERMISSIONS[key];
  if (!required) return true; // 未配置的默认放行
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(required);
}
