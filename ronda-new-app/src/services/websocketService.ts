/**
 * WebSocket service for mobile app GPS updates
 * Sends real-time GPS data to backend via WebSocket
 */

import { config } from '../config/env';

export interface GPSData {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
  speed?: number;
  altitude?: number;
  heading?: number;
}

export interface WebSocketStatus {
  connected: boolean;
  connecting: boolean;
  error?: string;
}

class MobileWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private sessionId: number | null = null;
  private token: string | null = null;
  private heartbeatInterval: any = null;
  private statusCallback: ((status: WebSocketStatus) => void) | null = null;

  /**
   * Initialize WebSocket connection for GPS updates
   */
  async connect(sessionId: number, token: string, onStatusChange?: (status: WebSocketStatus) => void): Promise<boolean> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return true;
    }

    this.sessionId = sessionId;
    this.token = token;
    this.statusCallback = onStatusChange || null;
    this.isConnecting = true;

    // Notify status change
    this.notifyStatus({ connected: false, connecting: true });

    try {
      // Get API URL from config and convert to WebSocket URL
      // Remove /api prefix for WebSocket endpoints
      const baseUrl = config.apiUrl.replace('/api', '');
      const wsUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
      const url = `${wsUrl}/ws/gps-update/?session_id=${sessionId}&token=${token}`;

      console.log('Connecting to GPS WebSocket:', url);

      this.ws = new WebSocket(url);

      return new Promise((resolve, reject) => {
        if (!this.ws) {
          reject(new Error('Failed to create WebSocket'));
          return;
        }

        this.ws.onopen = () => {
          console.log('GPS WebSocket connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.notifyStatus({ connected: true, connecting: false });
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('WebSocket message parsing error:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('GPS WebSocket disconnected:', event.code, event.reason);
          this.isConnecting = false;
          this.ws = null;
          this.stopHeartbeat();
          this.notifyStatus({ connected: false, connecting: false });
          this.handleReconnect();
          resolve(false);
        };

        this.ws.onerror = (error) => {
          console.error('GPS WebSocket error:', error);
          this.isConnecting = false;
          this.notifyStatus({ connected: false, connecting: false, error: 'Connection error' });
          reject(error);
        };

        // Connection timeout
        setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            this.notifyStatus({ connected: false, connecting: false, error: 'Connection timeout' });
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.isConnecting = false;
      this.notifyStatus({ connected: false, connecting: false, error: 'Failed to connect' });
      return false;
    }
  }

  /**
   * Send GPS data via WebSocket
   */
  sendGPSData(gpsData: GPSData): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not connected, cannot send GPS data');
      return false;
    }

    try {
      const message = {
        type: 'gps_update',
        ...gpsData
      };

      this.ws.send(JSON.stringify(message));
      console.log('GPS data sent via WebSocket');
      return true;
    } catch (error) {
      console.error('Failed to send GPS data:', error);
      return false;
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: any) {
    const { type, message, timestamp } = data;

    switch (type) {
      case 'gps_received':
        console.log('GPS data received by server:', timestamp);
        break;
      case 'pong':
        // Heartbeat response
        break;
      case 'error':
        console.error('Server error:', message);
        this.notifyStatus({ connected: false, connecting: false, error: message });
        break;
      default:
        console.log('Unknown WebSocket message type:', type);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    
    // Send ping every 20 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle automatic reconnection
   */
  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.sessionId && this.token) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
      
      setTimeout(() => {
        this.connect(this.sessionId!, this.token!, this.statusCallback || undefined);
      }, delay);
    } else {
      console.log('Max reconnection attempts reached');
    }
  }

  /**
   * Notify status change
   */
  private notifyStatus(status: WebSocketStatus) {
    if (this.statusCallback) {
      try {
        this.statusCallback(status);
      } catch (error) {
        console.error('Error in status callback:', error);
      }
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    this.notifyStatus({ connected: false, connecting: false });
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getState(): string {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'closed';
      default: return 'unknown';
    }
  }
}

// Create singleton instance
export const mobileWebSocketService = new MobileWebSocketService();

// Export class for testing
export { MobileWebSocketService };
