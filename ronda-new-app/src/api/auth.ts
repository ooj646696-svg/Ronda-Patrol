/**
 * Auth API
 * Handles authentication endpoints
 */
import { apiClient } from './client';
import { setTokens, clearTokens, getAccessToken } from './client';
import { LoginResponse, User } from '../types';

export const authApi = {
  /**
   * Login with username and password
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/token/', {
      username,
      password,
    });
    return response.data;
  },

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ access: string }> {
    const response = await apiClient.post<{ access: string }>('/auth/token/refresh/', {
      refresh: refreshToken,
    });
    return response.data;
  },

  /**
   * Logout - clear tokens
   */
  async logout(): Promise<void> {
    await clearTokens();
  },

  /**
   * Parse user from JWT token
   */
  parseUserFromToken(token: string): User {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        id: payload.user_id || payload.id,
        username: payload.username || payload.sub,
        role: payload.role || 'DRIVER',
        branchId: payload.branch_id ?? null,
        email: payload.email,
      };
    } catch (error) {
      console.error('Failed to parse JWT token:', error);
      throw new Error('Invalid token');
    }
  },
};
