/**
 * Camera Service
 * Handles photo capture and camera permissions
 */
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export interface PhotoResult {
  uri: string;
  width: number;
  height: number;
  type: 'image';
}

export class CameraService {
  /**
   * Request camera permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        console.error('Camera permission denied');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      return false;
    }
  }

  /**
   * Pick photo from gallery
   */
  async pickFromGallery(): Promise<PhotoResult | null> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (result.canceled) {
        return null;
      }

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        return {
          uri: asset.uri,
          width: asset.width || 0,
          height: asset.height || 0,
          type: 'image',
        };
      }

      return null;
    } catch (error) {
      console.error('Error picking from gallery:', error);
      return null;
    }
  }

  /**
   * Take photo with camera
   */
  async takePhoto(): Promise<PhotoResult | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (result.canceled) {
        return null;
      }

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        return {
          uri: asset.uri,
          width: asset.width || 0,
          height: asset.height || 0,
          type: 'image',
        };
      }

      return null;
    } catch (error) {
      console.error('Error taking photo:', error);
      return null;
    }
  }
}

export const cameraService = new CameraService();
