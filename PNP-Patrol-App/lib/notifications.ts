/**
 * R.O.N.D.A. Driver App — Push Notification Service
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ronda } from './api';
import Constants from 'expo-constants';

// Conditionally import expo-notifications
let Notifications: any;
if (Constants.appOwnership !== 'expo') {
  try {
    Notifications = require('expo-notifications');
  } catch (error) {
    console.log('⚠️ expo-notifications not available');
  }
}

const PUSH_TOKEN_KEY = '@ronda_push_token';

// Configure notification handler (only if not in Expo Go)
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Notifications) {
    console.log('⚠️ Notifications not available in Expo Go');
    return false;
  }
  
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

export async function getPushToken(): Promise<string | null> {
  if (!Notifications) {
    console.log('⚠️ Push notifications not available in Expo Go');
    return null;
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        console.log('Notification permission not granted');
        return null;
      }
    }

    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

export async function savePushToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    console.log('Push token saved locally');
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch (error) {
    console.error('Error getting stored push token:', error);
    return null;
  }
}

export async function registerPushToken(userId?: number): Promise<void> {
  // Check if running in Expo Go - push notifications not supported
  if (Constants.appOwnership === 'expo') {
    console.log('⚠️ Push notifications not supported in Expo Go - skipping registration');
    return;
  }

  try {
    const token = await getPushToken();
    if (!token) {
      console.log('❌ No push token available');
      return;
    }

    console.log('🔑 Got push token:', token.substring(0, 20) + '...');

    // Save locally
    await savePushToken(token);

    // Send to backend if user is logged in
    if (userId) {
      try {
        console.log('📤 Sending token to backend for user:', userId);
        await ronda.notifications.registerToken(token);
        console.log('✅ Push token registered with backend');
      } catch (error) {
        console.error('❌ Error registering push token with backend:', error);
      }
    }
  } catch (error) {
    console.error('❌ Error in registerPushToken:', error);
  }
}

export function setupNotificationListener(): () => void {
  // Check if running in Expo Go - push notifications not supported
  if (!Notifications) {
    console.log('⚠️ Push notifications not supported in Expo Go - skipping listener setup');
    return () => {}; // Return empty cleanup function
  }

  // Handle notification received when app is in foreground
  const subscription = Notifications.addNotificationReceivedListener((notification: any) => {
    console.log('Notification received:', notification);
    
    // Handle ping notifications
    if (notification.request.content.data?.type === 'ping') {
      console.log('📢 Ping notification received:', notification.request.content.data);
      // You could trigger a modal or update UI here
    }
  });

  // Handle notification response when user taps notification
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
    console.log('Notification response:', response);
    
    // Handle ping notification tap
    if (response.notification.request.content.data?.type === 'ping') {
      console.log('📢 Ping notification tapped');
      // Navigate to ping response screen or show modal
    }
  });

  // Return cleanup function
  return () => {
    subscription.remove();
    responseSubscription.remove();
  };
}

export async function clearPushToken(): Promise<void> {
  try {
    const token = await getStoredPushToken();
    if (token) {
      try {
        await ronda.notifications.unregisterToken(token);
        console.log('Push token unregistered from backend');
      } catch (error) {
        console.error('Error unregistering push token:', error);
      }
    }
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    console.log('Push token cleared locally');
  } catch (error) {
    console.error('Error clearing push token:', error);
  }
}

// Function to send test notification (for development)
export async function sendTestNotification(): Promise<void> {
  if (!Notifications) {
    console.log('⚠️ Push notifications not available in Expo Go');
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test Notification',
        body: 'This is a test notification from RONDA Driver App',
        data: { type: 'test' },
      },
      trigger: null,
    });
    console.log('Test notification sent');
  } catch (error) {
    console.error('Error sending test notification:', error);
  }
}
