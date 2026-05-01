/**
 * Emergency/Ping API
 * Handles ping and emergency endpoints
 */
import { apiClient } from './client';
import { PingRequest, PingRespondRequest, EmergencyAlert } from '../types';

export const emergencyApi = {
  /**
   * Get active pings for current user
   */
  async getActivePings(): Promise<PingRequest[]> {
    const response = await apiClient.get<PingRequest[]>('/ping/active/');
    return response.data;
  },

  /**
   * Respond to a ping
   */
  async respondToPing(data: PingRespondRequest): Promise<any> {
    const response = await apiClient.post('/ping/respond/', data);
    return response.data;
  },

  /**
   * Create an emergency alert (uses incidents endpoint)
   */
  async createEmergencyAlert(data: {
    session: number;
    type: 'EMERGENCY' | 'ASSISTANCE';
    description?: string;
    latitude: number;
    longitude: number;
  }): Promise<EmergencyAlert> {
    const response = await apiClient.post<EmergencyAlert>('/incidents/', {
      session: data.session,
      description: `[${data.type}] ${data.description || (data.type === 'EMERGENCY' ? 'Emergency alert' : 'Assistance request')}`,
      latitude: data.latitude,
      longitude: data.longitude,
    });
    return response.data;
  },

  /**
   * Send ping to driver (Admin only)
   */
  async sendPing(driverId: number): Promise<any> {
    const response = await apiClient.post('/ping/send/', {
      driver_id: driverId,
    });
    return response.data;
  },

  /**
   * Get nearby personnel for emergency response
   */
  async getNearbyPersonnel(latitude: number, longitude: number): Promise<any[]> {
    const response = await apiClient.get('/sessions/nearby/', {
      params: { latitude, longitude },
    });
    return response.data;
  },
};
