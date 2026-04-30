/**
 * Offline Storage Service
 * Handles storing GPS data when offline and syncing when online
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_GPS_QUEUE_KEY = '@ronda_offline_gps_queue';
const MAX_OFFLINE_ENTRIES = 1000; // Limit storage usage

export interface OfflineGpsEntry {
  id: string;
  sessionId: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  altitude?: number;
  timestamp: string;
  createdAt: string;
}

export class OfflineStorageService {
  /**
   * Store GPS data when offline
   */
  async storeGpsData(entry: Omit<OfflineGpsEntry, 'id' | 'createdAt'>): Promise<void> {
    try {
      const queue = await this.getGpsQueue();
      
      // Check if we're at capacity
      if (queue.length >= MAX_OFFLINE_ENTRIES) {
        // Remove oldest entries to make space
        queue.splice(0, queue.length - MAX_OFFLINE_ENTRIES + 100);
      }
      
      const newEntry: OfflineGpsEntry = {
        ...entry,
        id: `gps_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
      };
      
      queue.push(newEntry);
      await AsyncStorage.setItem(OFFLINE_GPS_QUEUE_KEY, JSON.stringify(queue));
      
      console.log('GPS data stored offline:', newEntry.id);
    } catch (error) {
      console.error('Failed to store GPS data offline:', error);
    }
  }

  /**
   * Get all stored GPS data
   */
  async getGpsQueue(): Promise<OfflineGpsEntry[]> {
    try {
      const queueData = await AsyncStorage.getItem(OFFLINE_GPS_QUEUE_KEY);
      return queueData ? JSON.parse(queueData) : [];
    } catch (error) {
      console.error('Failed to get GPS queue:', error);
      return [];
    }
  }

  /**
   * Get GPS data for specific session
   */
  async getSessionGpsData(sessionId: number): Promise<OfflineGpsEntry[]> {
    try {
      const queue = await this.getGpsQueue();
      return queue.filter(entry => entry.sessionId === sessionId);
    } catch (error) {
      console.error('Failed to get session GPS data:', error);
      return [];
    }
  }

  /**
   * Remove specific entries from queue (after successful upload)
   */
  async removeUploadedEntries(entryIds: string[]): Promise<void> {
    try {
      const queue = await this.getGpsQueue();
      const updatedQueue = queue.filter(entry => !entryIds.includes(entry.id));
      await AsyncStorage.setItem(OFFLINE_GPS_QUEUE_KEY, JSON.stringify(updatedQueue));
      
      console.log(`Removed ${entryIds.length} uploaded GPS entries from offline storage`);
    } catch (error) {
      console.error('Failed to remove uploaded entries:', error);
    }
  }

  /**
   * Clear all offline GPS data
   */
  async clearGpsQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(OFFLINE_GPS_QUEUE_KEY);
      console.log('Offline GPS queue cleared');
    } catch (error) {
      console.error('Failed to clear GPS queue:', error);
    }
  }

  /**
   * Get offline storage statistics
   */
  async getStorageStats(): Promise<{
    totalEntries: number;
    oldestEntry?: string;
    newestEntry?: string;
    totalSize: number;
  }> {
    try {
      const queue = await this.getGpsQueue();
      const totalEntries = queue.length;
      
      if (totalEntries === 0) {
        return {
          totalEntries: 0,
          totalSize: 0,
        };
      }

      const timestamps = queue.map(entry => entry.timestamp).sort();
      const oldestEntry = timestamps[0];
      const newestEntry = timestamps[timestamps.length - 1];
      
      // Estimate storage size (rough calculation)
      const totalSize = JSON.stringify(queue).length;

      return {
        totalEntries,
        oldestEntry,
        newestEntry,
        totalSize,
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return {
        totalEntries: 0,
        totalSize: 0,
      };
    }
  }

  /**
   * Get GPS path for a session (ordered by timestamp)
   */
  async getSessionPath(sessionId: number): Promise<{
    coordinates: { latitude: number; longitude: number; timestamp: string }[];
    totalDistance: number;
    duration: number;
  }> {
    try {
      const sessionData = await this.getSessionGpsData(sessionId);
      
      if (sessionData.length === 0) {
        return {
          coordinates: [],
          totalDistance: 0,
          duration: 0,
        };
      }

      // Sort by timestamp
      const sortedData = sessionData.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const coordinates = sortedData.map(entry => ({
        latitude: entry.latitude,
        longitude: entry.longitude,
        timestamp: entry.timestamp,
      }));

      // Calculate total distance (simplified)
      let totalDistance = 0;
      for (let i = 1; i < coordinates.length; i++) {
        const prev = coordinates[i - 1];
        const curr = coordinates[i];
        const distance = this.calculateDistance(
          prev.latitude, prev.longitude,
          curr.latitude, curr.longitude
        );
        totalDistance += distance;
      }

      // Calculate duration
      const startTime = new Date(sortedData[0].timestamp).getTime();
      const endTime = new Date(sortedData[sortedData.length - 1].timestamp).getTime();
      const duration = endTime - startTime;

      return {
        coordinates,
        totalDistance,
        duration,
      };
    } catch (error) {
      console.error('Failed to get session path:', error);
      return {
        coordinates: [],
        totalDistance: 0,
        duration: 0,
      };
    }
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }
}

export const offlineStorageService = new OfflineStorageService();
