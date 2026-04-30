/**
 * Network Connectivity Service
 * Handles network state detection and connectivity monitoring
 */
import { useState, useEffect } from 'react';

export interface NetworkState {
  isConnected: boolean;
  type: string;
}

export class NetworkConnectivityService {
  private listeners: Array<(state: NetworkState) => void> = [];
  private currentState: NetworkState = {
    isConnected: true,
    type: 'unknown',
  };
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start monitoring network connectivity
   */
  async startMonitoring(): Promise<void> {
    try {
      // Check initial state
      await this.checkConnectivity();
      
      // Set up periodic checks (every 5 seconds)
      this.checkInterval = setInterval(() => {
        this.checkConnectivity();
      }, 5000);

      console.log('Network connectivity monitoring started');
    } catch (error) {
      console.error('Failed to start network monitoring:', error);
    }
  }

  /**
   * Stop monitoring network connectivity
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.listeners = [];
    console.log('Network connectivity monitoring stopped');
  }

  /**
   * Add listener for network state changes
   */
  addListener(listener: (state: NetworkState) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove listener for network state changes
   */
  removeListener(listener: (state: NetworkState) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Get current network state
   */
  getCurrentState(): NetworkState {
    return { ...this.currentState };
  }

  /**
   * Check if currently connected to internet
   */
  async isConnected(): Promise<boolean> {
    try {
      // Simple connectivity check using fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check connectivity and update state
   */
  private async checkConnectivity(): Promise<void> {
    try {
      const isConnected = await this.isConnected();
      const newState: NetworkState = {
        isConnected,
        type: isConnected ? 'wifi' : 'none',
      };

      // Only notify if state changed
      if (newState.isConnected !== this.currentState.isConnected) {
        this.currentState = newState;
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Error checking connectivity:', error);
      const newState: NetworkState = {
        isConnected: false,
        type: 'none',
      };
      
      if (newState.isConnected !== this.currentState.isConnected) {
        this.currentState = newState;
        this.notifyListeners();
      }
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentState);
      } catch (error) {
        console.error('Error in network listener:', error);
      }
    });
  }
}

export const networkConnectivityService = new NetworkConnectivityService();

/**
 * Hook for network connectivity
 */
export function useNetworkConnectivity() {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    type: 'unknown',
  });

  useEffect(() => {
    // Add listener for network changes
    const handleNetworkChange = (state: NetworkState) => {
      setNetworkState(state);
    };

    networkConnectivityService.addListener(handleNetworkChange);
    
    // Start monitoring
    networkConnectivityService.startMonitoring();

    // Cleanup
    return () => {
      networkConnectivityService.removeListener(handleNetworkChange);
    };
  }, []);

  return {
    ...networkState,
    isOnline: networkState.isConnected,
    isOffline: !networkState.isConnected,
  };
}
