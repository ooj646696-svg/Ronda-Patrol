/**
 * Test component for push notifications
 * Add this to any screen to test notification functionality
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { sendTestNotification } from '@/lib/notifications';

export default function NotificationsTest() {
  const handleTestNotification = async () => {
    try {
      await sendTestNotification();
      console.log('Test notification sent');
    } catch (error) {
      console.error('Failed to send test notification:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notification Test</Text>
      <TouchableOpacity 
        style={styles.button} 
        onPress={handleTestNotification}
      >
        <Text style={styles.buttonText}>Send Test Notification</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    margin: 10,
    borderWidth: 1,
    borderColor: '#2e7d32',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#fff',
  },
  button: {
    backgroundColor: '#2e7d32',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
