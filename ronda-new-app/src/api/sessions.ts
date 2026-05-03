/**
 * Sessions API
 * Handles driver session endpoints
 */
import { apiClient } from './client';
import { DriverSession, SessionStartRequest, PaginatedResponse } from '../types';

export const sessionsApi = {
  /**
   * List sessions for current user
   */
  async list(): Promise<PaginatedResponse<DriverSession>> {
    const response = await apiClient.get<PaginatedResponse<DriverSession>>('/sessions/');
    return response.data;
  },

  /**
   * Start a new session
   */
  async start(data: SessionStartRequest): Promise<DriverSession> {
    const response = await apiClient.post<DriverSession>('/sessions/start/', data);
    return response.data;
  },

  /**
   * Stop an active session
   */
  async stop(sessionId: number): Promise<DriverSession> {
    const response = await apiClient.post<DriverSession>(`/sessions/${sessionId}/stop/`);
    return response.data;
  },

  /**
   * Get live locations of active sessions
   */
  async getLiveLocations(): Promise<any[]> {
    const response = await apiClient.get('/sessions/live/');
    return response.data;
  },

  /**
   * Update offline status for a session
   */
  async updateOfflineStatus(sessionId: number, isOffline: boolean): Promise<{ is_app_offline: boolean; message: string }> {
    const response = await apiClient.patch(`/sessions/${sessionId}/offline-status/`, {
      is_offline: isOffline,
    });
    return response.data;
  },
};
