const STORAGE_KEY = 'sp_session';

export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getAuthToken() {
  return getSession()?.token || null;
}

export function getRole() {
  return getSession()?.role || 'guest';
}

export const ROLES = ['guest', 'user', 'premium', 'admin'];

export function hasRole(required) {
  const current = getRole();
  return ROLES.indexOf(current) >= ROLES.indexOf(required);
}
