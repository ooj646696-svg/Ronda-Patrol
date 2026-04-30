/**
 * Emergency Screen
 * Quick access to send emergency alerts
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { emergencyApi } from '../src/api/emergency';
import { useLocation } from '../src/hooks/useLocation';
import { EmergencyBanner } from '../src/components/EmergencyBanner';
import { EmergencyOverlay } from '../src/components/EmergencyOverlay';
import { useEmergency } from '../src/contexts/EmergencyContext';

export default function EmergencyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const sessionId = params.sessionId ? parseInt(params.sessionId as string) : undefined;
  const paramLat = params.latitude ? parseFloat(params.latitude as string) : undefined;
  const paramLon = params.longitude ? parseFloat(params.longitude as string) : undefined;
  
  const { currentLocation, startTracking, stopTracking } = useLocation();
  const [sending, setSending] = useState(false);
  const { triggerEmergency } = useEmergency();

  useEffect(() => {
    startTracking();
    return () => stopTracking();
  }, []);

  const handleEmergency = async (type: 'EMERGENCY' | 'ASSISTANCE') => {
    const latitude = currentLocation?.latitude || paramLat;
    const longitude = currentLocation?.longitude || paramLon;
    
    if (!latitude || !longitude) {
      Alert.alert('Location Required', 'Unable to get your current location. Please try again.');
      return;
    }

    if (!sessionId) {
      Alert.alert('No Active Session', 'You must have an active patrol session to send emergency alerts.');
      return;
    }

    const title = type === 'EMERGENCY' ? 'Confirm Emergency' : 'Confirm Assistance Request';
    const message = type === 'EMERGENCY' 
      ? 'This will immediately notify your branch admin and nearby personnel. Are you sure?' 
      : 'This will notify your branch admin that you need assistance. Continue?';

    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: type === 'EMERGENCY' ? 'SEND EMERGENCY' : 'Request Assistance',
          style: type === 'EMERGENCY' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setSending(true);
              
              // Trigger visual emergency indicators
              if (sessionId) {
                triggerEmergency(type, sessionId, type === 'EMERGENCY' ? 'Emergency alert triggered by driver' : 'Assistance requested by driver');
              }
              
              await emergencyApi.createEmergencyAlert({
                session: sessionId,
                type,
                latitude,
                longitude,
                description: type === 'EMERGENCY' ? 'Emergency alert triggered by driver' : 'Assistance requested by driver',
              });
              Alert.alert(
                type === 'EMERGENCY' ? 'Emergency Reported' : 'Assistance Requested',
                type === 'EMERGENCY'
                  ? 'Incident reported. Help is on the way. Stay calm and stay safe.'
                  : 'Your branch admin has been notified of your assistance request.',
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (error) {
              console.error('Failed to send emergency:', error);
              Alert.alert('Error', 'Failed to send alert. Please try again or call directly.');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0b0b" />
      <EmergencyBanner />
      <EmergencyOverlay />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Location Info */}
      <View style={styles.locationCard}>
        <Text style={styles.locationLabel}>Your Current Location</Text>
        {currentLocation ? (
          <>
            <Text style={styles.locationCoords}>
              {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
            </Text>
            <Text style={styles.locationAccuracy}>
              Accuracy: ±{currentLocation.accuracy?.toFixed(0) || '?'}m
            </Text>
          </>
        ) : (
          <ActivityIndicator color="#888" />
        )}
      </View>

      {/* Emergency Buttons */}
      <View style={styles.buttonsContainer}>
        {/* Main Emergency Button */}
        <TouchableOpacity 
          style={[styles.emergencyButton, sending && styles.buttonDisabled]}
          onPress={() => handleEmergency('EMERGENCY')}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <>
              <Text style={styles.emergencyText}>EMERGENCY</Text>
              <Text style={styles.emergencySubtext}>Tap to send immediate alert</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Assistance Button */}
        <TouchableOpacity 
          style={[styles.assistanceButton, sending && styles.buttonDisabled]}
          onPress={() => handleEmergency('ASSISTANCE')}
          disabled={sending}
        >
          <Text style={styles.assistanceText}>Need Assistance</Text>
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsTitle}>When to use:</Text>
        <Text style={styles.instructionsText}>
          • <Text style={styles.bold}>Emergency</Text>: Immediate danger, injury, security threat, accident
        </Text>
        <Text style={styles.instructionsText}>
          • <Text style={styles.bold}>Assistance</Text>: Vehicle trouble, minor issues, non-urgent help needed
        </Text>
      </View>
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
  backButton: {
    fontSize: 16,
    color: '#888',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  locationCard: {
    margin: 20,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  locationLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  locationCoords: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  locationAccuracy: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  buttonsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
  },
  emergencyButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  emergencyText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  emergencySubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  assistanceButton: {
    width: 160,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#ff9500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assistanceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  instructionsCard: {
    margin: 20,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
    lineHeight: 20,
  },
  bold: {
    color: '#fff',
    fontWeight: '600',
  },
});
