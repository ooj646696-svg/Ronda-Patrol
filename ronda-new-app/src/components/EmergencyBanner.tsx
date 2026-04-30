/**
 * Emergency Banner Component
 * Shows a flashing red banner when emergency is active
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useEmergency } from '../contexts/EmergencyContext';

export function EmergencyBanner() {
  const { emergency } = useEmergency();
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (emergency.isActive && emergency.type === 'EMERGENCY') {
      // Flashing animation for emergency
      const flashAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      flashAnimation.start();
      
      return () => flashAnimation.stop();
    } else if (emergency.isActive && emergency.type === 'ASSISTANCE') {
      // Solid orange for assistance
      opacityAnim.setValue(1);
    } else {
      opacityAnim.setValue(0);
    }
  }, [emergency.isActive, emergency.type, opacityAnim]);

  if (!emergency.isActive) {
    return null;
  }

  const bannerStyle = emergency.type === 'EMERGENCY' 
    ? styles.emergencyBanner 
    : styles.assistanceBanner;

  const text = emergency.type === 'EMERGENCY' 
    ? '🚨 EMERGENCY ACTIVE 🚨' 
    : '⚠️ ASSISTANCE REQUESTED ⚠️';

  return (
    <Animated.View style={[styles.banner, bannerStyle, { opacity: opacityAnim }]}>
      <Text style={styles.bannerText}>{text}</Text>
      {emergency.timestamp && (
        <Text style={styles.timestampText}>
          {emergency.timestamp.toLocaleTimeString()}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  emergencyBanner: {
    backgroundColor: '#ff0000',
    borderWidth: 2,
    borderColor: '#ff6666',
  },
  assistanceBanner: {
    backgroundColor: '#ff9500',
    borderWidth: 2,
    borderColor: '#ffb84d',
  },
  bannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  timestampText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
