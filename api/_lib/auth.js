import * as redis from './redis.js';

const ROLES = ['guest', 'user', 'premium', 'admin'];

export function roleIndex(role) {
  return ROLES.indexOf(role ?? 'guest');
}

export function hasRole(userRole, required) {
  return roleIndex(userRole) >= roleIndex(required);
}

/**
 * 从请求中获取当前用户 role。
 * 无 token 或 token 无效时返回 'guest'。
 */
export async function getRole(req) {
  const token = req.headers['x-auth-token'];
  if (!token) return 'guest';
  try {
    const session = await redis.get(`session:${token}`);
    if (!session) return 'guest';
    const { role } = typeof session === 'object' ? session : JSON.parse(session);
    return role || 'guest';
  } catch {
    return 'guest';
  }
}

/**
 * 要求至少 required 权限，否则返回 403 并中止请求。
 * 返回 role 字符串（通过了校验），或 false（已发送响应）。
 */
export async function requireRole(req, res, required = 'user') {
  const role = await getRole(req);
  if (!hasRole(role, required)) {
    res.status(403).json({ error: '权限不足，请登录高级账号' });
    return false;
  }
  return role;
}
