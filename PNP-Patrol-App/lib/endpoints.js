import AsyncStorage from '@react-native-async-storage/async-storage';

// Keep this aligned with lib/api.ts
const ACCESS_KEY = '@ronda_access';

export function getApiBaseUrl() {
  return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';
}

export function getWsBaseUrl() {
  const api = getApiBaseUrl();
  // http://host:8000/api  -> ws://host:8000
  const httpBase = api.replace(/\/api\/?$/, '');
  return httpBase.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
}

export async function getAccessToken() {
  return await AsyncStorage.getItem(ACCESS_KEY);
}

