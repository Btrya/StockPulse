import * as redis from './_lib/redis.js';

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!redis.isConfigured()) {
    return res.status(500).json({ error: 'Redis 未配置' });
  }

  const { email } = req.body || {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: '请输入邮箱' });
  }

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }

  // 从 Hash 表 users 中查询，值直接是 role 字符串
  const role = await redis.hget('users', normalized);
  if (!role) {
    return res.status(403).json({ error: '该邮箱未获得授权，请联系管理员' });
  }

  // 创建不过期的 session token
  const token = generateToken();
  await redis.set(`session:${token}`, { email: normalized, role });

  return res.json({ token, role, email: normalized });
}
