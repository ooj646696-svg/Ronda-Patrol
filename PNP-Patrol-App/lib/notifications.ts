/**
 * R.O.N.D.A. Driver App — Push Notification Service
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ronda } from './api';
import Constants from 'expo-constants';

// Import expo-notifications directly
let Notifications: any;
try {
  Notifications = require('expo-notifications');
} catch (error) {
  console.log('expo-notifications not available:', error);
}

const PUSH_TOKEN_KEY = '@ronda_push_token';

// Set up notification channel (only if not in Expo Go)
if (Notifications && Constants.platform?.android) {
  try {
    Notifications.setNotificationChannelAsync('default', {
      name: 'RONDA Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
    console.log('Notification channel set up');
  } catch (error) {
    console.error('Could not set notification channel:', error);
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Notifications) {
    console.log('Notifications not available in Expo Go');
    return false;
  }
  
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === 'granted';
    console.log('Notification permissions:', granted ? 'Granted' : 'Denied');
    return granted;
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
    // Request permissions first
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('❌ Notification permission not granted');
      return null;
    }

    // Get Expo push token
    const token = await Notifications.getExpoPushTokenAsync();
    if (!token || !token.data) {
      console.log('❌ No Expo push token available');
      return null;
    }
    
    console.log('Got Expo push token:', token ? token.data.substring(0, 20) + '...' : 'No token');
    return token ? token.data : null;
  } catch (error) {
    console.error('Error getting Expo push token:', error);
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

    console.log('🔑 Got push token:', token ? token.substring(0, 20) + '...' : 'No token');
    
    // Save locally
    if (token) {
      await savePushToken(token);
    }

    // Send to backend if user is logged in
    if (userId && token) {
      try {
        console.log('Sending token to backend for user:', userId);
        await ronda.notifications.registerToken(token);
        console.log('Push token registered with backend');
      } catch (error) {
        console.error('Error registering push token with backend:', error);
      }
    }
  } catch (error) {
    console.error('Error in registerPushToken:', error);
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
      console.log('Ping notification received:', notification.request.content.data);
      
      // Emit custom event to trigger modal in main app
      if (typeof (global as any).emitPingNotification === 'function') {
        (global as any).emitPingNotification(notification.request.content.data);
      }
    }
  });

  // Handle notification response when user taps notification
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
    console.log('Notification response:', response);
    
    // Handle ping notification tap
    if (response.notification.request.content.data?.type === 'ping') {
      console.log('Ping notification tapped');
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
    // Ensure notification channel is set up (Android)
    if (Constants.platform?.android) {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'RONDA Alerts',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
        });
        console.log('✅ Notification channel set up');
      } catch (channelError) {
        console.error('⚠️ Failed to set notification channel:', channelError);
      }
    }

    // Schedule notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚔 RONDA Test',
        body: 'Push notifications are working!',
        data: { type: 'test', timestamp: new Date().toISOString() },
        sound: 'default',
      },
      trigger: null, // Show immediately
      identifier: 'test-notification',
    });
    
    console.log('Test notification sent successfully');
  } catch (error) {
    console.error('Error sending test notification:', error);
    
    // Try alternative method if schedule fails
    try {
      const notifications = await Notifications.getPresentedNotificationsAsync();
      console.log('📱 Notifications presented:', notifications);
      
      // Check if notification was presented
      const wasPresented = notifications.some(n => n.identifier === 'test-notification');
      if (!wasPresented) {
        await Notifications.presentNotificationAsync({
          title: '🚔 RONDA Test (Fallback)',
          body: 'Fallback notification method',
          data: { type: 'test', fallback: true },
          sound: 'default',
        });
        console.log('Fallback test notification sent');
      }
    } catch (fallbackError) {
      console.error('Fallback notification also failed:', fallbackError);
    }
  }
}
