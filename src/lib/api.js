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
  if (params.concepts?.length) qs.set('concepts', params.concepts.join(','));
  return request(`/results?${qs}`);
}

export function triggerScan(body) {
  return request('/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function buildConcepts() {
  return request('/concepts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export function fetchStatus() {
  return request('/status');
}

export function fetchTracking(params) {
  const qs = new URLSearchParams();
  if (params.klt) qs.set('klt', params.klt);
  if (params.minDays != null) qs.set('minDays', String(params.minDays));
  if (params.j != null) qs.set('j', String(params.j));
  if (params.tolerance != null) qs.set('tolerance', String(params.tolerance));
  if (params.industries?.length) qs.set('industries', params.industries.join(','));
  if (params.excludeBoards?.length) qs.set('excludeBoards', params.excludeBoards.join(','));
  if (params.concepts?.length) qs.set('concepts', params.concepts.join(','));
  return request(`/tracking?${qs}`);
}

export function triggerBacktest(body) {
  return request('/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function fetchBacktestResults(params) {
  const qs = new URLSearchParams();
  qs.set('date', params.date);
  if (params.klt) qs.set('klt', params.klt);
  if (params.j != null) qs.set('j', String(params.j));
  if (params.tolerance != null) qs.set('tolerance', String(params.tolerance));
  if (params.industries?.length) qs.set('industries', params.industries.join(','));
  if (params.excludeBoards?.length) qs.set('excludeBoards', params.excludeBoards.join(','));
  if (params.concepts?.length) qs.set('concepts', params.concepts.join(','));
  return request(`/backtest-results?${qs}`);
}
