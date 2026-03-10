import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSession, saveSession, clearSession, getRole, hasRole } from '../lib/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getSession());

  const login = useCallback((sessionData) => {
    saveSession(sessionData);
    setSession(sessionData);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const role = session ? (session.role || 'guest') : 'guest';

  return (
    <AuthContext.Provider value={{ session, login, logout, role, hasRole: (r) => {
      const ROLES = ['guest', 'user', 'premium', 'admin'];
      return ROLES.indexOf(role) >= ROLES.indexOf(r);
    }}}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
