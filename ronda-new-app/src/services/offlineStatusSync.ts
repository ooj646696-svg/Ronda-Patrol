/**
 * Offline Status Sync Service
 * Integrates network connectivity detection with backend offline status
 */
import { networkConnectivityService, NetworkState } from './networkConnectivity';
import { sessionsApi } from '../api/sessions';

export class OfflineStatusSyncService {
  private currentSessionId: number | null = null;
  private isMonitoring = false;
  private networkListener: ((state: NetworkState) => void) | null = null;
  private lastKnownStatus: boolean | null = null;

  /**
   * Start monitoring offline status for a session
   */
  async startMonitoring(sessionId: number): Promise<void> {
    this.currentSessionId = sessionId;
    this.isMonitoring = true;

    // Set up network state listener
    this.networkListener = async (state: NetworkState) => {
      await this.handleNetworkStateChange(state);
    };

    networkConnectivityService.addListener(this.networkListener);
    
    // Check initial state
    const currentState = networkConnectivityService.getCurrentState();
    await this.handleNetworkStateChange(currentState);

    console.log('Offline status sync started for session:', sessionId);
  }

  /**
   * Stop monitoring offline status
   */
  stopMonitoring(): void {
    if (this.networkListener && networkConnectivityService) {
      networkConnectivityService.removeListener(this.networkListener);
    }
    
    this.currentSessionId = null;
    this.isMonitoring = false;
    this.networkListener = null;
    this.lastKnownStatus = null;

    console.log('Offline status sync stopped');
  }

  /**
   * Handle network state changes and update backend
   */
  private async handleNetworkStateChange(state: NetworkState): Promise<void> {
    if (!this.isMonitoring || !this.currentSessionId) {
      return;
    }

    const isOffline = !state.isConnected;

    // Only update if status actually changed
    if (this.lastKnownStatus !== isOffline) {
      this.lastKnownStatus = isOffline;
      
      try {
        await sessionsApi.updateOfflineStatus(this.currentSessionId, isOffline);
        console.log(`Session ${this.currentSessionId} offline status updated to: ${isOffline ? 'offline' : 'online'}`);
      } catch (error: any) {
        console.error('Failed to update offline status:', error);
        
        // Don't reset lastKnownStatus on error to retry on next change
        if (error.response?.status === 401 || error.response?.status === 403) {
          // Auth error - stop monitoring
          console.log('Auth error, stopping offline status monitoring');
          this.stopMonitoring();
        } else if (error.response?.status === 404) {
          // Session not found - stop monitoring
          console.log('Session not found, stopping offline status monitoring');
          this.stopMonitoring();
        }
        // For other errors (network issues), we'll retry on next state change
      }
    }
  }

  /**
   * Get current monitoring status
   */
  isActive(): boolean {
    return this.isMonitoring && this.currentSessionId !== null;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): number | null {
    return this.currentSessionId;
  }
}

export const offlineStatusSyncService = new OfflineStatusSyncService();
