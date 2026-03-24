/**
 * GPS Validation Utilities for R.O.N.D.A. Mobile App
 * Validates GPS accuracy, speed, age, and detects outliers before sending to backend.
 */

import * as Location from 'expo-location';

// Validation Constants (matching backend values)
const MAX_ACCEPTABLE_ACCURACY = 50; // meters
const MAX_GPS_AGE_MINUTES = 5;
const MAX_REALISTIC_SPEED_MPS = 55.56; // 200 km/h
const MAX_SPEED_JUMP_MPS = 27.78; // 100 km/h speed jump threshold
const OUTLIER_DISTANCE_THRESHOLD = 500; // meters
const MAX_REASONABLE_ACCELERATION = 8.0; // m/s²

// Philippines bounds
const MIN_LAT = 4.0;
const MAX_LAT = 21.0;
const MIN_LON = 112.0;
const MAX_LON = 131.0;

/**
 * Interface for GPS validation result
 */
export interface GPSValidationResult {
  isValid: boolean;
  rejectedReason?: string;
  accuracyScore: number;
  warnings: string[];
}

/**
 * Interface for GPS point data
 */
export interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: Date;
  accuracy?: number | null;
  speed?: number | null;
  altitude?: number | null;
}

/**
 * Haversine distance calculation between two coordinates in meters
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Check if coordinates are within Philippines bounds
 */
function isWithinBounds(lat: number, lon: number): boolean {
  return lat >= MIN_LAT && lat <= MAX_LAT && lon >= MIN_LON && lon <= MAX_LON;
}

/**
 * Calculate accuracy score (0-1 scale)
 */
function calculateAccuracyScore(accuracy: number): number {
  if (accuracy <= 5) return 1.0;
  if (accuracy <= 10) return 0.9;
  if (accuracy <= 20) return 0.7;
  if (accuracy <= 50) return 0.4;
  return 0.0;
}

/**
 * Check GPS age is acceptable
 */
function checkGPSAge(timestamp: Date): { valid: boolean; ageMinutes: number } {
  const now = new Date();
  const ageMs = now.getTime() - timestamp.getTime();
  const ageMinutes = ageMs / (1000 * 60);
  
  return {
    valid: ageMinutes <= MAX_GPS_AGE_MINUTES,
    ageMinutes,
  };
}

/**
 * Main GPS validation function
 * Performs comprehensive validation on a GPS point
 */
export function validateGPSPoint(
  point: GPSPoint,
  previousPoint?: GPSPoint
): GPSValidationResult {
  const warnings: string[] = [];
  
  // Check 1: Geographic bounds
  if (!isWithinBounds(point.latitude, point.longitude)) {
    return {
      isValid: false,
      rejectedReason: `Coordinates out of bounds: (${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)})`,
      accuracyScore: 0,
      warnings,
    };
  }
  
  // Check 2: Accuracy threshold
  if (point.accuracy !== null && point.accuracy !== undefined) {
    if (point.accuracy > MAX_ACCEPTABLE_ACCURACY) {
      return {
        isValid: false,
        rejectedReason: `Poor accuracy: ${point.accuracy.toFixed(1)}m > ${MAX_ACCEPTABLE_ACCURACY}m threshold`,
        accuracyScore: calculateAccuracyScore(point.accuracy),
        warnings,
      };
    }
    
    // Warning for borderline accuracy
    if (point.accuracy > 30) {
      warnings.push(`Borderline accuracy: ${point.accuracy.toFixed(1)}m`);
    }
  }
  
  // Check 3: GPS age
  const ageCheck = checkGPSAge(point.timestamp);
  if (!ageCheck.valid) {
    return {
      isValid: false,
      rejectedReason: `Stale GPS data: ${ageCheck.ageMinutes.toFixed(1)} minutes old`,
      accuracyScore: 0.5,
      warnings,
    };
  }
  
  // Checks 4-6: Require previous point
  if (previousPoint) {
    const distance = haversineDistance(
      previousPoint.latitude,
      previousPoint.longitude,
      point.latitude,
      point.longitude
    );
    
    const timeDiffSeconds =
      (point.timestamp.getTime() - previousPoint.timestamp.getTime()) / 1000;
    
    // Check 4: Outlier detection (distance jump)
    if (distance > OUTLIER_DISTANCE_THRESHOLD) {
      return {
        isValid: false,
        rejectedReason: `Distance jump too large: ${distance.toFixed(0)}m`,
        accuracyScore: 0,
        warnings,
      };
    }
    
    // Check 5: Speed validation
    if (timeDiffSeconds > 0) {
      const calculatedSpeed = distance / timeDiffSeconds; // m/s
      
      if (calculatedSpeed > MAX_REALISTIC_SPEED_MPS) {
        return {
          isValid: false,
          rejectedReason: `Unrealistic speed: ${calculatedSpeed.toFixed(1)} m/s (${(
            calculatedSpeed * 3.6
          ).toFixed(0)} km/h)`,
          accuracyScore: 0,
          warnings,
        };
      }
      
      // Check speed jumps if we have previous speed
      if (
        previousPoint.speed !== null &&
        previousPoint.speed !== undefined &&
        point.speed !== null &&
        point.speed !== undefined
      ) {
        const speedDiff = Math.abs(point.speed - previousPoint.speed);
        
        if (speedDiff > MAX_SPEED_JUMP_MPS) {
          warnings.push(`Large speed jump: ${speedDiff.toFixed(1)} m/s`);
        }
      }
      
      // Check 6: Acceleration validation
      if (
        previousPoint.speed !== null &&
        previousPoint.speed !== undefined &&
        point.speed !== null &&
        point.speed !== undefined
      ) {
        const acceleration = (point.speed - previousPoint.speed) / timeDiffSeconds;
        
        if (Math.abs(acceleration) > MAX_REASONABLE_ACCELERATION) {
          return {
            isValid: false,
            rejectedReason: `Unrealistic acceleration: ${acceleration.toFixed(1)} m/s²`,
            accuracyScore: 0.2,
            warnings,
          };
        }
      }
    }
    
    // Warning for large but not extreme jumps
    if (distance > 100) {
      warnings.push(`Large position change: ${distance.toFixed(0)}m`);
    }
  }
  
  // Check device-provided speed if available
  if (point.speed !== null && point.speed !== undefined) {
    if (point.speed > MAX_REALISTIC_SPEED_MPS) {
      return {
        isValid: false,
        rejectedReason: `Device reports unrealistic speed: ${point.speed.toFixed(1)} m/s`,
        accuracyScore: 0,
        warnings,
      };
    }
  }
  
  // Calculate overall accuracy score
  let accuracyScore = 0.5; // Base score
  
  if (point.accuracy !== null && point.accuracy !== undefined) {
    accuracyScore = calculateAccuracyScore(point.accuracy);
  }
  
  // Boost score for having speed data
  if (point.speed !== null && point.speed !== undefined) {
    accuracyScore = Math.min(1.0, accuracyScore + 0.1);
  }
  
  return {
    isValid: true,
    accuracyScore,
    warnings,
  };
}

