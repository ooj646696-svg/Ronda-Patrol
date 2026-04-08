/**
 * R.O.N.D.A. Driver App — API client with JWT from AsyncStorage.
 */
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const STORAGE_KEYS = { access: '@ronda_access', refresh: '@ronda_refresh' };

// Dynamic API URL detection
const getApiBaseUrl = () => {
  // Check if we're in development mode
  if (Constants.appOwnership === 'expo') {
    // For Expo Go development, try to detect local network
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    
    // If env var has localhost, it won't work on mobile - replace with network IP
    if (envUrl && envUrl.includes('localhost')) {
      console.warn('⚠️ localhost detected in API URL, may not work on mobile device');
      return envUrl; // Keep as is for web/simulator
    }
    
    return envUrl || 'http://192.168.1.10:8000/api';
  }
  
  // For development builds or production
  return process.env.EXPO_PUBLIC_API_URL || 'https://ronda-patrol-monitoring-web-app.onrender.com/api';
};

const BASE_URL = getApiBaseUrl();

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Log the API URL for debugging
console.log('🔗 [API] Base URL:', BASE_URL);

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.access);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  console.log(`📤 [API] ${config.method?.toUpperCase()} ${config.url} 🔄`);
  return config;
});

api.interceptors.response.use(
  (res) => {
    console.log(`✅ [API] ${res.config.method?.toUpperCase()} ${res.config.url} → ${res.status}`);
    return res;
  },
  async (err) => {
    const original = err.config;
    console.error(`❌ [API] ${original?.method?.toUpperCase()} ${original?.url} → ${err.response?.status || 'Network Error'}`);
    
    // ADD THIS — logs the actual Django validation error detail
    if (err.response?.status === 400) {
      console.error('❌ [API] 400 detail:', JSON.stringify(err.response.data));
    }
    
    // Auto-fix session handling
    if (err.response?.status === 422 && err.response.data?.auto_fix_session) {
      console.log(`🔧 [API] Auto-fixing session from ${original.data?.session} to ${err.response.data.auto_fix_session}`);
      
      // Update the original request with the correct session
      if (original.data) {
        original.data.session = err.response.data.auto_fix_session;
        
        // Retry the request with the corrected session
        try {
          const response = await api(original);
          console.log(`✅ [API] Auto-fix successful | ${original?.method?.toUpperCase()} ${original?.url} → ${response.status}`);
          return response;
        } catch (retryError) {
          console.error('❌ [API] Auto-fix retry failed:', retryError);
        }
      }
    }
    
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      console.log('🔄 [API] Token expired, attempting refresh...');
      const refresh = await AsyncStorage.getItem(STORAGE_KEYS.refresh);
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh });
          console.log('✅ [API] Token refreshed successfully');
          await AsyncStorage.setItem(STORAGE_KEYS.access, data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          console.error('❌ [API] Token refresh failed, clearing tokens');
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
    // TODO: Add profile endpoint when backend implements it
    // profile: () => api.get('/auth/profile/').then((r) => r.data),
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
    create: (sessionId: number, latitude: number, longitude: number, timestamp: string, accuracy?: number | null, speed?: number | null, altitude?: number | null) => {
      const payload: any = {
        session: sessionId,
        latitude: parseFloat(latitude.toFixed(8)),
        longitude: parseFloat(longitude.toFixed(8)),
        timestamp,
      };

      // Round to reasonable precision - GPS hardware doesn't need more than this
      if (accuracy != null) payload.accuracy = parseFloat(accuracy.toFixed(2));
      if (speed != null)    payload.speed    = parseFloat(speed.toFixed(4));
      if (altitude != null) payload.altitude = parseFloat(altitude.toFixed(2));

      return api.post('/gps-logs/', payload).then((r) => r.data);
    }
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
