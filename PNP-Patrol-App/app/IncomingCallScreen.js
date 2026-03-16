import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const IncomingCallScreen = ({ route, navigation }) => {
  const { call } = route.params;
  const [isRinging, setIsRinging] = useState(true);

  useEffect(() => {
    // Simulate ringing animation
    const ringInterval = setInterval(() => {
      setIsRinging(prev => !prev);
    }, 1000);

    return () => clearInterval(ringInterval);
  }, []);

  const handleAccept = async () => {
    try {
      await axios.post(`http://192.168.1.25:8000/api/video-calls/${call.id}/accept/`);
      
      // Navigate to video call screen
      navigation.replace('VideoCall', { call: { ...call, status: 'ACTIVE' } });
    } catch (error) {
      console.error('Error accepting call:', error);
      Alert.alert('Error', 'Failed to accept call');
    }
  };

  const handleReject = async () => {
    try {
      await axios.post(`http://192.168.1.25:8000/api/video-calls/${call.id}/reject/`);
      navigation.goBack();
    } catch (error) {
      console.error('Error rejecting call:', error);
      Alert.alert('Error', 'Failed to reject call');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.callCard}>
        {/* Caller Info */}
        <View style={styles.callerInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          <Text style={styles.callTitle}>Incoming Video Call</Text>
          <Text style={styles.callerName}>{call.initiator_name}</Text>
          <Text style={styles.callerInfo}>
            {call.session_info ? `From ${call.session_info.branch_name}` : 'Admin calling'}
          </Text>
          {isRinging && (
            <Text style={styles.ringingText}>
              🔔 Ringing...
            </Text>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.button, styles.rejectButton]} 
            onPress={handleReject}
          >
            <Text style={[styles.buttonText, styles.rejectButtonText]}>
              📞 Decline
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.acceptButton]} 
            onPress={handleAccept}
          >
            <Text style={[styles.buttonText, styles.acceptButtonText]}>
              📹 Accept
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 30,
    width: '90%',
    maxWidth: 350,
    alignItems: 'center',
  },
  callerInfo: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    fontSize: 32,
  },
  callTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  callerName: {
    fontSize: 18,
    color: '#666',
    marginBottom: 5,
  },
  callerInfo: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  ringingText: {
    color: '#28a745',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    width: '100%',
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 120,
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#dc3545',
  },
  acceptButton: {
    backgroundColor: '#28a745',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  rejectButtonText: {
    color: 'white',
  },
  acceptButtonText: {
    color: 'white',
  },
});

export default IncomingCallScreen;
