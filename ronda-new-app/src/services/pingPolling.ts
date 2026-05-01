/**
 * Ping Polling Service
 * Periodically checks for pending pings from the backend
 * Alternative to push notifications for web-to-app communication
 */
import { apiClient } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PendingPing {
  id: number;
  message?: string;
  created_at: string;
}

export class PingPollingService {
  private static instance: PingPollingService;
  private isPolling = false;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private pollingIntervalMs = 30000; // Check every 30 seconds
  private lastCheckedTimestamp: string | null = null;
  private onPingReceivedCallback: ((ping: PendingPing) => void) | null = null;

  static getInstance(): PingPollingService {
    if (!PingPollingService.instance) {
      PingPollingService.instance = new PingPollingService();
    }
    return PingPollingService.instance;
  }

  /**
   * Set callback for when a new ping is received
   */
  onPingReceived(callback: (ping: PendingPing) => void): void {
    this.onPingReceivedCallback = callback;
  }

  /**
   * Check for pending pings from backend
   */
  private async checkForPings(): Promise<void> {
    try {
      const access_token = await AsyncStorage.getItem('@ronda_access');
      if (!access_token) {
        console.log('User not authenticated - skipping ping check');
        return;
      }

      const params: any = {};
      if (this.lastCheckedTimestamp) {
        params.since = this.lastCheckedTimestamp;
      }

      const response = await apiClient.get('/emergency/pending-pings/', { params });
      
      if (response.data && response.data.length > 0) {
        console.log('Pending pings found:', response.data);
        
        // Process each ping
        for (const ping of response.data) {
          if (this.onPingReceivedCallback) {
            this.onPingReceivedCallback(ping);
          }
        }
      }

      // Update last checked timestamp
      this.lastCheckedTimestamp = new Date().toISOString();
    } catch (error: any) {
      // Silently handle network/offline errors - no need to spam console
      if (error.response?.status === 404) {
        // 404 is expected if endpoint doesn't exist yet
        return;
      }
      
      // Check if it's a network error (offline)
      if (error.message?.includes('Network Error') || 
          error.message?.includes('network') ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ERR_NETWORK') {
        console.log('Ping polling skipped - device offline');
        return;
      }
      
      // Only log unexpected errors
      console.error('Error checking for pings:', error.message || error);
    }
  }

  /**
   * Start polling for pings
   */
  startPolling(): void {
    if (this.isPolling) {
      console.log('Ping polling already active');
      return;
    }

    console.log('Starting ping polling service...');
    this.isPolling = true;

    // Check immediately
    this.checkForPings();

    // Set up interval
    this.pollingInterval = setInterval(() => {
      this.checkForPings();
    }, this.pollingIntervalMs);
  }

  /**
   * Stop polling for pings
   */
  stopPolling(): void {
    if (!this.isPolling) {
      return;
    }

    console.log('Stopping ping polling service...');
    this.isPolling = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Check if polling is active
   */
  isActive(): boolean {
    return this.isPolling;
  }

  /**
   * Set custom polling interval (in milliseconds)
   */
  setPollingInterval(intervalMs: number): void {
    this.pollingIntervalMs = intervalMs;
    // Restart polling if active to apply new interval
    if (this.isPolling) {
      this.stopPolling();
      this.startPolling();
    }
  }
}

export const pingPollingService = PingPollingService.getInstance();
