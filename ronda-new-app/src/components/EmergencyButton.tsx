/**
 * Emergency Button Component
 * Prominent emergency alert button for drivers
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useSession } from '../hooks/useSession';
import { emergencyService } from '../services/emergency';

interface EmergencyButtonProps {
  style?: any;
}

export function EmergencyButton({ style }: EmergencyButtonProps) {
  const { session } = useSession();
  const [showModal, setShowModal] = useState(false);
  const [description, setDescription] = useState('');
  const [isEmergency, setIsEmergency] = useState(true);

  const handlePress = () => {
    if (!session) {
      Alert.alert('No Active Session', 'Please start a patrol session first.');
      return;
    }
    setShowModal(true);
  };

  const handleConfirm = async () => {
    if (!session) return;

    try {
      if (isEmergency) {
        await emergencyService.triggerEmergency(session.id, description);
      } else {
        await emergencyService.requestAssistance(session.id, description);
      }
      setShowModal(false);
      setDescription('');
      Alert.alert(
        isEmergency ? 'Emergency Alert Sent' : 'Assistance Request Sent',
        'Your location has been shared with nearby personnel.'
      );
    } catch (error) {
      console.error('Failed to send alert:', error);
      Alert.alert('Error', 'Failed to send alert. Please try again.');
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, style]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>EMERGENCY</Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isEmergency ? 'Emergency Alert' : 'Request Assistance'}
            </Text>
            <Text style={styles.modalDescription}>
              {isEmergency
                ? 'This will alert all nearby personnel and share your location. Use only in emergencies.'
                : 'Request assistance from nearby personnel. Your location will be shared.'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Describe the situation (optional)"
              placeholderTextColor="#999"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  isEmergency && styles.typeButtonActive,
                  isEmergency && styles.typeButtonEmergency,
                ]}
                onPress={() => setIsEmergency(true)}
              >
                <Text style={[
                  styles.typeButtonText,
                  isEmergency && styles.typeButtonTextActive,
                ]}>
                  Emergency
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  !isEmergency && styles.typeButtonActive,
                  !isEmergency && styles.typeButtonAssistance,
                ]}
                onPress={() => setIsEmergency(false)}
              >
                <Text style={[
                  styles.typeButtonText,
                  !isEmergency && styles.typeButtonTextActive,
                ]}>
                  Assistance
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.confirmButton,
                  isEmergency ? styles.confirmButtonEmergency : styles.confirmButtonAssistance,
                ]}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmButtonText}>
                  {isEmergency ? 'Send Emergency' : 'Request Help'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#ff4444',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#ff4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: '#888',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#0b0b0b',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeButtonActive: {
    borderColor: '#fff',
  },
  typeButtonEmergency: {
    backgroundColor: '#ff4444',
  },
  typeButtonAssistance: {
    backgroundColor: '#ff9500',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#333',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  confirmButton: {
    flex: 2,
  },
  confirmButtonEmergency: {
    backgroundColor: '#ff4444',
  },
  confirmButtonAssistance: {
    backgroundColor: '#ff9500',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
