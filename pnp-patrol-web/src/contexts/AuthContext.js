/**
 * R.O.N.D.A. — Auth context: JWT storage, user role (SUPER_ADMIN / BRANCH_ADMIN).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as ronda from '../api/ronda';

const AuthContext = createContext(null);

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const USER_KEY = 'rondaUser';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const persistTokens = useCallback((access, refresh, userData) => {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    if (userData) {
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      setUser(userData);
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const tokens = await ronda.auth.login(username, password);
    localStorage.setItem(ACCESS_KEY, tokens.access);
    localStorage.setItem(REFRESH_KEY, tokens.refresh);
    const userData = parseJwtPayload(tokens.access);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_KEY);
    if (token && !user) {
      try {
        setUser(parseJwtPayload(token));
      } catch {
        logout();
      }
    }
    setLoading(false);
  }, [user, logout]);

  const value = { user, loading, login, logout, persistTokens };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function parseJwtPayload(token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return {
    username: payload.username || payload.sub,
    userId: payload.user_id ?? payload.sub,
    role: payload.role || 'BRANCH_ADMIN',
    branchId: payload.branch_id ?? null,
    branchName: payload.branch_name || null,
  };
}
