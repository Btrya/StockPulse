const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function fetchResults(params) {
  const qs = new URLSearchParams();
  if (params.klt) qs.set('klt', params.klt);
  if (params.j != null) qs.set('j', String(params.j));
  if (params.tolerance != null) qs.set('tolerance', String(params.tolerance));
  if (params.industries?.length) qs.set('industries', params.industries.join(','));
  if (params.excludeBoards?.length) qs.set('excludeBoards', params.excludeBoards.join(','));
  return request(`/results?${qs}`);
}

export function triggerScan(body) {
  return request('/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function fetchStatus() {
  return request('/status');
}
