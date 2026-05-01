/**
 * API Client - Axios instance with interceptors
 * Handles JWT token management, refresh, and error handling
 */
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../config/env';
import { ApiError } from '../types';

const STORAGE_KEYS = {
  access: '@ronda_access',
  refresh: '@ronda_refresh',
};

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: config.apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Token refresh state
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.access);
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(` [API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error: unknown) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors and token refresh
apiClient.interceptors.response.use(
  (response: any) => {
    console.log(` [API] ${response.config.method?.toUpperCase()} ${response.config.url} → ${response.status}`);
    return response;
  },
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    
    console.error(`❌ [API] ${original?.method?.toUpperCase()} ${original?.url} → ${error.response?.status || 'Network Error'}`);
    
    // Log detailed error for 400 errors
    if (error.response?.status === 400) {
      console.error('❌ [API] 400 detail:', JSON.stringify(error.response.data));
    }
    
    // Handle 401 - Token expired
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      console.log('🔄 [API] Token expired, attempting refresh...');

      const refresh = await AsyncStorage.getItem(STORAGE_KEYS.refresh);
      if (!refresh) {
        console.error('❌ [API] No refresh token found, clearing tokens');
        await AsyncStorage.multiRemove([STORAGE_KEYS.access, STORAGE_KEYS.refresh]);
        return Promise.reject(error);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = axios
          .post(`${config.apiUrl}/auth/token/refresh/`, { refresh })
          .then(async ({ data }: { data: { access: string } }) => {
            console.log(' [API] Token refreshed successfully');
            await AsyncStorage.setItem(STORAGE_KEYS.access, data.access);
            onRefreshed(data.access);
            return data.access as string;
          })
          .catch(async (e: unknown) => {
            console.error('❌ [API] Token refresh failed, clearing tokens');
            await AsyncStorage.multiRemove([STORAGE_KEYS.access, STORAGE_KEYS.refresh]);
            throw e;
          })
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });
      }

      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((token) => {
          try {
            if (original.headers) {
              original.headers.Authorization = `Bearer ${token}`;
            }
            resolve(apiClient(original));
          } catch (e) {
            reject(e);
          }
        });

        if (refreshPromise) {
          refreshPromise.catch(reject);
        }
      });
    }

    return Promise.reject(error);
  }
);

// Token management functions
export async function setTokens(access: string, refresh: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.access, access);
  await AsyncStorage.setItem(STORAGE_KEYS.refresh, refresh);
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([STORAGE_KEYS.access, STORAGE_KEYS.refresh]);
}

export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.access);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.refresh);
}
