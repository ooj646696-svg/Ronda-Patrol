/**
 * Offline GPS Queue Service
 * Manages offline GPS data storage and automatic sync when online
 */
import { offlineStorageService, OfflineGpsEntry } from './offlineStorage';
import { networkConnectivityService } from './networkConnectivity';
import { gpsApi } from '../api/gps';

export interface SyncResult {
  success: boolean;
  uploadedCount: number;
  failedCount: number;
  errors: string[];
}

export class OfflineGpsQueueService {
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private networkListener: ((state: any) => void) | null = null;

  /**
   * Start the offline queue service
   */
  async start(): Promise<void> {
    try {
      // Start network monitoring
      await networkConnectivityService.startMonitoring();

      // Set up network state listener
      this.networkListener = (state) => {
        if (state.isConnected) {
          // When we come online, try to sync immediately
          this.syncOfflineData();
        }
      };

      networkConnectivityService.addListener(this.networkListener);

      // Set up periodic sync (every 2 minutes when online)
      this.syncInterval = setInterval(() => {
        const networkState = networkConnectivityService.getCurrentState();
        if (networkState.isConnected && !this.isSyncing) {
          this.syncOfflineData();
        }
      }, 120000); // 2 minutes

      console.log('Offline GPS queue service started');
    } catch (error) {
      console.error('Failed to start offline GPS queue service:', error);
    }
  }

  /**
   * Stop the offline queue service
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.networkListener) {
      networkConnectivityService.removeListener(this.networkListener);
      this.networkListener = null;
    }

    networkConnectivityService.stopMonitoring();
    console.log('Offline GPS queue service stopped');
  }

  /**
   * Add GPS data to queue (when offline)
   */
  async addGpsData(entry: Omit<OfflineGpsEntry, 'id' | 'createdAt'>): Promise<void> {
    try {
      const isOnline = await networkConnectivityService.isConnected();
      
      if (isOnline) {
        // Wait a moment to ensure connection is stable
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Double-check connection stability
        const isStillOnline = await networkConnectivityService.isConnected();
        
        if (isStillOnline) {
          // Try to send immediately if online
          try {
            await gpsApi.create({
              session: entry.sessionId,
              latitude: entry.latitude,
              longitude: entry.longitude,
              timestamp: entry.timestamp,
              accuracy: entry.accuracy,
              speed: entry.speed,
              altitude: entry.altitude,
              heading: entry.heading,
            });
            console.log('GPS data sent immediately (online)');
          } catch (error) {
            // If immediate send fails, store for offline
            console.log('Immediate send failed, storing offline:', error);
            await offlineStorageService.storeGpsData(entry);
          }
        } else {
          // Connection became unstable, store offline
          await offlineStorageService.storeGpsData(entry);
          console.log('Connection unstable, storing offline');
        }
      } else {
        // Store offline when no connection
        await offlineStorageService.storeGpsData(entry);
        console.log('GPS data stored offline (no connection)');
      }
    } catch (error) {
      console.error('Failed to add GPS data to queue:', error);
    }
  }

  /**
   * Sync all offline GPS data with server
   */
  async syncOfflineData(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        uploadedCount: 0,
        failedCount: 0,
        errors: ['Sync already in progress'],
      };
    }

    this.isSyncing = true;
    const result: SyncResult = {
      success: true,
      uploadedCount: 0,
      failedCount: 0,
      errors: [],
    };

    try {
      const queue = await offlineStorageService.getGpsQueue();
      
      if (queue.length === 0) {
        console.log('No offline GPS data to sync');
        return result;
      }

      console.log(`Starting sync of ${queue.length} offline GPS entries`);

      // Process entries in batches to avoid overwhelming the server
      const batchSize = 10;
      const uploadedIds: string[] = [];

      for (let i = 0; i < queue.length; i += batchSize) {
        const batch = queue.slice(i, i + batchSize);
        
        for (const entry of batch) {
          try {
            await gpsApi.create({
              session: entry.sessionId,
              latitude: entry.latitude,
              longitude: entry.longitude,
              timestamp: entry.timestamp,
              accuracy: entry.accuracy,
              speed: entry.speed,
              altitude: entry.altitude,
              heading: entry.heading,
            });
            
            uploadedIds.push(entry.id);
            result.uploadedCount++;
            
            // Add small delay between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (error: any) {
            result.failedCount++;
            const errorMsg = `Failed to upload entry ${entry.id}: ${error.message}`;
            result.errors.push(errorMsg);
            console.error(errorMsg);
          }
        }

        // Add delay between batches
        if (i + batchSize < queue.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Remove successfully uploaded entries from storage
      if (uploadedIds.length > 0) {
        await offlineStorageService.removeUploadedEntries(uploadedIds);
      }

      result.success = result.failedCount === 0;
      console.log(`Sync completed: ${result.uploadedCount} uploaded, ${result.failedCount} failed`);

    } catch (error) {
      result.success = false;
      result.errors.push(`Sync failed: ${error}`);
      console.error('Offline GPS sync failed:', error);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    totalEntries: number;
    oldestEntry?: string;
    newestEntry?: string;
    totalSize: number;
    isOnline: boolean;
    isSyncing: boolean;
  }> {
    const storageStats = await offlineStorageService.getStorageStats();
    const networkState = networkConnectivityService.getCurrentState();

    return {
      ...storageStats,
      isOnline: networkState.isConnected,
      isSyncing: this.isSyncing,
    };
  }

  /**
   * Get GPS path for a specific session (including offline data)
   */
  async getSessionPath(sessionId: number): Promise<{
    coordinates: { latitude: number; longitude: number; timestamp: string }[];
    totalDistance: number;
    duration: number;
    hasOfflineData: boolean;
  }> {
    const pathData = await offlineStorageService.getSessionPath(sessionId);
    
    return {
      ...pathData,
      hasOfflineData: pathData.coordinates.length > 0,
    };
  }

  /**
   * Force sync offline data
   */
  async forceSync(): Promise<SyncResult> {
    return this.syncOfflineData();
  }

  /**
   * Clear all offline data
   */
  async clearOfflineData(): Promise<void> {
    await offlineStorageService.clearGpsQueue();
    console.log('All offline GPS data cleared');
  }
}

export const offlineGpsQueueService = new OfflineGpsQueueService();
