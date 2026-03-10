import { getAuthToken } from './auth';

/**
 * 上报前端事件（fire-and-forget，失败静默）
 * @param {'export'|'swing'} event
 */
export function trackEvent(event) {
  const token = getAuthToken();
  if (!token) return;
  fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
    body: JSON.stringify({ action: 'event', event }),
  }).catch(() => {});
}
