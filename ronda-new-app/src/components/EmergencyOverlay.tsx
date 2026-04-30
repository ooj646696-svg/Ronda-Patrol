/**
 * Emergency Overlay Component
 * Full-screen red overlay with pulsing effect when emergency is active
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Dimensions } from 'react-native';
import { useEmergency } from '../contexts/EmergencyContext';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

export function EmergencyOverlay() {
  const { emergency, clearEmergency } = useEmergency();
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const slideAnim = useRef(new Animated.Value(-height)).current;

  useEffect(() => {
    if (emergency.isActive) {
      // Slide up animation
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Pulsing animation for emergency
      if (emergency.type === 'EMERGENCY') {
        const pulseAnimation = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 0.8,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 0.3,
              duration: 800,
              useNativeDriver: true,
            }),
          ])
        );
        pulseAnimation.start();
        
        return () => pulseAnimation.stop();
      } else {
        pulseAnim.setValue(0.5);
      }
    } else {
      // Slide down animation
      Animated.timing(slideAnim, {
        toValue: -height,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [emergency.isActive, emergency.type, pulseAnim, slideAnim]);

  if (!emergency.isActive) {
    return null;
  }

  const overlayStyle = emergency.type === 'EMERGENCY' 
    ? styles.emergencyOverlay 
    : styles.assistanceOverlay;

  const title = emergency.type === 'EMERGENCY' 
    ? 'EMERGENCY ACTIVATED' 
    : 'ASSISTANCE REQUESTED';

  const subtitle = emergency.type === 'EMERGENCY' 
    ? 'Help has been notified. Stay calm and stay safe.' 
    : 'Your assistance request has been sent.';

  return (
    <Animated.View 
      style={[
        styles.overlay, 
        overlayStyle, 
        { opacity: pulseAnim },
        { transform: [{ translateY: slideAnim }] }
      ]}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={clearEmergency} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.messageContainer}>
            <Text style={styles.subtitle}>{subtitle}</Text>
            
            {emergency.timestamp && (
              <Text style={styles.timeText}>
                Activated at: {emergency.timestamp.toLocaleTimeString()}
              </Text>
            )}
            
            {emergency.description && (
              <View style={styles.descriptionContainer}>
                <Text style={styles.descriptionLabel}>Details:</Text>
                <Text style={styles.descriptionText}>{emergency.description}</Text>
              </View>
            )}
          </View>

          <View style={styles.actionsContainer}>
            <TouchableOpacity 
              onPress={clearEmergency} 
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>Clear Emergency</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  emergencyOverlay: {
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    borderWidth: 4,
    borderColor: '#ff3333',
  },
  assistanceOverlay: {
    backgroundColor: 'rgba(255, 149, 0, 0.9)',
    borderWidth: 4,
    borderColor: '#ff9933',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  timeText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 20,
  },
  descriptionContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  descriptionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  actionsContainer: {
    paddingBottom: 40,
  },
  clearButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  clearButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});
