import { config } from '../config/env';

export interface SnapToRoadResponse {
  snapped_points: Array<{
    original_index: number;
    location: [number, number]; // [lon, lat]
    bearing: number;
  }>;
  confidence: number;
}

export interface GPSPoint {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  timestamp: string;
}

/**
 * Snap GPS coordinates to the nearest road using OpenRouteService
 * Only applies when vehicle speed indicates road travel
 */
export const snapToRoad = async (points: GPSPoint[]): Promise<GPSPoint[]> => {
  if (!points || points.length === 0) {
    return points;
  }

  // Filter points that should be snapped (vehicle speed > 5 km/h)
  const roadPoints = points.filter(point => 
    point.speed && point.speed > 5 // 5 km/h threshold for vehicle movement
  );

  if (roadPoints.length === 0) {
    return points; // No road travel detected, return original points
  }

  try {
    // Prepare coordinates for OpenRouteService API
    const coordinates = roadPoints.map(point => [point.longitude, point.latitude]);

    console.log('🛣️ Snap-to-road: Processing', coordinates.length, 'points');

    const response = await fetch('https://api.openrouteservice.org/v2/snap', {
      method: 'POST',
      headers: {
        'Authorization': config.openRouteServiceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates: coordinates,
        format: 'geojson',
        radius: 20, // 20 meter search radius
        provider: 'osm', // OpenStreetMap data
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouteService API error: ${response.status}`);
    }

    const data: SnapToRoadResponse = await response.json();
    
    if (!data.snapped_points || data.snapped_points.length === 0) {
      console.warn('🛣️ Snap-to-road: No snapped points returned');
      return points;
    }

    console.log(`🛣️ Snap-to-road: Snapped ${data.snapped_points.length} points with confidence ${(data.confidence * 100).toFixed(1)}%`);

    // Create new array with snapped points replacing original road points
    const result: GPSPoint[] = [...points];
    let snappedIndex = 0;

    for (let i = 0; i < result.length; i++) {
      const point = result[i];
      
      // Only replace points that were sent for snapping (road travel)
      if (point.speed && point.speed > 5 && snappedIndex < data.snapped_points.length) {
        const snappedPoint = data.snapped_points[snappedIndex];
        
        // Replace with snapped coordinates (note: API returns [lon, lat])
        result[i] = {
          ...point,
          latitude: snappedPoint.location[1],
          longitude: snappedPoint.location[0],
        };
        
        snappedIndex++;
      }
    }

    return result;

  } catch (error) {
    console.error('🛣️ Snap-to-road error:', error);
    return points; // Return original points on error
  }
};

/**
 * Check if a GPS point should be snapped to road
 */
export const shouldSnapToRoad = (point: GPSPoint): boolean => {
  return point.speed !== undefined && point.speed > 5;
};

/**
 * Calculate distance between two GPS points in meters
 */
export const calculateDistance = (point1: GPSPoint, point2: GPSPoint): number => {
  const R = 6371000; // Earth's radius in meters
  const lat1Rad = (point1.latitude * Math.PI) / 180;
  const lat2Rad = (point2.latitude * Math.PI) / 180;
  const deltaLatRad = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const deltaLonRad = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};
