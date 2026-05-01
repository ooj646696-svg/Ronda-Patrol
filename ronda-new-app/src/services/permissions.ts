/**
 * Permissions Service
 * Handles upfront permission requests for camera, location, and media library
 */
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export interface PermissionStatus {
  location: boolean;
  backgroundLocation: boolean;
  camera: boolean;
  mediaLibrary: boolean;
}

export class PermissionsService {
  /**
   * Request foreground location permissions
   */
  static async requestLocationPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('📍 Location permission:', status);
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  /**
   * Request background location permissions
   */
  static async requestBackgroundLocationPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      console.log('📍 Background location permission:', status);
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting background location permissions:', error);
      return false;
    }
  }

  /**
   * Request camera permissions
   */
  static async requestCameraPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      console.log('📷 Camera permission:', status);
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      return false;
    }
  }

  /**
   * Request media library permissions
   */
  static async requestMediaLibraryPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('🖼️ Media library permission:', status);
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting media library permissions:', error);
      return false;
    }
  }

  /**
   * Request all app permissions upfront after login
   * Requests critical permissions (location, camera) and optional ones
   */
  static async requestAllPermissions(): Promise<PermissionStatus> {
    console.log('🔐 Requesting app permissions...');

    const [location, camera, mediaLibrary] = await Promise.all([
      this.requestLocationPermissions(),
      this.requestCameraPermissions(),
      this.requestMediaLibraryPermissions(),
    ]);

    // Request background location after foreground is granted
    let backgroundLocation = false;
    if (location) {
      backgroundLocation = await this.requestBackgroundLocationPermissions();
    }

    const permissions: PermissionStatus = {
      location,
      backgroundLocation,
      camera,
      mediaLibrary,
    };

    console.log(' Permission Status:', permissions);
    
    // Warn if critical permissions were denied
    if (!location) {
      Alert.alert(
        'Location Permission Required',
        'GPS location is essential for patrol tracking. Please enable location access in app settings.',
        [{ text: 'OK' }]
      );
    }

    return permissions;
  }

  /**
   * Check if all critical permissions are granted
   */
  static async checkCriticalPermissions(): Promise<boolean> {
    try {
      const locationStatus = await Location.getForegroundPermissionsAsync();
      const cameraStatus = await ImagePicker.getCameraPermissionsAsync();
      
      return locationStatus.status === 'granted' && cameraStatus.status === 'granted';
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }
}
