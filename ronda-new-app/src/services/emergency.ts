/**
 * Emergency Service
 * Handles emergency alerts and notifications
 */
import { emergencyApi } from '../api/emergency';
import { EmergencyAlert, PingRequest, PingResponse } from '../types';

export class EmergencyService {
  private activeEmergency: EmergencyAlert | null = null;

  /**
   * Trigger emergency alert
   */
  async triggerEmergency(
    sessionId: number,
    description?: string,
    location?: { latitude: number; longitude: number }
  ): Promise<EmergencyAlert | null> {
    try {
      // Get current location if not provided
      let finalLocation = location;
      if (!finalLocation) {
        // Import location service dynamically to avoid circular dependency
        const { locationService } = await import('./location');
        const currentLocation = await locationService.getCurrentLocation();
        if (currentLocation) {
          finalLocation = {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          };
        }
      }

      if (!finalLocation) {
        console.error('Cannot trigger emergency without location');
        return null;
      }

      const alert = await emergencyApi.createEmergencyAlert({
        session: sessionId,
        type: 'EMERGENCY',
        description,
        latitude: finalLocation.latitude,
        longitude: finalLocation.longitude,
      });

      this.activeEmergency = alert;
      console.log('Emergency alert triggered:', alert);
      return alert;
    } catch (error) {
      console.error('Error triggering emergency:', error);
      return null;
    }
  }

  /**
   * Request assistance (less severe than emergency)
   */
  async requestAssistance(
    sessionId: number,
    description?: string,
    location?: { latitude: number; longitude: number }
  ): Promise<EmergencyAlert | null> {
    try {
      let finalLocation = location;
      if (!finalLocation) {
        const { locationService } = await import('./location');
        const currentLocation = await locationService.getCurrentLocation();
        if (currentLocation) {
          finalLocation = {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          };
        }
      }

      if (!finalLocation) {
        console.error('Cannot request assistance without location');
        return null;
      }

      const alert = await emergencyApi.createEmergencyAlert({
        session: sessionId,
        type: 'ASSISTANCE',
        description,
        latitude: finalLocation.latitude,
        longitude: finalLocation.longitude,
      });

      console.log('Assistance request sent:', alert);
      return alert;
    } catch (error) {
      console.error('Error requesting assistance:', error);
      return null;
    }
  }

  /**
   * Get active pings
   */
  async getActivePings(): Promise<PingRequest[]> {
    try {
      return await emergencyApi.getActivePings();
    } catch (error) {
      console.error('Error getting active pings:', error);
      return [];
    }
  }

  /**
   * Respond to a ping
   */
  async respondToPing(
    pingId: number,
    response: PingResponse,
    location?: { latitude: number; longitude: number }
  ): Promise<boolean> {
    try {
      let finalLocation = location;
      if (!finalLocation) {
        const { locationService } = await import('./location');
        const currentLocation = await locationService.getCurrentLocation();
        if (currentLocation) {
          finalLocation = {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          };
        }
      }

      await emergencyApi.respondToPing({
        ping_id: pingId,
        response,
        latitude: finalLocation?.latitude,
        longitude: finalLocation?.longitude,
      });

      console.log('Ping response sent:', { pingId, response });
      return true;
    } catch (error) {
      console.error('Error responding to ping:', error);
      return false;
    }
  }

  /**
   * Get nearby personnel for emergency response
   */
  async getNearbyPersonnel(
    latitude: number,
    longitude: number
  ): Promise<any[]> {
    try {
      return await emergencyApi.getNearbyPersonnel(latitude, longitude);
    } catch (error) {
      console.error('Error getting nearby personnel:', error);
      return [];
    }
  }

  /**
   * Check if there's an active emergency
   */
  hasActiveEmergency(): boolean {
    return this.activeEmergency !== null;
  }

  /**
   * Get active emergency
   */
  getActiveEmergency(): EmergencyAlert | null {
    return this.activeEmergency;
  }

  /**
   * Clear active emergency
   */
  clearActiveEmergency(): void {
    this.activeEmergency = null;
  }
}

export const emergencyService = new EmergencyService();
