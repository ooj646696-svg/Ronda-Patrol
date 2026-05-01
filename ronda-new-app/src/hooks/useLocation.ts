/**
 * useLocation Hook
 * Custom hook for location tracking
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { locationService, LocationData } from '../services/location';

export function useLocation() {
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isBackgroundTracking, setIsBackgroundTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackRef = useRef<((location: LocationData) => void) | null>(null);

  const requestPermissions = useCallback(async () => {
    return await locationService.requestPermissions();
  }, []);

  const getCurrentLocation = useCallback(async () => {
    setError(null);
    try {
      console.log('Getting current location...');
      const location = await locationService.getCurrentLocation();
      console.log('Location received:', location);
      setCurrentLocation(location);
      return location;
    } catch (err: any) {
      console.error('Error getting location:', err);
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

  const startBackgroundTracking = useCallback(async (sessionId: number) => {
    setError(null);
    try {
      const success = await locationService.startBackgroundTracking(sessionId);
      if (success) {
        setIsBackgroundTracking(true);
      } else {
        setError('Failed to start background location tracking');
      }
      return success;
    } catch (err: any) {
      setError(err.message || 'Failed to start background tracking');
      return false;
    }
  }, []);

  const stopBackgroundTracking = useCallback(async () => {
    try {
      await locationService.stopBackgroundTracking();
      setIsBackgroundTracking(false);
    } catch (err: any) {
      setError(err.message || 'Failed to stop background tracking');
    }
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
    isBackgroundTracking,
    error,
    requestPermissions,
    getCurrentLocation,
    startTracking,
    stopTracking,
    startBackgroundTracking,
    stopBackgroundTracking,
  };
}
