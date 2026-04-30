/**
 * Location Service
 * Handles GPS tracking and location permissions (foreground and background)
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  altitude?: number;
  timestamp: string;
}

export class LocationService {
  private watchId: Location.LocationSubscription | null = null;
  private isTracking = false;
  private isBackgroundTracking = false;

  /**
   * Request location permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.error('Location permission denied');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  /**
   * Request background location permissions
   */
  async requestBackgroundPermissions(): Promise<boolean> {
    try {
      // First request foreground permissions
      const foregroundGranted = await this.requestPermissions();
      if (!foregroundGranted) return false;

      // Then request background permissions
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status !== 'granted') {
        console.error('Background location permission denied');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error requesting background location permissions:', error);
      return false;
    }
  }

  /**
   * Get current location once
   */
  async getCurrentLocation(): Promise<LocationData | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || undefined,
        speed: location.coords.speed || undefined,
        altitude: location.coords.altitude || undefined,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      return null;
    }
  }

  /**
   * Start watching location changes
   */
  async startWatching(
    callback: (location: LocationData) => void,
    options?: {
      distanceInterval?: number;
      timeInterval?: number;
    }
  ): Promise<boolean> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return false;

      if (this.isTracking) {
        console.warn('Location tracking already active');
        return true;
      }

      this.watchId = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: options?.distanceInterval || 5,
          timeInterval: options?.timeInterval || 5000,
        },
        (location) => {
          const locationData: LocationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy || undefined,
            speed: location.coords.speed || undefined,
            altitude: location.coords.altitude || undefined,
            timestamp: new Date().toISOString(),
          };
          callback(locationData);
        }
      );

      this.isTracking = true;
      console.log('Location tracking started');
      return true;
    } catch (error) {
      console.error('Error starting location watch:', error);
      return false;
    }
  }

  /**
   * Stop watching location changes
   */
  stopWatching(): void {
    if (this.watchId !== null) {
      this.watchId.remove();
      this.watchId = null;
      this.isTracking = false;
      console.log('Location tracking stopped');
    }
  }

  /**
   * Check if tracking is active
   */
  isActive(): boolean {
    return this.isTracking;
  }

  /**
   * Start background location tracking
   */
  async startBackgroundTracking(sessionId: number): Promise<boolean> {
    try {
      const hasPermission = await this.requestBackgroundPermissions();
      if (!hasPermission) {
        console.error('Background location permission not granted');
        return false;
      }

      // Define the background task
      TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
        if (error) {
          console.error('Background location task error:', error);
          return;
        }
        if (data) {
          const { locations } = data as { locations: Location.LocationObject[] };
          console.log('Background location update:', locations[0]);
          
          // Here you would send the location to your backend
          // This is where you'd integrate with your GPS API
          await this.sendBackgroundLocation(locations[0], sessionId);
        }
      });

      // Start background location updates
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10, // Update every 10 meters
        timeInterval: 30000, // Update every 30 seconds
        showsBackgroundLocationIndicator: true,
      });

      this.isBackgroundTracking = true;
      console.log('Background location tracking started for session:', sessionId);
      return true;
    } catch (error) {
      console.error('Error starting background location tracking:', error);
      return false;
    }
  }

  /**
   * Stop background location tracking
   */
  async stopBackgroundTracking(): Promise<void> {
    try {
      if (this.isBackgroundTracking) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        this.isBackgroundTracking = false;
        console.log('Background location tracking stopped');
      }
    } catch (error) {
      console.error('Error stopping background location tracking:', error);
    }
  }

  /**
   * Send background location to backend (with offline support)
   */
  private async sendBackgroundLocation(location: Location.LocationObject, sessionId: number): Promise<void> {
    try {
      // Import offline queue service to handle offline storage
      const { offlineGpsQueueService } = await import('./offlineGpsQueue');
      
      // Add GPS data to queue (will handle online/offline automatically)
      await offlineGpsQueueService.addGpsData({
        sessionId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: new Date().toISOString(),
        accuracy: location.coords.accuracy ? Math.round(location.coords.accuracy * 100) / 100 : undefined,
        speed: location.coords.speed ? Math.round(location.coords.speed * 100) / 100 : undefined,
        altitude: location.coords.altitude ? Math.round(location.coords.altitude * 10) / 10 : undefined,
      });
      
      console.log('Background GPS data processed (online/offline handled automatically)');
    } catch (error: any) {
      // Don't log 400 errors (session ended) as they're expected
      if (error.response?.status === 400) {
        console.log('Background GPS data not sent - session may have ended');
        // Stop background tracking if session ended
        this.stopBackgroundTracking();
      } else {
        console.error('Failed to process background GPS data:', error);
      }
    }
  }

  /**
   * Check if background tracking is active
   */
  isBackgroundActive(): boolean {
    return this.isBackgroundTracking;
  }

  /**
   * Get adaptive GPS interval based on speed
   */
  getAdaptiveInterval(speed?: number | null): number {
    if (!speed || speed === 0) return 30000; // Stationary: 30s
    if (speed < 2) return 15000; // Walking: 15s
    if (speed < 8) return 10000; // Slow vehicle: 10s
    return 5000; // Fast vehicle: 5s
  }
}

export const locationService = new LocationService();
