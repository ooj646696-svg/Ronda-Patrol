/**
 * Ping Response Screen
 * Handles responding to ping notifications
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { emergencyService } from '../../src/services/emergency';
import { useLocation } from '../../src/hooks/useLocation';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { PingResponse } from '../../src/types';

export default function PingResponseScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const { currentLocation } = useLocation();
  const [loading, setLoading] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [pingInfo, setPingInfo] = useState<any>(null);

  useEffect(() => {
    // You could fetch ping details here if needed
    console.log('Ping ID:', id);
  }, [id]);

  const handleResponse = async (response: PingResponse) => {
    if (!id) {
      Alert.alert('Error', 'Invalid ping ID');
      return;
    }

    // Prevent duplicate responses
    if (hasResponded || loading) {
      console.log('Already responded to this ping, ignoring duplicate click');
      return;
    }

    setLoading(true);
    try {
      const success = await emergencyService.respondToPing(
        Number(id),
        response,
        currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        } : undefined
      );

      // If emergency response, show emergency mode
      if (response === 'Emergency') {
        Alert.alert(
          'EMERGENCY MODE',
          'Emergency response sent! Help is on the way.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
              style: 'default',
            },
          ],
          { cancelable: false }
        );
      } else {
        Alert.alert('Response Sent', 'Your response has been recorded.', [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]);
      }

      if (success) {
        setHasResponded(true);
      } else {
        Alert.alert('Error', 'Failed to send response. Please try again.');
      }
    } catch (error) {
      console.error('Error responding to ping:', error);
      Alert.alert('Error', 'Failed to send response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Ping Received</Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]}>
            Please respond to let us know your status
          </Text>
        </View>

        <View style={styles.responseContainer}>
          <TouchableOpacity
            style={[styles.responseButton, styles.okButton, { backgroundColor: '#2d8c4c' }]}
            onPress={() => handleResponse("I'm fine")}
            disabled={loading}
          >
            <Text style={styles.responseButtonText}>✓ I'm Fine</Text>
            <Text style={styles.responseDescription}>
              Everything is okay, no assistance needed
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.responseButton, styles.assistanceButton, { backgroundColor: '#ff9500' }]}
            onPress={() => handleResponse('Needs assistance')}
            disabled={loading}
          >
            <Text style={styles.responseButtonText}>⚠ Need Assistance</Text>
            <Text style={styles.responseDescription}>
              I need some help but it's not an emergency
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.responseButton, styles.emergencyButton, { backgroundColor: '#ff4444' }]}
            onPress={() => handleResponse('Emergency')}
            disabled={loading}
          >
            <Text style={styles.responseButtonText}>🚨 Emergency</Text>
            <Text style={styles.responseDescription}>
              This is an emergency, I need immediate help
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.ignoreButton, { backgroundColor: colors.border }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.ignoreButtonText, { color: colors.text }]}>Ignore</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  responseContainer: {
    gap: 16,
    marginBottom: 40,
  },
  responseButton: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  okButton: {},
  assistanceButton: {},
  emergencyButton: {},
  responseButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  responseDescription: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    textAlign: 'center',
  },
  ignoreButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ignoreButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
