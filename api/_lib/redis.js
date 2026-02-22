const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

async function cmd(...args) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Redis HTTP ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`Redis: ${data.error}`);
  return data.result;
}

export async function get(key) {
  const val = await cmd('GET', key);
  if (val === null || val === undefined) return null;
  try { return JSON.parse(val); } catch { return val; }
}

export async function set(key, value, ttl) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (ttl) {
    return cmd('SET', key, str, 'EX', String(ttl));
  }
  return cmd('SET', key, str);
}

export async function del(...keys) {
  return cmd('DEL', ...keys);
}

export async function keys(pattern) {
  return cmd('KEYS', pattern);
}

export function isConfigured() {
  return !!(url && token);
}
