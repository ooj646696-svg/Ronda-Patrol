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
} from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '@/lib/auth-context';
import { ronda } from '@/lib/api';
import { pushToQueue, flushQueue, getQueue } from '@/lib/gps-queue';
import { useRouter } from 'expo-router';
import NotificationsTest from '@/components/NotificationsTest';
import { 
  initializeBackgroundTracking, 
  cleanupBackgroundTracking, 
  startBackgroundSessionTracking 
} from '@/lib/backgroundTasks';
import { setupNotificationListener } from '@/lib/notifications';

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

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGpsTime, setLastGpsTime] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const adaptiveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activePing, setActivePing] = useState<Ping | null>(null);
  const [pingModalVisible, setPingModalVisible] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await ronda.sessions.list();
      const list = Array.isArray(data) ? data : data.results || [];
      const active = list.find((s: Session) => s.is_active);
      setSession(active || null);
      setError(null);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Failed to load session';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const fetchVehicles = useCallback(async () => {
    try {
      const data = await ronda.vehicles.list();
      const list = Array.isArray(data) ? data : data.results || [];
      setVehicles(list);
      if (list.length === 1) setSelectedVehicleId((list[0] as Vehicle).id);
    } catch (_) {
      setVehicles([]);
    }
  }, []);

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
    async (sessionId: number, lat: number, lon: number, timestamp: string) => {
      try {
        await ronda.gpsLogs.create(sessionId, lat, lon, timestamp);
        setLastGpsTime(timestamp);
        console.log('✅ GPS data sent successfully:', { sessionId, lat, lon, timestamp });
      } catch (error) {
        console.log('📦 GPS send failed, queuing data:', { sessionId, lat, lon, timestamp, error });
        await pushToQueue({ sessionId, latitude: lat, longitude: lon, timestamp });
        const { getQueue } = await import('@/lib/gps-queue');
        const q = await getQueue();
        setQueuedCount(q.length);
        console.log('📋 Queue size after adding:', q.length);
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
      const ts = new Date().toISOString();
      await sendOrQueueGps(
        session.id,
        loc.coords.latitude,
        loc.coords.longitude,
        ts
      );
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

  const startContinuousTracking = useCallback(async () => {
    if (!session?.is_active) {
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

      console.log('🚀 Starting adaptive GPS tracking for session:', session.id);

      // Get initial position
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      await sendOrQueueGps(
        session.id,
        initialLocation.coords.latitude,
        initialLocation.coords.longitude,
        new Date().toISOString()
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
          if (!session?.is_active) {
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
              session.id,
              currentLocation.coords.latitude,
              currentLocation.coords.longitude,
              new Date().toISOString()
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
          if (!session?.is_active) return;
          
          const speed = location.coords.speed || 0;
          const ts = new Date().toISOString();
          
          console.log('📍 GPS Movement Detected:', {
            sessionId: session.id,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: speed,
            timestamp: ts
          });
          
          await sendOrQueueGps(
            session.id,
            location.coords.latitude,
            location.coords.longitude,
            ts
          );

          // Start/adjust adaptive tracking based on movement
          startAdaptiveTracking(speed);
        }
      );
      
      // Start initial adaptive tracking
      startAdaptiveTracking(initialLocation.coords.speed || 0);
      
      console.log('✅ Adaptive GPS tracking started successfully');
    } catch (error) {
      console.error('❌ Failed to start GPS tracking:', error);
      
      // Fallback to simple interval tracking
      console.log('🔄 Falling back to simple interval tracking');
      try {
        await captureAndSendGps();
        intervalRef.current = setInterval(captureAndSendGps, 30000); // Conservative 30s fallback
        console.log('✅ Fallback tracking started');
      } catch (fallbackError) {
        console.error('❌ Even fallback tracking failed:', fallbackError);
        Alert.alert('GPS Error', 'Unable to start GPS tracking. Please check your location settings.');
      }
    }
  }, [session, captureAndSendGps, sendOrQueueGps, stopTracking]);

  useEffect(() => {
    if (!session?.is_active) {
      stopTracking();
      return;
    }
    startContinuousTracking();
    return () => stopTracking();
  }, [session?.id, session?.is_active, startContinuousTracking, stopTracking]);

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
    // Start ping polling when component mounts
    checkForPings(); // Check immediately
    pingIntervalRef.current = setInterval(checkForPings, 10000); // Check every 10 seconds
    
    // Initialize push notification listener
    const cleanupNotificationListener = setupNotificationListener();
    
    // Test push notification setup
    setTimeout(() => {
      console.log('🔔 Testing push notification setup...');
      if (typeof (global as any).emitPingNotification === 'function') {
        console.log('✅ Push notification handler is ready');
        // Simulate a test ping notification
        (global as any).emitPingNotification({
          id: 999,
          sender: 'Test System',
          status: 'SENT',
          sent_at: new Date().toISOString()
        });
      } else {
        console.log('❌ Push notification handler not ready');
      }
    }, 2000); // Test after 2 seconds
    
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      cleanupNotificationListener();
    };
  }, [checkForPings]);

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

  const handleStartSession = async () => {
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
    const vehicleId = vehicles.length === 1 ? vehicles[0].id : selectedVehicleId ?? null;
    setActionLoading(true);
    try {
      console.log('🚗 Starting session with vehicle:', vehicleId);
      const newSession = await ronda.sessions.start(vehicleId ?? undefined);
      setSession(newSession);
      
      // Start background tracking for this user
      if (user?.id) {
        await startBackgroundSessionTracking(user.id);
      }
      
      console.log('✅ Session started successfully:', newSession.id);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (e as Error)?.message
        || 'Failed to start session';
      console.error('❌ Failed to start session:', e);
      Alert.alert('Error', String(msg));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopSession = async () => {
    if (!session?.id) return;
    setActionLoading(true);
    try {
      console.log('🛑 Stopping session:', session.id);
      await ronda.sessions.stop(session.id);
      setSession(null);
      setLastGpsTime(null);
      console.log('✅ Session stopped successfully');
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
    
    console.log('📤 Sending ping response:', { pingId: activePing.id, response });
    
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
      console.log('✅ Ping response sent successfully:', result);
      
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
              <Text style={pingModalStyles.buttonText}>✅ Yes, I'm Fine</Text>
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
  container: { flex: 1, backgroundColor: '#0f1c2e' },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f1c2e' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
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
  gpsInfo: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6 },
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
    backgroundColor: '#ff9800',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#f57c00',
  },
  pendingPingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
