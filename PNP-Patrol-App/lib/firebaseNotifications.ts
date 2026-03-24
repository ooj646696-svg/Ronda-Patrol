/**
 * Firebase Cloud Messaging (FCM) Service for R.O.N.D.A.
 * Complete push notification implementation with Firebase
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ronda } from './api';
import Constants from 'expo-constants';

// Firebase imports
let Firebase: any;
let FirebaseMessaging: any;
let FirebaseAnalytics: any;

try {
  Firebase = require('firebase/app');
  FirebaseMessaging = require('@react-native-firebase/messaging');
  FirebaseAnalytics = require('@react-native-firebase/analytics');
  
  // Initialize Firebase
  Firebase.initializeApp();
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization failed:', error);
}

// Expo notifications import
let Notifications: any;
try {
  Notifications = require('expo-notifications');
} catch (error) {
  console.log('expo-notifications not available:', error);
}

const PUSH_TOKEN_KEY = '@ronda_push_token';

// Set up notification channel
if (Notifications && Constants.platform?.android) {
  Notifications.setNotificationChannelAsync('default', {
    name: 'RONDA Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    // Request Firebase permissions
    const authStatus = await FirebaseMessaging().requestPermission();
    const enabled = authStatus === 1 || authStatus === 2;
    console.log('Firebase messaging permissions:', enabled ? 'Granted' : 'Denied');
    
    // Also request Expo permissions
    if (Notifications) {
      const { status } = await Notifications.requestPermissionsAsync();
      return enabled && status === 'granted';
    }
    
    return enabled;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

/**
 * Get Firebase FCM token
 */
export async function getFCMToken(): Promise<string | null> {
  if (!FirebaseMessaging) {
    console.log('Firebase Messaging not available');
    return null;
  }

  try {
    const fcmToken = await FirebaseMessaging().getToken();
    console.log('FCM Token obtained:', fcmToken ? fcmToken.substring(0, 20) + '...' : 'No token');
    return fcmToken || null;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

/**
 * Get Expo push token (fallback)
 */
export async function getExpoToken(): Promise<string | null> {
  if (!Notifications) {
    console.log('Expo notifications not available');
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    console.log('Expo token obtained:', token ? token.data.substring(0, 20) + '...' : 'No token');
    return token ? token.data : null;
  } catch (error) {
    console.error('Error getting Expo token:', error);
    return null;
  }
}

/**
 * Save push token locally
 */
export async function savePushToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    console.log('Push token saved locally');
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}

/**
 * Get saved push token
 */
export async function getSavedPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch (error) {
    console.error('Error getting saved push token:', error);
    return null;
  }
}

/**
 * Register push token with backend
 */
export async function registerPushToken(userId?: number): Promise<void> {
  if (Constants.appOwnership === 'expo') {
    console.log('Push notifications not supported in Expo Go');
    return;
  }

  try {
    // Try FCM token first (preferred for production)
    let token = await getFCMToken();
    let tokenType = 'FCM';
    
    // Fallback to Expo token
    if (!token) {
      token = await getExpoToken();
      tokenType = 'Expo';
    }
    
    if (!token) {
      console.log('No push token available');
      return;
    }

    console.log(`${tokenType} push token obtained:`, token.substring(0, 20) + '...');
    
    // Save locally
    await savePushToken(token);

    // Send to backend
    if (userId && token) {
      try {
        console.log('Registering token with backend for user:', userId);
        await ronda.notifications.registerToken(token);
        console.log('Push token registered successfully');
      } catch (error) {
        console.error('Error registering push token:', error);
      }
    }
  } catch (error) {
    console.error('Error in registerPushToken:', error);
  }
}

/**
 * Set up Firebase message listeners
 */
export function setupFirebaseMessageListener(): () => void {
  if (!FirebaseMessaging) {
    console.log('Firebase Messaging not available');
    return () => {};
  }

  // Handle foreground messages
  const unsubscribeForeground = FirebaseMessaging().onMessage(async (remoteMessage: any) => {
    console.log('Firebase message received in foreground:', remoteMessage);
    
    // Show local notification for foreground messages
    if (Notifications) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: remoteMessage.notification?.title || 'RONDA Alert',
          body: remoteMessage.notification?.body || 'New message received',
          data: remoteMessage.data || {},
          sound: 'default',
        },
        trigger: null,
      });
    }
    
    // Handle ping notifications
    if (remoteMessage.data?.type === 'ping') {
      console.log('Ping notification received:', remoteMessage.data);
      
      // Emit global event for UI
      if (typeof (global as any).emitPingNotification === 'function') {
        (global as any).emitPingNotification(remoteMessage.data);
      }
    }
  });

  // Handle background/quit messages
  const unsubscribeBackground = FirebaseMessaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
    console.log('Firebase message received in background:', remoteMessage);
    
    // Handle ping notifications in background
    if (remoteMessage.data?.type === 'ping') {
      console.log('Background ping notification:', remoteMessage.data);
      
      // Emit global event for UI when app comes to foreground
      if (typeof (global as any).emitPingNotification === 'function') {
        (global as any).emitPingNotification(remoteMessage.data);
      }
    }
  });

  return () => {
    unsubscribeForeground();
    unsubscribeBackground();
  };
}

/**
 * Set up Expo notification listeners (fallback)
 */
export function setupExpoNotificationListener(): () => void {
  if (!Notifications) {
    console.log('Expo notifications not available');
    return () => {};
  }

  const subscription = Notifications.addNotificationReceivedListener((notification: any) => {
    console.log('Expo notification received:', notification);
    
    if (notification.request.content.data?.type === 'ping') {
      console.log('Ping notification received:', notification.request.content.data);
      
      if (typeof (global as any).emitPingNotification === 'function') {
        (global as any).emitPingNotification(notification.request.content.data);
      }
    }
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
    console.log('Notification response:', response);
    
    if (response.notification.request.content.data?.type === 'ping') {
      console.log('Ping notification tapped');
    }
  });

  return () => {
    subscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Initialize complete notification system
 */
export async function initializeNotifications(userId?: number): Promise<void> {
  console.log('Initializing Firebase + Expo notifications...');
  
  // Request permissions
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.log('Notification permissions denied');
    return;
  }
  
  // Set up listeners
  setupFirebaseMessageListener();
  setupExpoNotificationListener();
  
  // Register push token
  await registerPushToken(userId);
  
  console.log('Notifications initialized successfully');
}

/**
 * Send test notification
 */
export async function sendTestNotification(): Promise<void> {
  if (!Notifications) {
    console.log('Notifications not available');
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚔 RONDA Test',
        body: 'Firebase + Expo notifications working!',
        data: { 
          type: 'test', 
          timestamp: new Date().toISOString(),
          source: 'Firebase+Expo'
        },
        sound: 'default',
      },
      trigger: null,
      identifier: 'test-notification',
    });
    
    console.log('Test notification sent successfully');
  } catch (error) {
    console.error('Error sending test notification:', error);
  }
}

/**
 * Clear push token
 */
export async function clearPushToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    console.log('Push token cleared locally');
  } catch (error) {
    console.error('Error clearing push token:', error);
  }
}
