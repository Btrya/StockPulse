import * as redis from './redis.js';

const ROLES = ['guest', 'user', 'premium', 'admin'];

export function roleIndex(role) {
  return ROLES.indexOf(role ?? 'guest');
}

export function hasRole(userRole, required) {
  return roleIndex(userRole) >= roleIndex(required);
}

/**
 * 从请求中获取当前用户 session。
 * 无 token 或无效时返回 { role: 'guest', email: null }。
 */
export async function getRole(req) {
  const token = req.headers['x-auth-token'];
  if (!token) return { role: 'guest', email: null };
  try {
    const session = await redis.get(`session:${token}`);
    if (!session) return { role: 'guest', email: null };
    const { role, email } = typeof session === 'object' ? session : JSON.parse(session);
    return { role: role || 'guest', email: email || null };
  } catch {
    return { role: 'guest', email: null };
  }
}

/**
 * 要求至少 required 权限，否则返回 403。
 * 通过则返回 { role, email }，失败返回 false。
 */
export async function requireRole(req, res, required = 'user') {
  const session = await getRole(req);
  if (!hasRole(session.role, required)) {
    res.status(403).json({ error: '权限不足，请登录高级账号' });
    return false;
  }
  return session;
}
