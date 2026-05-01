/**
 * GPS API
 * Handles GPS log endpoints with snap-to-road functionality
 */
import { apiClient } from './client';
import { GPSLog, GPSCreateRequest } from '../types';
import { snapToRoad, GPSPoint } from '../services/snapToRoad';

export const gpsApi = {
  /**
   * Create a GPS log entry with optional snap-to-road
   */
  async create(data: GPSCreateRequest): Promise<GPSLog> {
    const response = await apiClient.post<GPSLog>('/gps-logs/', data);
    return response.data;
  },

  /**
   * Create GPS log entry with snap-to-road processing
   */
  async createWithSnapping(data: GPSCreateRequest): Promise<GPSLog> {
    // Convert to GPSPoint format for snap-to-road
    const gpsPoint: GPSPoint = {
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy,
      speed: data.speed,
      timestamp: data.timestamp,
    };

    // Apply snap-to-road if conditions are met
    if (gpsPoint.speed && gpsPoint.speed > 5) {
      try {
        const snappedPoints = await snapToRoad([gpsPoint]);
        if (snappedPoints.length > 0) {
          const snappedPoint = snappedPoints[0];
          
          // Update data with snapped coordinates
          const snappedData = {
            ...data,
            latitude: snappedPoint.latitude,
            longitude: snappedPoint.longitude,
            snapped_to_road: true,
          };

          const response = await apiClient.post<GPSLog>('/gps-logs/', snappedData);
          return response.data;
        }
      } catch (error) {
        console.warn('🛣️ Snap-to-road failed, using original coordinates:', error);
      }
    }

    // Fallback to original coordinates
    const response = await apiClient.post<GPSLog>('/gps-logs/', {
      ...data,
      snapped_to_road: false,
    });
    return response.data;
  },

  /**
   * Get GPS logs for a session
   */
  async list(sessionId: number): Promise<GPSLog[]> {
    const response = await apiClient.get<GPSLog[]>(`/gps-logs/?session=${sessionId}`);
    return response.data;
  },

  /**
   * Batch process GPS points with snap-to-road
   */
  async batchCreateWithSnapping(points: GPSCreateRequest[]): Promise<GPSLog[]> {
    if (points.length === 0) return [];

    try {
      // Convert to GPSPoint format
      const gpsPoints: GPSPoint[] = points.map(point => ({
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
        speed: point.speed,
        timestamp: point.timestamp,
      }));

      // Apply snap-to-road
      const snappedPoints = await snapToRoad(gpsPoints);

      // Create GPS logs with snapped coordinates
      const promises = snappedPoints.map((point, index) => 
        this.create({
          ...points[index],
          latitude: point.latitude,
          longitude: point.longitude,
          snapped_to_road: true,
        })
      );

      return await Promise.all(promises);
    } catch (error) {
      console.warn('🛣️ Batch snap-to-road failed, using original coordinates:', error);
      
      // Fallback to original coordinates
      const promises = points.map(point => 
        this.create({
          ...point,
          snapped_to_road: false,
        })
      );

      return await Promise.all(promises);
    }
  },
};
