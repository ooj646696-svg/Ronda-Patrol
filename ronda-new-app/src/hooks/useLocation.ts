/**
 * useLocation Hook
 * Custom hook for location tracking
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { locationService, LocationData } from '../services/location';

export function useLocation() {
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackRef = useRef<((location: LocationData) => void) | null>(null);

  const requestPermissions = useCallback(async () => {
    return await locationService.requestPermissions();
  }, []);

  const getCurrentLocation = useCallback(async () => {
    setError(null);
    try {
      const location = await locationService.getCurrentLocation();
      setCurrentLocation(location);
      return location;
    } catch (err: any) {
      setError(err.message || 'Failed to get location');
      return null;
    }
  }, []);

  const startTracking = useCallback(async (
    callback?: (location: LocationData) => void,
    options?: { distanceInterval?: number; timeInterval?: number }
  ) => {
    setError(null);
    try {
      if (callback) {
        callbackRef.current = callback;
      }

      const success = await locationService.startWatching(
        (location) => {
          setCurrentLocation(location);
          if (callbackRef.current) {
            callbackRef.current(location);
          }
        },
        options
      );

      if (success) {
        setIsTracking(true);
      } else {
        setError('Failed to start location tracking');
      }

      return success;
    } catch (err: any) {
      setError(err.message || 'Failed to start tracking');
      return false;
    }
  }, []);

  const stopTracking = useCallback(() => {
    locationService.stopWatching();
    setIsTracking(false);
    callbackRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    currentLocation,
    isTracking,
    error,
    requestPermissions,
    getCurrentLocation,
    startTracking,
    stopTracking,
  };
}
