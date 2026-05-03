import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Modal,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { startOfflineSession } from '@/lib/offlineSession';
import { trySyncOfflineSession } from '@/lib/offlineSync';
import { useAuth } from '@/lib/auth-context';
import { useDatabase } from '@/lib/database-provider';
import { ronda, api } from '@/lib/api';
import { pushToQueue, flushQueue, getQueue } from '@/lib/gps-queue';
import { useRouter } from 'expo-router';
import NotificationsTest from '@/components/NotificationsTest';
import { 
  initializeBackgroundTracking, 
  cleanupBackgroundTracking, 
  startBackgroundSessionTracking 
} from '@/lib/backgroundTasks';
import { setupNotificationListener } from '@/lib/notifications';
import VehicleCamera from '@/components/VehicleCamera';
import { photoService } from '@/services/photoService';
import { 
  validateGPSPoint, 
  locationToGPSPoint, 
  quickValidateLocation,
  formatValidationResult,
  gpsValidationManager 
} from '@/lib/gpsValidation';

// Global event handler for push notifications
(global as any).emitPingNotification = (pingData: any) => {
  console.log('🌐 Global ping notification received:', pingData);
  // This will trigger the existing ping check logic
};

const GPS_INTERVAL_MS = 5000; // Base interval (will be adapted)
const MIN_DISTANCE_METERS = 5; // Minimum movement to trigger update

// Adaptive GPS interval based on movement
const getAdaptiveInterval = (speed?: number | null) => {
  if (!speed || speed === 0) return 30000;      // Stationary: 30s
  if (speed < 2) return 15000;                 // Walking: 15s
  if (speed < 8) return 10000;                 // Slow vehicle: 10s
  return 5000;                                 // Fast vehicle: 5s
};

type Session = {
  id: number;
  is_active: boolean;
  driver_username: string;
  vehicle_plate?: string;
  branch_name?: string;
  start_time: string;
  end_time: string | null;
};

type OfflineSessionLike = {
  id: number;
  is_active: boolean;
  driver_username: string;
  vehicle_plate?: string;
  branch_name?: string;
  start_time: string;
  end_time: string | null;
};

type Vehicle = {
  id: number;
  plate_number: string;
  name?: string;
  branch_name?: string;
};

type Ping = {
  id: number;
  sender: {
    id: number;
    username: string;
  };
  sent_at: string;
  status: 'SENT' | 'DELIVERED' | 'RESPONDED';
  response?: string;
};

