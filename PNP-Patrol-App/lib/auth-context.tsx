/**
 * R.O.N.D.A. Driver App — Auth context (JWT + user from token).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setTokens, clearTokens, ronda } from './api';
import { registerPushToken, clearPushToken, setupNotificationListener } from './notifications';

const USER_KEY = '@ronda_user';

type User = { id?: number; username: string; role: string; branchId: number | null; branchName?: string } | null;

const AuthContext = createContext<{
  user: User;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
} | null>(null);

function parseJwtPayload(token: string): User {
  const payload = JSON.parse(atob(token.split('.')[1]));
  const user = {
    id: payload.user_id || payload.id,
    username: payload.username || payload.sub,
    role: payload.role || 'DRIVER',
    branchId: payload.branch_id ?? null,
  };
  console.log('🔍 Parsed user from JWT:', user);
  console.log('🔍 Full JWT payload:', payload);
  return user;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const t = await AsyncStorage.getItem('@ronda_access');
    if (t) setUser(parseJwtPayload(t));
    else setUser(null);
  }, []);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('@ronda_access');
      if (t) setUser(parseJwtPayload(t));
      setLoading(false);
    })();
  }, []);

  // Setup notification listener when app starts
  useEffect(() => {
    const cleanup = setupNotificationListener();
    return cleanup;
  }, []);

  // Register push token when user logs in
  useEffect(() => {
    if (user?.id) {
      console.log('🔔 Registering push token for user:', user.id);
      registerPushToken(user.id);
    }
  }, [user]);

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await ronda.auth.login(username, password);
    await setTokens(tokens.access, tokens.refresh);
    const u = parseJwtPayload(tokens.access);
    setUser(u);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    
    // TODO: Add profile fetch when backend implements /auth/profile/ endpoint
    console.log('🔍 User logged in with JWT data only:', u);
    
    return u;
  }, []);

  const logout = useCallback(async () => {
    await clearTokens();
    await clearPushToken();
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
