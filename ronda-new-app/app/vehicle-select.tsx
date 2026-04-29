/**
 * Vehicle Selection Screen
 * Select vehicle before starting patrol session
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { vehiclesApi } from '../src/api/vehicles';

export default function VehicleSelectScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    try {
      setLoading(true);
      console.log('User info:', user);
      console.log('User branchId:', user?.branchId);
      
      // Temporarily load all vehicles for testing
      const response = await vehiclesApi.list(undefined);
      console.log('Vehicles response:', response);
      
      // Handle both array and paginated response
      const vehicles = Array.isArray(response) ? response : (response.results || []);
      setVehicles(vehicles);
    } catch (error: any) {
      console.error('Failed to load vehicles:', error);
      console.error('Error details:', error?.response?.data || error?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (selectedVehicle) {
      router.push({
        pathname: '/photo-capture' as any,
        params: { vehicleId: selectedVehicle.id.toString() },
      } as any);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#0b0b0b" />
        <ActivityIndicator size="large" color="#2d8c4c" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0b0b" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Select Vehicle</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Vehicle List */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {vehicles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {user?.branchId == null ? 'No Branch Assigned' : 'No Vehicles Available'}
            </Text>
            <Text style={styles.emptyText}>
              {user?.branchId == null
                ? 'Please contact your administrator to assign you to a branch.'
                : 'There are no vehicles registered for your branch. Please contact your administrator.'}
            </Text>
          </View>
        ) : (
          vehicles.map((vehicle) => (
            <TouchableOpacity
              key={vehicle.id}
              style={[
                styles.vehicleCard,
                selectedVehicle?.id === vehicle.id && styles.selectedCard,
              ]}
              onPress={() => setSelectedVehicle(vehicle)}
            >
              <View style={styles.vehicleInfo}>
                <Text style={styles.plateNumber}>{vehicle.plate_number}</Text>
                <Text style={styles.vehicleName}>{vehicle.name || 'Unassigned'}</Text>
              </View>
              <View style={[
                styles.checkmark,
                selectedVehicle?.id === vehicle.id && styles.checkmarkSelected
              ]}>
                {selectedVehicle?.id === vehicle.id && <Text style={styles.checkmarkText}>✓</Text>}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, !selectedVehicle && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!selectedVehicle}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
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
    color: '#2d8c4c',
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    gap: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  vehicleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCard: {
    borderColor: '#2d8c4c',
    backgroundColor: '#1a2a1a',
  },
  vehicleInfo: {
    flex: 1,
  },
  plateNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  vehicleName: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkSelected: {
    backgroundColor: '#2d8c4c',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  button: {
    backgroundColor: '#2d8c4c',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
