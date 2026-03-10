import * as redis from './_lib/redis.js';
import { requireRole } from './_lib/auth.js';

const VALID_ROLES = ['user', 'premium', 'admin'];

export default async function handler(req, res) {
  const role = await requireRole(req, res, 'admin');
  if (!role) return;

  // GET /api/admin — 列出所有用户
  if (req.method === 'GET') {
    const map = await redis.hgetall('users');
    const users = Object.entries(map).map(([email, role]) => ({ email, role }));
    return res.json({ users });
  }

  // POST /api/admin — 添加或修改用户 { email, role }
  if (req.method === 'POST') {
    const { email, role: newRole } = req.body || {};
    if (!email || !newRole) {
      return res.status(400).json({ error: '缺少 email 或 role 参数' });
    }
    const normalized = email.trim().toLowerCase();
    if (!VALID_ROLES.includes(newRole)) {
      return res.status(400).json({ error: `role 必须是 ${VALID_ROLES.join(' / ')}` });
    }
    await redis.hset('users', normalized, newRole);
    return res.json({ ok: true, email: normalized, role: newRole });
  }

  // DELETE /api/admin — 删除用户 { email }
  if (req.method === 'DELETE') {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: '缺少 email 参数' });
    }
    const normalized = email.trim().toLowerCase();
    await redis.hdel('users', normalized);
    return res.json({ ok: true, email: normalized });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
