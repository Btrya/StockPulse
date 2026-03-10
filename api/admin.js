import * as redis from './_lib/redis.js';
import { requireRole, getRole } from './_lib/auth.js';
import { recordEvent } from './_lib/stats.js';

const VALID_ROLES = ['user', 'premium', 'admin'];
const TRACK_EVENTS = ['scan', 'backtest', 'tracking', 'swing', 'export', 'post_analysis'];

export default async function handler(req, res) {
  // ── POST /api/admin { action:'event', event:'export' } ——
  // 普通用户也可以上报前端事件，不需要 admin 权限
  if (req.method === 'POST' && req.body?.action === 'event') {
    const { role, email } = await getRole(req);
    if (!email) return res.status(401).json({ error: '未登录' });
    const { event } = req.body;
    if (!TRACK_EVENTS.includes(event)) return res.status(400).json({ error: '未知事件' });
    await recordEvent(email, event);
    return res.json({ ok: true });
  }

  // 以下接口需要 admin 权限
  const session = await requireRole(req, res, 'admin');
  if (!session) return;

  // GET /api/admin — 列出所有用户
  // GET /api/admin?view=stats — 查看操作统计
  if (req.method === 'GET') {
    const usersMap = await redis.hgetall('users');
    const users = Object.entries(usersMap).map(([email, role]) => ({ email, role }));

    if (req.query.view === 'stats') {
      const statsEntries = await Promise.all(
        users.map(async ({ email, role }) => {
          const s = await redis.hgetall(`stats:${email}`);
          return { email, role, ...s };
        })
      );
      return res.json({ stats: statsEntries });
    }

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

  // DELETE /api/admin — 删除用户 { email } 或清空统计 { email, action:'resetStats' }
  if (req.method === 'DELETE') {
    const { email, action } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: '缺少 email 参数' });
    }
    const normalized = email.trim().toLowerCase();
    if (action === 'resetStats') {
      await redis.del(`stats:${normalized}`);
      return res.json({ ok: true, email: normalized });
    }
    await redis.hdel('users', normalized);
    return res.json({ ok: true, email: normalized });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
