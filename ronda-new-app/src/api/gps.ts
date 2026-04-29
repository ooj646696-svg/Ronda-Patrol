/**
 * GPS API
 * Handles GPS log endpoints
 */
import { apiClient } from './client';
import { GPSLog, GPSCreateRequest } from '../types';

export const gpsApi = {
  /**
   * Create a GPS log entry
   */
  async create(data: GPSCreateRequest): Promise<GPSLog> {
    const response = await apiClient.post<GPSLog>('/gps-logs/', data);
    return response.data;
  },

  /**
   * Get GPS logs for a session
   */
  async list(sessionId: number): Promise<GPSLog[]> {
    const response = await apiClient.get<GPSLog[]>(`/gps-logs/?session=${sessionId}`);
    return response.data;
  },
};
