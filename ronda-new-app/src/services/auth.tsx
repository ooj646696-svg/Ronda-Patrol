/**
 * Auth Service - Context and Provider
 * Manages authentication state and user session
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../api/auth';
import { setTokens, clearTokens, getAccessToken } from '../api/client';
import { User, LoginResponse } from '../types';

const USER_KEY = '@ronda_user';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (token) {
        const parsedUser = authApi.parseUserFromToken(token);
        setUser(parsedUser);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Load user from storage on mount
    const loadUser = async () => {
      try {
        const userJson = await AsyncStorage.getItem(USER_KEY);
        if (userJson) {
          setUser(JSON.parse(userJson));
        }
      } catch (error) {
        console.error('Failed to load user from storage:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<User> => {
    try {
      const tokens: LoginResponse = await authApi.login(username, password);
      await setTokens(tokens.access, tokens.refresh);
      
      const parsedUser = authApi.parseUserFromToken(tokens.access);
      setUser(parsedUser);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(parsedUser));
      
      return parsedUser;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
      setUser(null);
      await AsyncStorage.removeItem(USER_KEY);
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
