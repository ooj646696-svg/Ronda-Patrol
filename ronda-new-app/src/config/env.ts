/**
 * Environment Configuration
 * Handles API URL detection and environment setup
 */
import Constants from 'expo-constants';

export const getApiBaseUrl = (): string => {
  // Check environment variable first
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  
  if (envUrl) {
    // If env var has localhost, warn for mobile devices
    if (envUrl.includes('localhost') && Constants.appOwnership === 'expo') {
      console.warn('⚠️ localhost detected in API URL, may not work on mobile device');
    }
    return envUrl;
  }
  
  // Fallback based on environment
  if (Constants.appOwnership === 'expo') {
    // Expo Go development
    return 'http://192.168.1.18:8000/api';
  }
  
  // Development build or production
  return 'https://ronda-patrol-monitoring-web-app.onrender.com/api';
};

export const getWsUrl = (): string => {
  const envWsUrl = process.env.EXPO_PUBLIC_WS_URL;
  
  if (envWsUrl) {
    return envWsUrl;
  }
  
  const apiUrl = getApiBaseUrl();
  return apiUrl.replace('http', 'ws').replace('/api', '/ws');
};

export const isDevelopment = (): boolean => {
  return (
    process.env.EXPO_PUBLIC_ENV === 'development' ||
    process.env.EXPO_PUBLIC_ENV === 'preview' ||
    Constants.appOwnership === 'expo'
  );
};

export const config = {
  apiUrl: getApiBaseUrl(),
  wsUrl: getWsUrl(),
  isDev: isDevelopment(),
};

console.log('🔗 [Config] API URL:', config.apiUrl);
console.log('🔗 [Config] WS URL:', config.wsUrl);
console.log('🔗 [Config] Environment:', config.isDev ? 'Development' : 'Production');