/**
 * Convert Expo Location object to GPSPoint
 */
export function locationToGPSPoint(location: Location.LocationObject): GPSPoint {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: new Date(location.timestamp),
    accuracy: location.coords.accuracy,
    speed: location.coords.speed,
    altitude: location.coords.altitude,
  };
}

/**
 * Pre-validation check for Expo Location object
 * Quick check before more detailed validation
 */
export function quickValidateLocation(
  location: Location.LocationObject
): { valid: boolean; reason?: string } {
  // Check if location object is valid
  if (!location || !location.coords) {
    return { valid: false, reason: 'Invalid location object' };
  }
  
  const { latitude, longitude, accuracy } = location.coords;
  
  // Check for null/undefined coordinates
  if (latitude === null || latitude === undefined || 
      longitude === null || longitude === undefined) {
    return { valid: false, reason: 'Missing coordinates' };
  }
  
  // Check for zero coordinates (common GPS error)
  if (latitude === 0 && longitude === 0) {
    return { valid: false, reason: 'Zero coordinates (invalid GPS)' };
  }
  
  // Quick accuracy check
  if (accuracy !== null && accuracy !== undefined && accuracy > 100) {
    return { valid: false, reason: `Very poor accuracy: ${accuracy.toFixed(1)}m` };
  }
  
  return { valid: true };
}

/**
 * GPS Validation Manager
 * Maintains history of recent points for context-aware validation
 */
export class GPSValidationManager {
  private recentPoints: GPSPoint[] = [];
  private maxHistory: number = 5;
  
  /**
   * Add a point to history
   */
  addPoint(point: GPSPoint): void {
    this.recentPoints.push(point);
    
    // Keep only recent points
    if (this.recentPoints.length > this.maxHistory) {
      this.recentPoints.shift();
    }
  }
  
  /**
   * Get the most recent valid point
   */
  getLastValidPoint(): GPSPoint | undefined {
    return this.recentPoints.length > 0 
      ? this.recentPoints[this.recentPoints.length - 1] 
      : undefined;
  }
  
  /**
   * Clear history
   */
  clear(): void {
    this.recentPoints = [];
  }
  
  /**
   * Validate a new point with context from history
   */
  validate(point: GPSPoint): GPSValidationResult {
    const previousPoint = this.getLastValidPoint();
    const result = validateGPSPoint(point, previousPoint);
    
    if (result.isValid) {
      this.addPoint(point);
    }
    
    return result;
  }
  
  /**
   * Get validation statistics
   */
  getStats(): {
    historySize: number;
    lastPointTime?: string;
    lastPointCoords?: { lat: number; lon: number };
  } {
    const lastPoint = this.getLastValidPoint();
    
    return {
      historySize: this.recentPoints.length,
      lastPointTime: lastPoint?.timestamp.toISOString(),
      lastPointCoords: lastPoint 
        ? { lat: lastPoint.latitude, lon: lastPoint.longitude }
        : undefined,
    };
  }
}

// Global validation manager instance
export const gpsValidationManager = new GPSValidationManager();

/**
 * Format validation result for display/logging
 */
export function formatValidationResult(
  result: GPSValidationResult
): string {
  if (result.isValid) {
    let msg = `✅ Valid GPS (score: ${(result.accuracyScore * 100).toFixed(0)}%)`;
    if (result.warnings.length > 0) {
      msg += ` [Warnings: ${result.warnings.join(', ')}]`;
    }
    return msg;
  } else {
    return `❌ Invalid GPS: ${result.rejectedReason}`;
  }
}

/**
 * Get validation summary for batch processing
 */
export function getValidationSummary(
  results: GPSValidationResult[]
): {
  total: number;
  valid: number;
  invalid: number;
  averageScore: number;
  commonRejections: string[];
} {
  const valid = results.filter((r) => r.isValid).length;
  const invalid = results.length - valid;
  
  const scores = results
    .filter((r) => r.isValid)
    .map((r) => r.accuracyScore);
  const averageScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  
  // Count rejection reasons
  const rejectionCounts: Record<string, number> = {};
  results
    .filter((r) => !r.isValid && r.rejectedReason)
    .forEach((r) => {
      const reason = r.rejectedReason || 'Unknown';
      rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
    });
  
  const commonRejections = Object.entries(rejectionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${reason} (${count}x)`);
  
  return {
    total: results.length,
    valid,
    invalid,
    averageScore,
    commonRejections,
  };
}
