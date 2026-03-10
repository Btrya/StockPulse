/**
 * 功能权限配置（前端）
 * 修改这里即可控制各功能对不同角色的显隐/开放。
 *
 * 角色等级：guest < user < premium < admin
 * 值填写所需的最低角色，低于该角色则隐藏/禁用。
 */
export const PERMISSIONS = {
  // ── Tab 页面 ──────────────────────────────────────────
  tab_tracking:        'premium',
  tab_backtest:        'premium',
  tab_swing:           'premium',

  // ── 筛选参数 ──────────────────────────────────────────
  param_jMode:              'premium',  // J 值模式（固定/动态）
  param_jThreshold:         'premium',  // J 值阈值
  param_tolerance:          'premium',  // 容差 %
  param_weeklyBull:         'premium',  // 周线多头
  param_weeklyLowJ:         'premium',  // 周线低位
  param_dailyLowJ:          'premium',  // 日线低位
  param_closeAboveShort:    'premium',  // 收盘>短趋
  param_volumeDouble:       'premium',  // 倍量
  param_shrinkingPullback:  'premium',  // 缩量回踩
  param_consecutiveShrink:  'premium',  // 连续缩量
  param_whiteBelowTwenty:   'premium',  // 白线下20
  param_onlyHot:            'user',     // 只看热门

  // ── 管理操作 ──────────────────────────────────────────
  action_buildConcepts:     'admin',   // 构建概念
};

const ROLE_ORDER = ['guest', 'user', 'premium', 'admin'];

/** 判断 role 是否满足 key 对应的最低权限 */
export function can(role, key) {
  const required = PERMISSIONS[key];
  if (!required) return true; // 未配置的默认放行
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(required);
}
