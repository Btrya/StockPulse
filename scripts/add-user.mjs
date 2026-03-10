/**
 * 用法：
 *   node scripts/add-user.mjs <email> <role>
 *
 * role 可选值：user | premium | admin
 *
 * 示例：
 *   node scripts/add-user.mjs yourmail@example.com admin
 *   node scripts/add-user.mjs friend@qq.com premium
 */

const [,, email, role] = process.argv;

if (!email || !role) {
  console.error('用法: node scripts/add-user.mjs <email> <role>');
  console.error('role 可选: user | premium | admin');
  process.exit(1);
}

if (!['user', 'premium', 'admin'].includes(role)) {
  console.error('role 必须是 user / premium / admin');
  process.exit(1);
}

// 读取 .env.local（Vercel 本地开发用的环境变量文件）
const fs = await import('node:fs');
const path = await import('node:path');
const envFile = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error('未找到 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
  console.error('请确认 .env.local 文件存在且包含这两个变量');
  process.exit(1);
}

const normalized = email.trim().toLowerCase();

const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(['HSET', 'users', normalized, role]),
});
const data = await res.json();

if (data.error) {
  console.error('Redis 错误:', data.error);
  process.exit(1);
}

console.log(`✓ 已添加用户: ${normalized} → ${role}`);
