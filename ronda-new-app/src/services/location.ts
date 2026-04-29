/**
 * Location Service
 * Handles GPS tracking and location permissions
 */
import * as Location from 'expo-location';
import { Platform } from 'react-native';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  altitude?: number;
  timestamp: string;
}

export class LocationService {
  private watchId: number | null = null;
  private isTracking = false;

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
        accuracy: location.coords.accuracy,
        speed: location.coords.speed,
        altitude: location.coords.altitude,
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
            accuracy: location.coords.accuracy,
            speed: location.coords.speed,
            altitude: location.coords.altitude,
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
      Location.watchPositionAsync(this.watchId);
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