type Incident = {
  id: number;
  session: number;
  description: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
  is_resolved: boolean;
};

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { isInitialized, isInitializing, error: dbError } = useDatabase();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGpsTime, setLastGpsTime] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'pre_shift' | 'post_shift'>('pre_shift');
  const [requiredShots, setRequiredShots] = useState<string[]>([]);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const adaptiveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [rejectedGpsCount, setRejectedGpsCount] = useState(0);
  const [lastValidationMessage, setLastValidationMessage] = useState<string | null>(null);
  const [activePing, setActivePing] = useState<Ping | null>(null);
  const [pingModalVisible, setPingModalVisible] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await ronda.sessions.list();
      const list = Array.isArray(data) ? data : data.results || [];
      const active = list.find((s: Session) => s.is_active);
      setSession(active || null);
      setError(null);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Failed to load session';
      console.error('❌ Failed to load sessions:', e);
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIncidents = useCallback(async () => {
    try {
      const data = await ronda.incidents.list();
      const list = Array.isArray(data) ? data : data.results || [];
      // Filter to show only unresolved incidents from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const activeIncidents = list.filter((inc: Incident) => 
        !inc.is_resolved && new Date(inc.created_at) >= today
      );
      setIncidents(activeIncidents);
    } catch (e: unknown) {
      console.error('❌ Failed to load incidents:', e);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const syncOfflineSession = async () => {
      try {
        const res = await trySyncOfflineSession();
        if (res.synced && res.serverSessionId) {
          console.log(' Offline session synced. Server session:', res.serverSessionId);
          await fetchSessions();
        }
      } catch (e) {
        // Stay quiet; sync will retry.
      }
    };

    timer = setInterval(syncOfflineSession, 15000);
    syncOfflineSession();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [fetchSessions]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    fetchIncidents();
    // Poll for incidents every 30 seconds
    const interval = setInterval(fetchIncidents, 30000);
    return () => clearInterval(interval);
  }, [fetchIncidents]);

  const fetchVehicles = useCallback(async () => {
    try {
      console.log('🚗 Fetching vehicles from backend...');
      console.log('🚗 User branchId:', user?.branchId);
      
      // Try to filter by branch if user has branchId
      const url = user?.branchId 
        ? `/vehicles/?branch_id=${user.branchId}`
        : '/vehicles/';
      
      console.log('🚗 Vehicles API URL:', url);
      const response = await api.get(url);
      console.log('🚗 Vehicles response:', response.data);
      const list = Array.isArray(response.data) ? response.data : response.data?.results || [];
      console.log('🚗 Processed vehicles list:', list);
      setVehicles(list);
      if (list.length === 1) setSelectedVehicleId((list[0] as Vehicle).id);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      setVehicles([]);
    }
  }, [user?.branchId]);

  useEffect(() => {
    if (!session?.is_active) fetchVehicles();
  }, [session?.is_active, fetchVehicles]);

  // Initialize background tracking when user is available
  useEffect(() => {
    if (user?.id) {
      initializeBackgroundTracking();
      console.log('🔄 Background tracking initialized for user:', user.id);
    }
    
    return () => {
      cleanupBackgroundTracking();
    };
  }, [user?.id]);

  const sendOrQueueGps = useCallback(
    async (sessionId: number, location: Location.LocationObject) => {
      // CRITICAL: Guard — never post if session not ready
      if (!sessionId) {
        console.warn('⚠️ [GPS] Skipping — session not initialized yet');
        return;
      }
      
      // Quick pre-validation
      const quickCheck = quickValidateLocation(location);
      if (!quickCheck.valid) {
        console.log('❌ GPS pre-validation failed:', quickCheck.reason);
        setRejectedGpsCount((prev: number) => prev + 1);
        setLastValidationMessage(`Rejected: ${quickCheck.reason}`);
        return;
      }

      // Convert to GPS point
      const gpsPoint = locationToGPSPoint(location);
      
      // Full validation with context
      const validationResult = gpsValidationManager.validate(gpsPoint);
      
      console.log('🔍 GPS Validation:', formatValidationResult(validationResult));
      setLastValidationMessage(formatValidationResult(validationResult));
      
      if (!validationResult.isValid) {
        console.log('❌ GPS rejected by validation:', validationResult.rejectedReason);
        setRejectedGpsCount((prev: number) => prev + 1);
        
        // Still queue if it's just a warning-level rejection (for data completeness)
        if (validationResult.accuracyScore > 0.3) {
          console.log('⚠️ GPS below threshold but storing anyway (score > 0.3)');
        } else {
          return; // Don't send severely invalid GPS
        }
      }

      const { latitude, longitude, accuracy, speed, altitude } = location.coords;
      const timestamp = new Date().toISOString();

      try {
        await ronda.gpsLogs.create(
          sessionId, 
          latitude, 
          longitude, 
          timestamp,
          accuracy,
          speed,
          altitude
        );
        setLastGpsTime(timestamp);
        console.log(' GPS data sent successfully:', { 
          sessionId, 
          lat: latitude.toFixed(6), 
          lon: longitude.toFixed(6), 
          accuracy: accuracy ? `${accuracy.toFixed(1)}m` : 'N/A',
          speed: speed ? `${(speed * 3.6).toFixed(1)}km/h` : 'N/A',
          timestamp 
        });
        
        // Notify backend we're back online if we were offline
        try {
          await ronda.sessions.updateOfflineStatus(sessionId, false);
          console.log('📱 Notified backend: Driver is ONLINE');
        } catch (offlineError) {
          // Don't fail if offline status update fails
          console.log('⚠️ Could not update offline status (non-critical):', offlineError);
        }
      } catch (error) {
        console.log('📦 GPS send failed, queuing data:', { 
          sessionId, 
          latitude, 
          longitude, 
          timestamp, 
          accuracy,
          speed,
          altitude,
          error 
        });
        await pushToQueue({ 
          sessionId, 
          latitude, 
          longitude, 
          timestamp,
          accuracy,
          speed,
          altitude,
          isValid: validationResult.isValid,
          rejectionReason: validationResult.rejectedReason,
          accuracyScore: validationResult.accuracyScore
        });
        const { getQueue } = await import('@/lib/gps-queue');
        const q = await getQueue();
        setQueuedCount(q.length);
        console.log('📋 Queue size after adding:', q.length);
        
        // Notify backend we're offline due to network failure
        try {
          await ronda.sessions.updateOfflineStatus(sessionId, true);
          console.log('📴 Notified backend: Driver is OFFLINE (network issue)');
        } catch (offlineError) {
          // Don't fail if offline status update fails - we're already offline anyway
          console.log('⚠️ Could not update offline status (non-critical):', offlineError);
        }
      }
    },
    []
  );

  const captureAndSendGps = useCallback(async () => {
    if (!session?.is_active) return;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      // Use the new sendOrQueueGps with full location object
      await sendOrQueueGps(session.id, loc);
    } catch (_) {
      // ignore location errors
    }
  }, [session, sendOrQueueGps]);

  const stopTracking = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
      console.log('🛑 GPS watchPosition stopped');
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('🛑 GPS interval tracking stopped');
    }
    if (adaptiveIntervalRef.current) {
      clearInterval(adaptiveIntervalRef.current);
      adaptiveIntervalRef.current = null;
      console.log('🛑 Adaptive GPS tracking stopped');
    }
    console.log('⏹️ All GPS tracking stopped');
  }, []);

  const startContinuousTracking = useCallback(async (activeSession: Session) => {
    if (!activeSession?.is_active) {
      console.log('⚠️ Cannot start tracking: No active session');
      return;
    }

    // Clear any existing tracking first
    stopTracking();

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.error('❌ Location permission denied');
        Alert.alert('Location Required', 'Please enable location access to track your patrol route.');
        return;
      }

      console.log('🚀 Starting adaptive GPS tracking for session:', activeSession.id);

      // Get initial position
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      await sendOrQueueGps(
        activeSession.id,
        initialLocation
      );

      // Start adaptive tracking
      const startAdaptiveTracking = (speed: number = 0) => {
        const adaptiveInterval = getAdaptiveInterval(speed);
        
        console.log('⚡ Adaptive GPS Interval:', {
          speed: speed,
          interval: adaptiveInterval,
          reason: speed === 0 ? 'Stationary' : speed < 2 ? 'Walking' : speed < 8 ? 'Slow vehicle' : 'Fast vehicle'
        });

        // Clear existing adaptive interval
        if (adaptiveIntervalRef.current) {
          clearInterval(adaptiveIntervalRef.current);
          adaptiveIntervalRef.current = null;
        }

        // Set new adaptive interval
        adaptiveIntervalRef.current = setInterval(async () => {
          if (!sessionRef.current?.is_active) {
            console.log('⏹️ Session no longer active, stopping adaptive tracking');
            stopTracking();
            return;
          }

          try {
            const currentLocation = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            const currentSpeed = currentLocation.coords.speed || 0;
            
            await sendOrQueueGps(
              activeSession.id,
              currentLocation
            );
            
            console.log('🔄 Adaptive GPS update:', {
              speed: currentSpeed,
              interval: adaptiveInterval
            });

            // Adjust interval if speed changed significantly
            const newInterval = getAdaptiveInterval(currentSpeed);
            if (Math.abs(newInterval - adaptiveInterval) > 5000) {
              console.log('🔄 Speed changed significantly, adjusting interval');
              startAdaptiveTracking(currentSpeed);
            }
          } catch (error) {
            console.error('❌ Adaptive GPS update failed:', error);
            // Don't stop tracking on single failure, just log it
          }
        }, adaptiveInterval);
      };

      // Start with watchPosition for movement detection
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: MIN_DISTANCE_METERS,
        },
        async (location) => {
          if (!sessionRef.current?.is_active) return;
          
          const speed = location.coords.speed || 0;
          const ts = new Date().toISOString();
          
          console.log('📍 GPS Movement Detected:', {
            sessionId: activeSession.id,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: speed,
            timestamp: ts
          });
          
          await sendOrQueueGps(
            activeSession.id,
            location
          );

          // Start/adjust adaptive tracking based on movement
          startAdaptiveTracking(speed);
        }
      );
      
      // Start initial adaptive tracking
      startAdaptiveTracking(initialLocation.coords.speed || 0);
      
      console.log(' Adaptive GPS tracking started successfully');
    } catch (error) {
      console.error('❌ Failed to start GPS tracking:', error);
      
      // Fallback to simple interval tracking
      console.log('🔄 Falling back to simple interval tracking');
      try {
        await captureAndSendGps();
        intervalRef.current = setInterval(captureAndSendGps, 30000); // Conservative 30s fallback
        console.log(' Fallback tracking started');
      } catch (fallbackError) {
        console.error('❌ Even fallback tracking failed:', fallbackError);
        Alert.alert('GPS Error', 'Unable to start GPS tracking. Please check your location settings.');
      }
    }
  }, [session, captureAndSendGps, sendOrQueueGps, stopTracking]);

  useEffect(() => {
    // Only stop tracking if session becomes inactive
    // GPS tracking is now started manually after session confirmation
    if (!session?.is_active) {
      stopTracking();
      return;
    }
    // Don't automatically start tracking here anymore
    // It's now started manually in handleStartSession after session is confirmed
  }, [session?.is_active, stopTracking]);

  const checkForPings = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      console.log('🔍 Checking for pings...');
      const pings = await ronda.ping.active();
      console.log('📋 Raw pings from API:', pings);
      
      const newPing = pings.find((p: Ping) => p.status !== 'RESPONDED');
      console.log('🎯 Non-responded ping found:', newPing);
      
      // Only show modal if there's a new ping we haven't responded to yet
      setActivePing((currentPing: Ping | null) => {
        console.log('🔄 Comparing pings - current:', currentPing?.id, 'new:', newPing?.id);
        if (newPing && (!currentPing || newPing.id !== currentPing.id)) {
          // New ping detected - show modal
          setPingModalVisible(true);
          console.log('📢 New ping detected - showing modal:', newPing);
          return newPing;
        }
        console.log('✋ No new ping to show');
        return currentPing;
      });
    } catch (error) {
      console.error('❌ Failed to check for pings:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return; // Wait for user to be available
    
    console.log('🔔 Starting ping polling for user:', user.id);
    
    // Start ping polling when component mounts
    checkForPings(); // Check immediately
    pingIntervalRef.current = setInterval(checkForPings, 5000); // Check every 5 seconds for faster response
    
    // Initialize push notification listener (won't work in Expo Go but set up anyway)
    const cleanupNotificationListener = setupNotificationListener();
    
    // Test ping polling in Expo Go
    console.log('📱 Expo Go mode: Polling for pings every 5 seconds');
    
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      cleanupNotificationListener();
    };
  }, [checkForPings, user?.id]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        flushQueue().then(({ sent }) => {
          if (sent > 0) fetchSessions();
          getQueue().then((q) => setQueuedCount(q.length));
        });
      }
    });
    return () => sub.remove();
  }, [fetchSessions]);

  const handlePreShiftPhotos = async (vehicleId: number) => {
    try {
      console.log('📸 Getting required photos for vehicle:', vehicleId);
      const requirements = await photoService.getRequiredPhotos(vehicleId);
      console.log('📋 Required shots:', requirements.required_shots);
      setRequiredShots(requirements.required_shots);
      setCameraMode('pre_shift');
      setShowCamera(true);
    } catch (error) {
      console.error('❌ Error getting photo requirements:', error);
      Alert.alert('Error', 'Failed to get photo requirements. Starting session without photos.');
      // Continue with session start even if photos fail
      handleStartSessionDirectly(vehicleId);
    }
  };

  const handlePhotosComplete = async (photos: any[]) => {
    try {
      console.log('📸 Photos captured:', photos.length);
      // Use default vehicle ID for testing (no vehicle requirement)
      const vehicleId = 1; // Default vehicle for testing
      
      // Upload photos
      setActionLoading(true);
      const result = await photoService.uploadBatchPhotos(photos, vehicleId, cameraMode);
      
      // Handle the new response format (object with submission data)
      if (result && result.message && result.message.includes('success')) {
        Alert.alert('Success', `${result.photo_count || photos.length} photos uploaded successfully!`);
      } else if (Array.isArray(result)) {
        // Legacy format - array of upload results
        const queuedCount = result.filter((r: any) => r.queued).length;
        const uploadedCount = result.filter((r: any) => r.uploaded).length;
        
        if (queuedCount > 0) {
          Alert.alert(
            'Photos Queued', 
            `${queuedCount} photos were queued for upload when the backend is ready. They will be uploaded automatically.`
          );
        } else if (uploadedCount > 0) {
          Alert.alert('Success', `${uploadedCount} photos uploaded successfully!`);
        }
      } else {
        // Default success message
        Alert.alert('Success', `${photos.length} photos uploaded successfully!`);
      }
      
      setShowCamera(false);
      
      // Now handle based on camera mode
      if (cameraMode === 'pre_shift') {
        handleStartSessionDirectly(vehicleId);
      } else if (cameraMode === 'post_shift') {
        // Post-shift photos complete, now stop the session
        stopSessionDirectly();
        Alert.alert('Success', 'Post-shift photos uploaded successfully!');
      }
    } catch (error) {
      console.error('❌ Error uploading photos:', error);
      Alert.alert('Error', 'Failed to upload photos. Please try again.');
      setActionLoading(false);
    }
  };

  const handleStartSessionDirectly = async (vehicleId: number | null) => {
    if (vehicles.length === 0) {
      Alert.alert('No vehicles', 'No vehicles are assigned to your branch. Contact your branch admin.');
      return;
    }
    if (vehicles.length > 1 && selectedVehicleId == null) {
      Alert.alert('Select vehicle', 'Choose which vehicle you are using before starting a session.');
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location required', 'Allow location access to record patrol GPS.');
      return;
    }
    
    setActionLoading(true);
    try {
      console.log('🚗 Starting session with vehicle:', vehicleId);
      const sessionStartTimeIso = new Date().toISOString();
      const newSession = await ronda.sessions.start(vehicleId ?? undefined, sessionStartTimeIso);
      
      // CRITICAL: Set session first, ensure it's fully stored
      setSession(newSession);
      console.log(' Session stored in state:', newSession.id);
      
      // Start background tracking for this user
      if (user?.id) {
        await startBackgroundSessionTracking(user.id);
      }
      
      // CRITICAL: Only start GPS tracking AFTER session is confirmed stored
      // This eliminates the 422 round-trip by ensuring session.id is always available
      console.log('🚀 Starting GPS tracking with confirmed session:', newSession.id);
      await startContinuousTracking(newSession);
      
      console.log(' Session and GPS tracking started successfully:', newSession.id);
    } catch (e: unknown) {
      console.error('❌ Failed to start session:', e);

      const maybeAxios = e as any;
      const status = maybeAxios?.response?.status;
      const isNetworkError = !maybeAxios?.response;
      const isOfflineStart = isNetworkError || status === 0;

      if (isOfflineStart) {
        const offlineStartTimeIso = new Date().toISOString();
        const offline = await startOfflineSession(vehicleId ?? null, offlineStartTimeIso);

        const localSession: OfflineSessionLike = {
          id: offline.local_numeric_id,
          is_active: true,
          driver_username: user?.username || 'driver',
          start_time: offline.start_time,
          end_time: null,
        };

        setSession(localSession as any);
        console.log('📴 Started offline session:', offline.local_id);
        Alert.alert('Offline Mode', 'Session started offline. It will sync automatically when internet is available.');

        console.log('🚀 Starting GPS tracking for offline session:', localSession.id);
        await startContinuousTracking(localSession as any);
        return;
      }

      const msg = maybeAxios?.response?.data?.detail || maybeAxios?.message || 'Failed to start session';
      Alert.alert('Error', String(msg));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartSession = async () => {
    const vehicleId = vehicles.length === 1 ? vehicles[0].id : selectedVehicleId ?? null;
    if (!vehicleId) {
      Alert.alert('Select vehicle', 'Choose which vehicle you are using before starting a session.');
      return;
    }
    
    // Start with pre-shift photos
    handlePreShiftPhotos(vehicleId);
  };

  const handleStopSession = async () => {
    if (!session?.id) return;
    
    const vehicleId = vehicles.length === 1 ? vehicles[0].id : selectedVehicleId ?? 0;
    
    // Start with post-shift photos
    try {
      console.log('📸 Getting post-shift photos for vehicle:', vehicleId);
      const requirements = await photoService.getRequiredPhotos(vehicleId);
      console.log('📋 Required shots:', requirements.required_shots);
      setRequiredShots(requirements.required_shots);
      setCameraMode('post_shift');
      setShowCamera(true);
    } catch (error) {
      console.error('❌ Error getting photo requirements:', error);
      Alert.alert('Error', 'Failed to get photo requirements. Stopping session without photos.');
      // Continue with session stop even if photos fail
      stopSessionDirectly();
    }
  };

  const stopSessionDirectly = async () => {
    if (!session?.id) return;
    setActionLoading(true);
    try {
      console.log('🛑 Stopping session:', session.id);
      await ronda.sessions.stop(session.id);
      stopTracking();
      setSession(null);
      setLastGpsTime(null);
      console.log(' Session stopped successfully');
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Failed to stop session';
      console.error('❌ Failed to stop session:', e);
      Alert.alert('Error', String(msg));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        await logout();
        router.replace('/login');
      } },
    ]);
  };

  const handlePingResponse = async (response: string) => {
    if (!activePing) {
      console.log('⚠️ No active ping to respond to');
      return;
    }
    
    console.log(' Sending ping response:', { pingId: activePing.id, response });
    
    try {
      setActionLoading(true);
      
      // Get current location if available
      const { status } = await Location.getForegroundPermissionsAsync();
      let latitude, longitude;
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
      }
      
      const result = await ronda.ping.respond(activePing.id, response, latitude, longitude);
      console.log(' Ping response sent successfully:', result);
      
      setPingModalVisible(false);
      setActivePing(null);
      Alert.alert('Response Sent', `You responded: ${response}`);
    } catch (error: any) {
      console.error('❌ Failed to respond to ping:', error);
      console.error('Error response:', error.response?.data);
      Alert.alert('Error', `Failed to send response: ${error.response?.data?.error || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRespondLater = () => {
    // Just close modal but keep the ping active
    setPingModalVisible(false);
    console.log('⏰ Ping deferred but still active');
  };

  const handleOpenPendingPing = () => {
    if (activePing) {
      setPingModalVisible(true);
    }
  };

  const handleNavigateToIncident = (incident: Incident) => {
    if (incident.latitude && incident.longitude) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${incident.latitude},${incident.longitude}`;
      Linking.openURL(url).catch((err) => {
        console.error('Failed to open navigation:', err);
        Alert.alert('Error', 'Could not open navigation app');
      });
    } else {
      Alert.alert('No Location', 'This incident does not have location data');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Info Debug */}
      <View style={styles.debugInfo}>
        <Text style={styles.debugTitle}>🔍 Debug Info</Text>
        <Text style={styles.debugText}>User: {user?.username}</Text>
        <Text style={styles.debugText}>Role: {user?.role}</Text>
        <Text style={styles.debugText}>User ID: {user?.id}</Text>
        <Text style={styles.debugText}>Branch ID: {user?.branchId}</Text>
        <Text style={styles.debugText}>Vehicles: {vehicles.length}</Text>
        <Text style={styles.debugText}>🗄️ SQLite: {isInitializing ? 'Initializing...' : isInitialized ? ' Ready' : '❌ Error'}</Text>
        {dbError && <Text style={styles.debugText}>🗄️ DB Error: {dbError}</Text>}
        {vehicles.map((v, i) => (
          <Text key={v.id} style={styles.debugText}>  - {v.plate_number} (ID: {v.id})</Text>
        ))}
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>R.O.N.D.A. Driver</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Driver</Text>
        <Text style={styles.value}>{user?.username ?? '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Branch</Text>
        <Text style={styles.value}>{session?.branch_name ?? user?.branchName ?? '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Vehicle</Text>
        <Text style={styles.value}>{session?.vehicle_plate ?? '—'}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.sessionCard}>
        <Text style={styles.sessionStatus}>
          Session: {session?.is_active ? 'Active' : 'Inactive'}
        </Text>
        {session?.is_active && (
        <Text style={styles.gpsInfo}>
          Continuous GPS tracking. Last: {lastGpsTime ? new Date(lastGpsTime).toLocaleTimeString() : '—'}
          {lastValidationMessage && (
            <Text style={styles.validationInfo}>
              {'\n'}{lastValidationMessage}
            </Text>
          )}
        </Text>
      )}
      {rejectedGpsCount > 0 && (
        <Text style={styles.rejectedCount}>
          ⚠️ Rejected GPS points: {rejectedGpsCount}
        </Text>
      )}
      {queuedCount > 0 && (
        <Text style={styles.queued}>Queued to sync: {queuedCount} point(s)</Text>
      )}
      </View>

      {/* Pending Ping Banner */}
      {activePing && !pingModalVisible && (
        <TouchableOpacity
          style={styles.pendingPingBanner}
          onPress={handleOpenPendingPing}
        >
          <Text style={styles.pendingPingText}>📢 Pending ping from {activePing.sender?.username || 'Admin'} - Tap to respond</Text>
        </TouchableOpacity>
      )}

      {/* Active Incidents Banner */}
      {incidents.length > 0 && (
        <View style={styles.incidentsBanner}>
          <Text style={styles.incidentsBannerTitle}>🚨 Active Alerts ({incidents.length})</Text>
          {incidents.slice(0, 3).map((incident) => {
            const isEmergency = incident.description?.includes('[EMERGENCY]');
            const cleanDesc = incident.description
              ?.replace(/\[EMERGENCY\]|\[ASSISTANCE\]/, '')
              .trim()
              .substring(0, 50) + '...';
            return (
              <View key={incident.id} style={styles.incidentItem}>
                <Text style={[styles.incidentTypeTag, isEmergency ? styles.emergencyTag : styles.assistanceTag]}>
                  {isEmergency ? 'EMRG' : 'ASST'}
                </Text>
                <Text style={styles.incidentDesc}>{cleanDesc}</Text>
                <Text style={styles.incidentTime}>{new Date(incident.created_at).toLocaleTimeString()}</Text>
                {incident.latitude && incident.longitude && (
                  <TouchableOpacity
                    style={styles.navigateButton}
                    onPress={() => handleNavigateToIncident(incident)}
                  >
                    <Text style={styles.navigateButtonText}>🧭</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      {!session?.is_active && vehicles.length > 0 && (
        <View style={styles.vehiclePicker}>
          <Text style={styles.vehiclePickerLabel}>Choose vehicle for this session</Text>
          {vehicles.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[
                styles.vehicleOption,
                selectedVehicleId === v.id && styles.vehicleOptionSelected,
              ]}
              onPress={() => setSelectedVehicleId(v.id)}
            >
              <Text style={styles.vehicleOptionText}>
                {v.plate_number} {v.name ? `— ${v.name}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!session?.is_active && vehicles.length === 0 && !loading && (
        <Text style={styles.noVehicles}>
          No vehicles assigned to your branch. Ask your branch admin to register a vehicle.
        </Text>
      )}

      <View style={styles.actions}>
        {!session?.is_active ? (
          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonStart,
              (actionLoading || (vehicles.length > 1 && selectedVehicleId == null)) && styles.buttonDisabled,
            ]}
            onPress={handleStartSession}
            disabled={actionLoading || (vehicles.length > 1 && selectedVehicleId == null)}
          >
            <Text style={styles.buttonText}>Start Session</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.buttonStop, actionLoading && styles.buttonDisabled]}
            onPress={handleStopSession}
            disabled={actionLoading}
          >
            <Text style={styles.buttonText}>Stop Session</Text>
          </TouchableOpacity>
        )}
      </View>
      <PingModal
        visible={pingModalVisible}
        ping={activePing}
        onRespond={handlePingResponse}
        onClose={handleRespondLater}
      />
      
      {showCamera && (
        <VehicleCamera
          vehicleId={vehicles.length === 1 ? vehicles[0].id : selectedVehicleId ?? 0}
          shiftId={session?.id}
          photoType={cameraMode}
          requiredShots={requiredShots}
          onPhotosComplete={handlePhotosComplete}
          onClose={() => {
            setShowCamera(false);
            setActionLoading(false);
          }}
        />
      )}
      
      {/* Notification Test Component */}
      <NotificationsTest />
    </ScrollView>
  );
}

// Ping Modal Component
function PingModal({ visible, ping, onRespond, onClose }: {
  visible: boolean;
  ping: Ping | null;
  onRespond: (response: string) => void;
  onClose: () => void;
}) {
  if (!visible || !ping) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={pingModalStyles.overlay}>
        <View style={pingModalStyles.container}>
          <Text style={pingModalStyles.title}>📢 Ping from Admin</Text>
          <Text style={pingModalStyles.subtitle}>
            {ping.sender?.username || 'Admin'} sent you a ping at{' '}
            {new Date(ping.sent_at).toLocaleTimeString()}
          </Text>
          <Text style={pingModalStyles.message}>
            Please respond to confirm your status:
          </Text>

          <View style={pingModalStyles.buttonContainer}>
            <TouchableOpacity
              style={[pingModalStyles.button, pingModalStyles.yesButton]}
              onPress={() => onRespond('YES')}
            >
              <Text style={pingModalStyles.buttonText}> Yes, I'm Fine</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[pingModalStyles.button, pingModalStyles.noButton]}
              onPress={() => onRespond('NO')}
            >
              <Text style={pingModalStyles.buttonText}>❌ Need Assistance</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[pingModalStyles.button, pingModalStyles.emergencyButton]}
              onPress={() => onRespond('NEED_ASSISTANCE')}
            >
              <Text style={pingModalStyles.buttonText}>🚨 Emergency Help</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={pingModalStyles.closeButton} onPress={onClose}>
            <Text style={pingModalStyles.closeText}>⏰ Respond Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const pingModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1e3a5f',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 24,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 16,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  yesButton: {
    backgroundColor: '#2e7d32',
  },
  noButton: {
    backgroundColor: '#c62828',
  },
  emergencyButton: {
    backgroundColor: '#ff6f00',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 10,
  },
  closeText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1f2c' },
  content: { padding: 20 },
  debugInfo: {
    backgroundColor: '#2a2a2a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: '#ccc',
    marginBottom: 2,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f1c2e' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  logoutBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  logoutText: { color: '#7eb8ff', fontSize: 15 },

  card: {
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  value: { fontSize: 16, color: '#fff', fontWeight: '500' },

  sessionCard: {
    backgroundColor: '#1a3452',
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
    marginBottom: 24,
  },
  sessionStatus: { fontSize: 16, color: '#fff', fontWeight: '600' },
  gpsInfo: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 8 },
  validationInfo: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  rejectedCount: { fontSize: 12, color: '#ff9800', marginTop: 4 },
  queued: { fontSize: 13, color: '#ffc107', marginTop: 4 },

  error: { color: '#f88', marginBottom: 12, fontSize: 14 },

  vehiclePicker: { marginBottom: 16 },
  vehiclePickerLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  vehicleOption: {
    backgroundColor: '#1a3452',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  vehicleOptionSelected: { borderColor: '#2e7d32' },
  vehicleOptionText: { fontSize: 15, color: '#fff' },
  noVehicles: { color: '#ffc107', marginBottom: 16, fontSize: 14 },

  actions: { gap: 12 },
  button: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonStart: { backgroundColor: '#2e7d32' },
  buttonStop: { backgroundColor: '#c62828' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },

  pendingPingBanner: {
    backgroundColor: '#ff6f00',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  pendingPingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  incidentsBanner: {
    backgroundColor: '#1a3452',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c62828',
  },
  incidentsBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  incidentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  incidentTypeTag: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
    minWidth: 40,
    textAlign: 'center',
  },
  emergencyTag: {
    backgroundColor: '#c62828',
    color: '#fff',
  },
  assistanceTag: {
    backgroundColor: '#ef6c00',
    color: '#fff',
  },
  incidentDesc: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  incidentTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 8,
  },
  navigateButton: {
    padding: 6,
    marginLeft: 8,
    backgroundColor: '#2e7d32',
    borderRadius: 6,
  },
  navigateButtonText: {
    fontSize: 16,
  },
});
