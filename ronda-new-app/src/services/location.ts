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
  private lastLocation: LocationData | null = null;

  
  /**
   * Filter location updates to reduce drift
   */
  private shouldUpdateLocation(newLocation: LocationData): boolean {
    // If accuracy is poor (>50m), don't update
    if (newLocation.accuracy && newLocation.accuracy > 50) {
      console.log('Skipping update - poor accuracy:', newLocation.accuracy);
      return false;
    }

    // If this is the first location, accept it
    if (!this.lastLocation) {
      return true;
    }

    // Calculate distance from last location
    const distance = this.calculateDistance(
      this.lastLocation.latitude,
      this.lastLocation.longitude,
      newLocation.latitude,
      newLocation.longitude
    );

    // If movement is less than 3 meters, consider it drift
    if (distance < 3) {
      console.log('Skipping update - minimal movement:', distance);
      return false;
    }

    return true;
  }

  /**
   * Request location permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      console.log('Requesting location permissions...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('Location permission status:', status);
      if (status !== 'granted') {
        console.error('Location permission denied');
        return false;
      }
      console.log('Location permission granted');
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

          // Apply drift filtering
          if (this.shouldUpdateLocation(locationData)) {
            this.lastLocation = locationData;
            callback(locationData);
          }
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
          const location = locations[0];
          
          const locationData: LocationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy || undefined,
            speed: location.coords.speed || undefined,
            altitude: location.coords.altitude || undefined,
            timestamp: new Date().toISOString(),
          };

          // Apply drift filtering for background tracking too
          if (this.shouldUpdateLocation(locationData)) {
            this.lastLocation = locationData;
            console.log('Background location update (filtered):', locationData);
            await this.sendBackgroundLocation(location, sessionId);
          } else {
            console.log('Background location update skipped (drift filter)');
          }
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
        console.log('Background location tracking stopped');
      }
    } catch (error: any) {
      // TaskNotFoundException is expected if app restarted or task wasn't started
      // Just reset the state silently
      if (error?.message?.includes('TaskNotFoundException') || error?.message?.includes('not found')) {
        console.log('Background task already stopped or not found');
      } else {
        console.error('Error stopping background location tracking:', error);
      }
    } finally {
      // Always reset the tracking flag
      this.isBackgroundTracking = false;
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
   * Get adaptive GPS interval based on movement state
   *
   * THESIS DEFENSE STRATEGY:
   * - Moving patrol: 8-10 seconds (near real-time, battery-efficient)
   * - Stationary: 30-60 seconds (conserves resources)
   * - Emergency mode: 3-5 seconds (high-priority tracking)
   *
   * Stationary defined as: < 5-10 meters movement in 1 minute
   */
  getAdaptiveInterval(speed?: number | null, isEmergency: boolean = false): number {
    // Emergency/High-Priority Mode: Override all intervals
    if (isEmergency) {
      return 3000; // 3-5 seconds during emergency
    }

    // Stationary: 30-60 seconds to conserve battery/data
    if (!speed || speed === 0) {
      return 60000; // 60 seconds when stationary
    }

    // Walking/Slow movement: 30 seconds
    if (speed < 2) {
      return 30000; // 30 seconds
    }

    // Normal patrol movement: 8-10 seconds (smooth real-time)
    if (speed < 10) {
      return 10000; // 10 seconds
    }

    // Fast movement: 8 seconds (more responsive)
    return 8000; // 8 seconds
  }

  /**
   * Detect if patrol unit is stationary
   * Definition: Movement less than 10 meters within 1 minute
   */
  isStationary(currentLocation: LocationData, previousLocation?: LocationData | null): boolean {
    if (!previousLocation) return false;

    const timeDiff = new Date(currentLocation.timestamp).getTime() - new Date(previousLocation.timestamp).getTime();
    if (timeDiff < 60000) return false; // Need at least 1 minute of data

    // Calculate distance using Haversine formula
    const distance = this.calculateDistance(
      previousLocation.latitude,
      previousLocation.longitude,
      currentLocation.latitude,
      currentLocation.longitude
    );

    // Stationary if moved less than 10 meters in 1 minute
    return distance < 10;
  }

  /**
   * Calculate distance between two coordinates in meters (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.degreesToRadians(lat2 - lat1);
    const dLon = this.degreesToRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degreesToRadians(lat1)) *
      Math.cos(this.degreesToRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

export const locationService = new LocationService();
