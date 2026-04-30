/**
 * Home/Patrol Screen
 * Main screen with map view and session controls
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Circle } from 'react-native-maps';
import { useAuth } from '../../src/hooks/useAuth';
import { useSession } from '../../src/hooks/useSession';
import { useLocation } from '../../src/hooks/useLocation';
import { useRouter } from 'expo-router';
import { gpsApi } from '../../src/api/gps';
import { EmergencyBanner } from '../../src/components/EmergencyBanner';
import { EmergencyOverlay } from '../../src/components/EmergencyOverlay';
import { useEmergency } from '../../src/contexts/EmergencyContext';
import { useNetworkConnectivity } from '../../src/services/networkConnectivity';
import { offlineGpsQueueService } from '../../src/services/offlineGpsQueue';

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { session, hasActiveSession, startSession, stopSession, loading } = useSession();
  const { currentLocation, startTracking, stopTracking, startBackgroundTracking, stopBackgroundTracking, isBackgroundTracking } = useLocation();
  const router = useRouter();
  const [showVehicleSelect, setShowVehicleSelect] = useState(false);
  const { triggerEmergency } = useEmergency();
  const { isOnline, isOffline } = useNetworkConnectivity();
  const [offlineQueueStats, setOfflineQueueStats] = useState({ totalEntries: 0, isOnline: true, isSyncing: false });

  const mapRegion = useMemo(() => ({
    latitude: currentLocation?.latitude || 14.5995,
    longitude: currentLocation?.longitude || 120.9842,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  }), [currentLocation?.latitude, currentLocation?.longitude]);

  useEffect(() => {
    if (session) {
      console.log('Patrol active - Session:', session.id, 'Vehicle:', session.vehicle_plate);
    }
  }, [session]);

  // Initialize offline queue service
  useEffect(() => {
    const initializeOfflineService = async () => {
      try {
        await offlineGpsQueueService.start();
        console.log('Offline GPS queue service initialized');
      } catch (error) {
        console.error('Failed to initialize offline GPS queue service:', error);
      }
    };

    initializeOfflineService();

    // Set up periodic status updates
    const statusInterval = setInterval(async () => {
      try {
        const stats = await offlineGpsQueueService.getQueueStats();
        setOfflineQueueStats(stats);
      } catch (error) {
        console.error('Failed to get offline queue stats:', error);
      }
    }, 5000); // Update every 5 seconds

    return () => {
      clearInterval(statusInterval);
      offlineGpsQueueService.stop();
    };
  }, []);

  // Start/stop GPS tracking based on session state
  useEffect(() => {
    if (hasActiveSession && session) {
      console.log('GPS tracking started');
      startTracking();
      
      // Start background tracking for continuous GPS
      if (session.id) {
        startBackgroundTracking(session.id);
      }
    } else {
      console.log('GPS tracking stopped');
      stopTracking();
      stopBackgroundTracking();
    }

    return () => {
      stopTracking();
      stopBackgroundTracking();
    };
  }, [hasActiveSession, session, startTracking, stopTracking, startBackgroundTracking, stopBackgroundTracking]);

  // Send GPS data to backend when location updates
  useEffect(() => {
    if (hasActiveSession && session && currentLocation) {
      const sendGpsData = async () => {
        try {
          await gpsApi.create({
            session: session.id,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            timestamp: new Date().toISOString(),
            accuracy: currentLocation.accuracy ? Math.round(currentLocation.accuracy * 100) / 100 : undefined,
            speed: currentLocation.speed ? Math.round(currentLocation.speed * 100) / 100 : undefined,
            altitude: currentLocation.altitude ? Math.round(currentLocation.altitude * 10) / 10 : undefined,
          });
        } catch (error: any) {
          // Don't log 400 errors (session ended) as they're expected
          if (error.response?.status === 400) {
            console.log('GPS data not sent - session may have ended');
          } else {
            console.error('Failed to send GPS data:', error);
          }
        }
      };

      sendGpsData();
    }
  }, [currentLocation, hasActiveSession, session]);

  const handleStartShift = () => {
    router.push('/vehicle-select' as any);
  };

  const handleEmergency = () => {
    if (!session) {
      Alert.alert('No Active Session', 'Please start a patrol session first.');
      return;
    }

    // Navigate to emergency screen - visual indicators will only trigger after confirmation
    router.push({
      pathname: '/emergency',
      params: {
        sessionId: session.id,
        latitude: currentLocation?.latitude,
        longitude: currentLocation?.longitude,
      },
    } as any);
  };

  const handleStopShift = () => {
    if (!session) return;
    // Navigate to photo capture for post-shift snapshots first
    const vehicleId = typeof session.vehicle === 'number' ? session.vehicle : session.vehicle?.id;
    router.push({
      pathname: '/photo-capture',
      params: {
        vehicleId: vehicleId?.toString(),
        mode: 'post_shift',
        sessionId: session.id.toString(),
      },
    } as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0b0b" />
      <EmergencyBanner />
      <EmergencyOverlay />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.username}</Text>
          <Text style={styles.status}>
            {hasActiveSession ? 'On Patrol' : 'Off Duty'}
          </Text>
          {hasActiveSession && isBackgroundTracking && (
            <Text style={styles.backgroundStatus}>📍 Background GPS Active</Text>
          )}
          {isOffline && (
            <Text style={styles.offlineStatus}>📵 Offline Mode</Text>
          )}
          {offlineQueueStats.totalEntries > 0 && (
            <Text style={styles.queueStatus}>
              📦 {offlineQueueStats.totalEntries} GPS points queued
              {offlineQueueStats.isSyncing && ' (syncing...)'}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {hasActiveSession ? (
          // Active Session View
          <View style={styles.sessionCard}>
            <Text style={styles.sessionTitle}>Active Patrol Session</Text>
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionLabel}>Session ID:</Text>
              <Text style={styles.sessionValue}>#{session?.id}</Text>
            </View>
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionLabel}>Started:</Text>
              <Text style={styles.sessionValue}>
                {session?.start_time ? new Date(session.start_time).toLocaleTimeString() : 'N/A'}
              </Text>
            </View>
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionLabel}>Vehicle:</Text>
              <Text style={styles.sessionValue}>{session?.vehicle_plate || 'N/A'}</Text>
            </View>

            {/* Map View */}
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                region={mapRegion}
                showsUserLocation={true}
                followsUserLocation={true}
                showsMyLocationButton={true}
                showsCompass={true}
              >
                {currentLocation && (
                  <>
                    <Marker
                      coordinate={{
                        latitude: currentLocation.latitude,
                        longitude: currentLocation.longitude,
                      }}
                      title="Your Location"
                      description={`Accuracy: ${currentLocation.accuracy?.toFixed(1) || 'N/A'}m`}
                    />
                    {currentLocation.accuracy && (
                      <Circle
                        center={{
                          latitude: currentLocation.latitude,
                          longitude: currentLocation.longitude,
                        }}
                        radius={currentLocation.accuracy}
                        fillColor="rgba(45, 140, 76, 0.2)"
                        strokeColor="rgba(45, 140, 76, 0.5)"
                        strokeWidth={2}
                      />
                    )}
                  </>
                )}
              </MapView>

              {/* Floating Emergency Button */}
              <TouchableOpacity style={styles.emergencyButtonFloating} onPress={handleEmergency}>
                <Text style={styles.emergencyButtonText}>SOS</Text>
              </TouchableOpacity>

              {currentLocation && (
                <View style={styles.mapOverlay}>
                  <Text style={styles.mapCoords}>
                    {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.button, styles.stopButton]}
              onPress={handleStopShift}
              disabled={loading}
            >
              <Text style={styles.buttonText}>End Shift</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // No Active Session View
          <View style={styles.noSessionCard}>
            <Text style={styles.noSessionTitle}>Ready to Patrol</Text>
            <Text style={styles.noSessionText}>
              Select a vehicle and complete pre-shift photos to begin your patrol session.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={handleStartShift}
            >
              <Text style={styles.buttonText}>Start Shift</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  status: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  backgroundStatus: {
    fontSize: 12,
    color: '#2d8c4c',
    marginTop: 2,
    fontWeight: '600',
  },
  offlineStatus: {
    fontSize: 12,
    color: '#ff9500',
    marginTop: 2,
    fontWeight: '600',
  },
  queueStatus: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
    fontWeight: '500',
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  sessionCard: {
    gap: 16,
  },
  sessionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  sessionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sessionLabel: {
    fontSize: 14,
    color: '#888',
  },
  sessionValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  mapContainer: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  mapCoords: {
    fontSize: 12,
    color: '#fff',
    fontFamily: 'monospace',
  },
  emergencyButtonFloating: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  emergencyButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  button: {
    backgroundColor: '#2d8c4c',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#ff6b6b',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  noSessionCard: {
    gap: 16,
    alignItems: 'center',
    paddingVertical: 40,
  },
  noSessionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  noSessionText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
  },
});
