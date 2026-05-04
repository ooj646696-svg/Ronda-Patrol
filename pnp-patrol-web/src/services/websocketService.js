/**
 * WebSocket service for real-time GPS updates
 * Replaces HTTP polling for better performance
 */

class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.isConnecting = false;
    this.listeners = new Map();
    this.token = null;
    this.url = null;
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.manuallyClosed = false;
  }

  /**
   * Initialize WebSocket connection
   */
  connect(token, onConnect, onError, onClose) {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.token = token;
    this.isConnecting = true;
    this.manuallyClosed = false;

    // Build WebSocket URL
    const envApiUrl = process.env.REACT_APP_API_URL;
    if (envApiUrl) {
      try {
        const u = new URL(envApiUrl);
        const protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = u.host;
        this.url = `${protocol}//${host}/ws/live-gps/?token=${token}`;
      } catch (e) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        this.url = `${protocol}//${host}/ws/live-gps/?token=${token}`;
      }
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      this.url = `${protocol}//${host}/ws/live-gps/?token=${token}`;
    }

    console.log('Connecting to WebSocket:', this.url);

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        if (onConnect) onConnect();
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
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.isConnecting = false;
        this.ws = null;
        this.stopHeartbeat();
        if (onClose) onClose(event);
        if (!this.manuallyClosed) {
          this.handleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
        if (onError) onError(error);
      };

    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.isConnecting = false;
      if (onError) onError(error);
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(data) {
    const { type, data: messageData } = data;

    switch (type) {
      case 'pong':
        if (this.heartbeatTimeout) {
          clearTimeout(this.heartbeatTimeout);
          this.heartbeatTimeout = null;
        }
        break;
      case 'initial_data':
        this.emit('initial_data', messageData);
        break;
      case 'gps_update':
        this.emit('gps_update', messageData);
        break;
      case 'status_change':
        this.emit('status_change', messageData);
        break;
      case 'error':
        console.error('WebSocket error from server:', messageData);
        this.emit('error', messageData);
        break;
      default:
        console.log('Unknown WebSocket message type:', type);
    }
  }

  /**
   * Handle automatic reconnection
   */
  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
      
      setTimeout(() => {
        this.connect(
          this.token,
          () => this.emit('reconnected'),
          (error) => this.emit('reconnect_error', error),
          (event) => this.emit('reconnect_failed', event)
        );
      }, delay);
    } else {
      console.log('Max reconnection attempts reached');
      this.emit('reconnect_failed');
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to all listeners
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in WebSocket event listener:', error);
        }
      });
    }
  }

  /**
   * Start heartbeat to keep connection alive (Render compatibility)
   */
  startHeartbeat() {
    this.stopHeartbeat(); // Clear any existing heartbeat
    
    // Send ping every 20 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (this.heartbeatTimeout) {
          clearTimeout(this.heartbeatTimeout);
          this.heartbeatTimeout = null;
        }
        this.ws.send(JSON.stringify({ type: 'ping' }));
        
        // Set timeout to detect if pong is received
        this.heartbeatTimeout = setTimeout(() => {
          console.log('Heartbeat timeout - connection may be dead');
          this.ws.close();
        }, 10000); // 10 second timeout
      }
    }, 20000); // 20 second interval
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    this.stopHeartbeat();
    this.manuallyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnecting = false;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getState() {
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
export const websocketService = new WebSocketService();

// Export class for testing
export { WebSocketService };
