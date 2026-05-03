/**
 * Environment Configuration
 * Handles API URL detection and environment setup
 */
import Constants from 'expo-constants';

export const getApiBaseUrl = (): string => {
  // Check environment variable first
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  
  if (envUrl) {
    // In development, Django's dev server typically runs HTTP-only.
    // If an https URL was provided (common mistake), downgrade for local/LAN dev.
    const isDevLike =
      process.env.EXPO_PUBLIC_ENV === 'development' ||
      process.env.EXPO_PUBLIC_ENV === 'preview' ||
      Constants.appOwnership === 'expo';

    if (isDevLike && envUrl.startsWith('https://') && envUrl.includes(':8000')) {
      const downgraded = `http://${envUrl.slice('https://'.length)}`;
      console.warn('⚠️ https detected for local dev API URL; downgrading to HTTP:', downgraded);
      return downgraded;
    }

    // If env var has localhost, warn for mobile devices
    if (envUrl.includes('localhost') && Constants.appOwnership === 'expo') {
      console.warn('⚠️ localhost detected in API URL, may not work on mobile device');
    }
    return envUrl;
  }
  
  // Fallback based on environment
  if (Constants.appOwnership === 'expo') {
    // Expo Go development
    return 'http://192.168.18.12:8000/api';
  }
  
  // Development build or production
  return 'https://ronda-patrol-monitoring-web-app.onrender.com/api';
};

export const getWsUrl = (): string => {
  const envWsUrl = process.env.EXPO_PUBLIC_WS_URL;
  
  if (envWsUrl) {
    const isDevLike =
      process.env.EXPO_PUBLIC_ENV === 'development' ||
      process.env.EXPO_PUBLIC_ENV === 'preview' ||
      Constants.appOwnership === 'expo';

    if (isDevLike && envWsUrl.startsWith('wss://') && envWsUrl.includes(':8000')) {
      const downgraded = `ws://${envWsUrl.slice('wss://'.length)}`;
      console.warn('⚠️ wss detected for local dev WS URL; downgrading to WS:', downgraded);
      return downgraded;
    }

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

export const getOpenRouteServiceKey = (): string => {
  return process.env.EXPO_PUBLIC_OPENROUTESERVICE_API_KEY || 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6Ijg2NTcwMDAxODc5NzRiMjY4MmMwZDczNzA3NTRmYWRlIiwiaCI6Im11cm11cjY0In0=';
};

export const config = {
  apiUrl: getApiBaseUrl(),
  wsUrl: getWsUrl(),
  isDev: isDevelopment(),
  openRouteServiceKey: getOpenRouteServiceKey(),
};

console.log('🔗 [Config] API URL:', config.apiUrl);
console.log('🔗 [Config] WS URL:', config.wsUrl);
console.log('🔗 [Config] Environment:', config.isDev ? 'Development' : 'Production');
