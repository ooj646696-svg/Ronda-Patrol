/**
 * Home/Patrol Screen
 * Main screen with map view and session controls
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebViewMap from '../../src/components/WebViewMap'; 
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
import { useTheme } from '../../src/theme/ThemeProvider';
import { reverseGeocode, getShortLocationName, GeocodedAddress } from '../../src/services/geocoding';
import { toastService } from '../../src/services/toast';

// Google Maps Dark Mode Style
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#263c3f' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b9a76' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#38414e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212a37' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ca5b3' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#746855' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2835' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f3d19c' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f3948' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#17263c' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#515c6d' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#17263c' }],
  },
];

export default function HomeScreen() {
  const webViewRef = useRef<any>(null);
  const { colors, theme } = useTheme();
  const { user, logout } = useAuth();
  const { session, hasActiveSession, startSession, stopSession, loading } = useSession();
  const { currentLocation, getCurrentLocation, startTracking, stopTracking, startBackgroundTracking, stopBackgroundTracking, isBackgroundTracking } = useLocation();
  const router = useRouter();
  const [showVehicleSelect, setShowVehicleSelect] = useState(false);
  const { triggerEmergency } = useEmergency();
  const { isOnline, isOffline } = useNetworkConnectivity();
  const [offlineQueueStats, setOfflineQueueStats] = useState({ totalEntries: 0, isOnline: true, isSyncing: false });
  const [locationName, setLocationName] = useState<string>('Locating...');
  const [addressData, setAddressData] = useState<GeocodedAddress | null>(null);

  const mapRegion = useMemo(() => {
    const region = {
      latitude: currentLocation?.latitude || 13.9333, // Lucena City center
      longitude: currentLocation?.longitude || 121.6167,
      latitudeDelta: 0.8, // Quezon province view
      longitudeDelta: 0.8,
    };
    console.log('Map region:', region);
    return region;
  }, [currentLocation]);

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

  // Reverse geocode location when coordinates change
  useEffect(() => {
    if (currentLocation) {
      const fetchLocationName = async () => {
        const address = await reverseGeocode(currentLocation.latitude, currentLocation.longitude);
        if (address) {
          setAddressData(address);
          setLocationName(getShortLocationName(address));
        } else {
          setLocationName('Location unavailable');
        }
      };
      fetchLocationName();
    }
  }, [currentLocation?.latitude, currentLocation?.longitude]);

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
    
    // Show toast notification
    toastService.success('Ending shift...', {
      title: '🛑 Shift Ending'
    });
    
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

  const handleLogout = () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            logout();
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleCenterLocation = async () => {
    console.log('Center location button pressed');
    
    // If no current location, try to get it
    if (!currentLocation) {
      console.log('No current location, getting new location...');
      const location = await getCurrentLocation();
      if (!location) {
        console.log('Failed to get location');
        Alert.alert('Location Error', 'Unable to get your current location. Please check GPS settings.');
        return;
      }
    }
    
    if (currentLocation && webViewRef.current) {
      console.log('Centering map to location:', currentLocation);
      // Send centering message to WebView
      webViewRef.current.postMessage(JSON.stringify({
        type: 'centerLocation',
        location: currentLocation
      }));
    } else {
      console.log('Still no location available');
      Alert.alert('Location Error', 'No location data available. Please ensure location services are enabled.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <EmergencyBanner />
      <EmergencyOverlay />

      {/* Main Content */}
      {hasActiveSession ? (
        // Active Session View - Jogging Tracker Style (Full Screen Map)
        <View style={styles.fullScreenMapContainer}>
          {/* Full Screen Map */}
          <WebViewMap
            ref={webViewRef}
            currentLocation={currentLocation}
            onMapReady={() => console.log('WebView Map is ready!')}
          />

          {/* Floating Top Bar - Status & End Shift */}
          <View style={styles.floatingTopBar}>
            <View>
              {/* <Text style={[styles.greetingText, { color: colors.text }]}>Hi, {user?.username || 'Driver'}!</Text> */}
              <View style={styles.patrolStatusBadge}>
                <View style={styles.pulseDot} />
                <Text style={styles.patrolStatusText}>Patrol Active</Text>
              </View>
              {isBackgroundTracking && <Text style={styles.statusText}>Background Tracking Active</Text>}
              {isOffline && <Text style={styles.statusText}>Offline Mode</Text>}
              {offlineQueueStats.totalEntries > 0 && (
                <Text style={styles.statusText}>
                  Queue: {offlineQueueStats.totalEntries} {offlineQueueStats.isSyncing ? '(Syncing...)' : ''}
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.endShiftButton} onPress={handleStopShift}>
              <Text style={styles.endShiftButtonText}>End Shift</Text>
            </TouchableOpacity>
          </View>

          {/* Floating Bottom Info Panel - Single Rectangle */}
          <View style={styles.bottomInfoPanel}>
            {/* Location Name */}
            {currentLocation && (
              <Text style={styles.locationNameText} numberOfLines={1}>
                {locationName}
              </Text>
            )}

            {/* Info Row */}
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Vehicle</Text>
                <Text style={styles.infoValue}>{session?.vehicle_plate || 'N/A'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Started</Text>
                <Text style={styles.infoValue}>
                  {session?.start_time ? new Date(session.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}
                </Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Duration</Text>
                <Text style={styles.infoValue}>
                  {session?.start_time
                    ? (() => {
                        const diff = Date.now() - new Date(session.start_time).getTime();
                        const hours = Math.floor(diff / 3600000);
                        const mins = Math.floor((diff % 3600000) / 60000);
                        return `${hours}h ${mins}m`;
                      })()
                    : '0h 0m'}
                </Text>
              </View>
            </View>

            {/* SOS Button */}
            <TouchableOpacity style={styles.sosButton} onPress={handleEmergency}>
              <Text style={styles.sosButtonText}>SOS</Text>
            </TouchableOpacity>
          </View>

          {/* Custom Location Button - Top Right */}
          <TouchableOpacity style={styles.locationButton} onPress={handleCenterLocation}>
            <Text style={styles.locationButtonText}>📍</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // No Active Session View
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={[styles.noSessionCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.greetingText, { color: colors.text }]}>Hi, {user?.username || 'Driver'}!</Text>
            <Text style={[styles.noSessionTitle, { color: colors.text }]}>Ready to Start Patrol?</Text>
            <Text style={[styles.noSessionText, { color: colors.mutedText }]}>
              Select a vehicle and complete pre-shift photos to begin your patrol session.
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={handleStartShift}
            >
              <Text style={[styles.buttonText, { color: '#fff' }]}>Start Shift</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    flexGrow: 1,
    justifyContent: 'center',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  noSessionCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  noSessionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  noSessionText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Jogging Tracker Style - Active Patrol
  fullScreenMapContainer: {
    flex: 1,
  },
  fullScreenMap: {
    flex: 1,
  },
  floatingTopBar: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greetingText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  patrolStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(45, 140, 76, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  patrolStatusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusText: {
    color: '#2d8c4c',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  endShiftButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  endShiftButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomInfoPanel: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    // backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#1b1b1b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationNameText: {
    color: '#1b1b1b',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  infoItem: {
    alignItems: 'center',
  },
  infoLabel: {
    color: '#555',
    fontSize: 11,
    marginBottom: 4,
  },
  infoValue: {
    color: '#1b1b1b',
    fontSize: 14,
    fontWeight: '600',
  },
  sosButton: {
    backgroundColor: '#ff4444',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  sosButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  locationButton: {
    position: 'absolute',
    bottom: 180,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgb(255, 255, 255)',
    justifyContent: 'center',
    alignItems: 'center',
    // shadowColor: '#000',
    // shadowOffset: { width: 0, height: 2 },
    // shadowOpacity: 0.5,
    // shadowRadius: 4,
    // elevation: 5,
  },
  locationButtonText: {
    fontSize: 20,
  },
});
