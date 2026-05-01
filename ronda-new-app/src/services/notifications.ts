/**
 * Push Notification Service
 * Handles push token registration and notification handling
 */
// @ts-ignore - expo-notifications will be installed when building
import * as Notifications from 'expo-notifications';
import { apiClient } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore - Types will be available after installation
import type { NotificationResponse as ExpoNotificationResponse, Notification } from 'expo-notifications';

export class NotificationService {
  private static instance: NotificationService;
  private isInitialized = false;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Get and register push token
   */
  async registerPushToken(): Promise<string | null> {
    try {
      // Request permissions first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.log('Notification permission denied');
        return null;
      }

      // Get push token
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: '5f331ea0-73c7-4549-8396-389c6a381df8', // From app.json
      });

      console.log('Push token obtained:', token.data);

      // Register token with backend
      try {
        // Check if user is authenticated first
        const access_token = await AsyncStorage.getItem('@ronda_access');
        
        if (!access_token) {
          console.log('User not authenticated - skipping backend token registration');
        } else {
          const response = await apiClient.post('/notifications/register/', {
            push_token: token.data,
          });
          console.log('Push token registered with backend:', response.data);
        }
      } catch (error: any) {
        console.error('Backend registration error details:', error.response?.data);
        console.error('Status:', error.response?.status);
        // Don't fail initialization, just log the error
        console.log('Continuing without backend token registration...');
      }

      this.isInitialized = true;
      return token.data;
    } catch (error) {
      console.error('Error registering push token:', error);
      return null;
    }
  }

  /**
   * Unregister push token
   */
  async unregisterPushToken(): Promise<void> {
    try {
      const token = await Notifications.getExpoPushTokenAsync();
      await apiClient.post('/notifications/unregister/', {
        push_token: token.data,
      });
      console.log('Push token unregistered');
    } catch (error) {
      console.error('Error unregistering push token:', error);
    }
  }

  /**
   * Set up notification listeners
   */
  setupNotificationListeners(): void {
    // Handle foreground notifications
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    // Listen for notification responses
    Notifications.addNotificationResponseReceivedListener((response: ExpoNotificationResponse) => {
      console.log('Notification response received:', response);
      // Handle notification tap here
      // For example, navigate to ping response screen
      this.handleNotificationResponse(response);
    });

    // Listen for notifications received in foreground
    Notifications.addNotificationReceivedListener((notification: Notification) => {
      console.log('Notification received in foreground:', notification);
    });
  }

  /**
   * Handle notification response (when user taps notification)
   */
  private handleNotificationResponse(response: ExpoNotificationResponse): void {
    const data = response.notification.request.content.data;
    
    // Handle ping notifications
    if (data.type === 'ping' || data.ping_id) {
      console.log('Ping notification tapped:', data);
      // Navigate to ping response screen using expo-router
      // Import router dynamically to avoid circular dependency
      import('expo-router').then(({ router }) => {
        router.push(`/ping-response/${data.ping_id}` as any);
      });
    }
  }

  /**
   * Initialize notification service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Set up listeners first
      this.setupNotificationListeners();
      
      // Register push token
      await this.registerPushToken();
      
      this.isInitialized = true;
      console.log('Notification service initialized');
    } catch (error) {
      console.error('Error initializing notification service:', error);
    }
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

export const notificationService = NotificationService.getInstance();
