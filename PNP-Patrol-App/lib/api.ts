/**
 * R.O.N.D.A. Driver App — API client with JWT from AsyncStorage.
 */
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = { access: '@ronda_access', refresh: '@ronda_refresh' };
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.access);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = await AsyncStorage.getItem(STORAGE_KEYS.refresh);
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh });
          await AsyncStorage.setItem(STORAGE_KEYS.access, data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          await AsyncStorage.multiRemove([STORAGE_KEYS.access, STORAGE_KEYS.refresh]);
        }
      }
    }
    return Promise.reject(err);
  }
);

export async function setTokens(access: string, refresh: string) {
  await AsyncStorage.setItem(STORAGE_KEYS.access, access);
  await AsyncStorage.setItem(STORAGE_KEYS.refresh, refresh);
}

export async function clearTokens() {
  await AsyncStorage.multiRemove([STORAGE_KEYS.access, STORAGE_KEYS.refresh]);
}

export const ronda = {
  auth: {
    login: (username: string, password: string) =>
      api.post<{ access: string; refresh: string }>('/auth/token/', { username, password }).then((r) => r.data),
  },
  vehicles: {
    list: () => api.get('/vehicles/').then((r) => r.data),
  },
  sessions: {
    list: () => api.get('/sessions/').then((r) => r.data),
    start: (vehicleId?: number) =>
      api.post('/sessions/start/', vehicleId != null ? { vehicle_id: vehicleId } : {}).then((r) => r.data),
    stop: (id: number) => api.post(`/sessions/${id}/stop/`).then((r) => r.data),
  },
  gpsLogs: {
    create: (sessionId: number, latitude: number, longitude: number, timestamp: string) =>
      api.post('/gps-logs/', { session: sessionId, latitude, longitude, timestamp }).then((r) => r.data),
  },
  ping: {
    active: () => api.get('/ping/active/').then((r) => r.data),
    respond: (pingId: number, response: string, latitude?: number, longitude?: number) =>
      api.post('/ping/respond/', { ping_id: pingId, response, latitude, longitude }).then((r) => r.data),
  },
  notifications: {
    registerToken: (token: string) =>
      api.post('/notifications/register/', { push_token: token }).then((r) => r.data),
    unregisterToken: (token: string) =>
      api.post('/notifications/unregister/', { push_token: token }).then((r) => r.data),
  },
};
