const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function fetchSectors() {
  return request('/sectors');
}

export function fetchResults(params) {
  const qs = new URLSearchParams(params).toString();
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
