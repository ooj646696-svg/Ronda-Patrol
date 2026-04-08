/**
 * Photo Service for Vehicle Snapshots
 * Handles photo upload, validation, and management
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { api } from '@/lib/api';
import { databaseService, PhotoRecord } from './database';

// Keep AsyncStorage key for backward compatibility during migration
const QUEUE_KEY = '@ronda_photo_queue';

export interface PhotoData {
  shotType: string;
  uri: string;
  latitude?: number;
  longitude?: number;
  capturedAt: string;
  notes?: string;
}

export interface PhotoRequirement {
  required_shots: string[];
  optional_shots: string[];
}

export interface ShiftPhotoStatus {
  shift_id: number;
  required_photos: string[];
  completed_photos: string[];
  missing_photos: string[];
  is_complete: boolean;
  pre_shift_count: number;
  post_shift_count: number;
}

class PhotoService {
  private readonly QUEUE_KEY = '@ronda_photo_queue'; // Keep for migration

  /**
   * Get required photos for a vehicle
   */
  async getRequiredPhotos(vehicleId: number): Promise<{ required_shots: string[] }> {
    try {
      const response = await api.get(`/vehicle-photos/vehicle-photos/required/?vehicle_id=${vehicleId}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('📋 Using default photo requirements (endpoint not implemented)');
      } else {
        console.error('Error getting required photos:', error);
      }
      // Fallback to default shots if endpoint doesn't exist
      return {
        required_shots: [
          'front',
          'rear', 
          'left_side',
          'right_side',
          'odometer',
          'fuel_gauge'
        ]
      };
    }
  }

  /**
   * Upload a single photo
   */
  async uploadPhoto(
    vehicleId: number,
    photoType: 'pre_shift' | 'post_shift',
    photoData: PhotoData,
    shiftId?: number
  ): Promise<any> {
    try {
      // Create FormData for file upload
      const formData = new FormData();
      
      // Get file info and handle size properly
      const fileInfo = await FileSystem.getInfoAsync(photoData.uri);
      const fileSize = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;
      
      // Create a proper blob from the file URI
      const response = await fetch(photoData.uri);
      const blob = await response.blob();
      
      formData.append('image', blob, `vehicle_${vehicleId}_${photoData.shotType}_${Date.now()}.jpg`);
      formData.append('vehicle', vehicleId.toString());
      formData.append('photo_type', photoType);
      formData.append('shot_type', photoData.shotType);
      formData.append('captured_at', photoData.capturedAt);
      
      if (photoData.latitude) {
        formData.append('latitude', photoData.latitude.toString());
      }
      
      if (photoData.longitude) {
        formData.append('longitude', photoData.longitude.toString());
      }
      
      if (shiftId) {
        formData.append('shift', shiftId.toString());
      }
      
      if (photoData.notes) {
        formData.append('notes', photoData.notes);
      }

      const apiResponse = await api.post('/vehicle-photos/vehicle-photos/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return apiResponse.data;
    } catch (error) {
      console.error('Error uploading photo:', error);
      throw error;
    }
  }

  /**
   * Upload multiple photos in batch
   */
  async uploadBatchPhotos(
    photos: PhotoData[],
    vehicleId: number,
    photoType: 'pre_shift' | 'post_shift',
    shiftId?: number
  ): Promise<any> {
    try {
      console.log(`📸 Uploading ${photos.length} photos to backend...`);
      
      // Create FormData for multipart/form-data request
      const formData = new FormData();
      
      // Add basic submission data
      formData.append('vehicle_id', vehicleId.toString());
      formData.append('photo_type', photoType);
      formData.append('captured_at', new Date().toISOString());
      if (shiftId) {
        formData.append('shift_id', shiftId.toString());
      }
      
      // Add each photo
      photos.forEach((photo, index) => {
        // Create a unique key for each photo
        const photoKey = `photos[${index}]`;
        
        // Add photo file
        formData.append(`${photoKey}[image]`, {
          uri: photo.uri,
          type: 'image/jpeg',
          name: `photo_${photo.shotType}_${Date.now()}.jpg`,
        } as any);
        
        // Add photo metadata
        formData.append(`${photoKey}[shot_type]`, photo.shotType);
        if (photo.latitude) {
          formData.append(`${photoKey}[latitude]`, photo.latitude.toString());
        }
        if (photo.longitude) {
          formData.append(`${photoKey}[longitude]`, photo.longitude.toString());
        }
        if (photo.notes) {
          formData.append(`${photoKey}[notes]`, photo.notes);
        }
        formData.append(`${photoKey}[captured_at]`, photo.capturedAt);
      });
      
      // Make API request
      const response = await api.post('/vehicle-photos/submissions/batch_upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 seconds timeout for photo upload
      });
      
      console.log('✅ Photos uploaded successfully:', response.data);
      
      // Save to local history as backup
      await this.saveToHistory(photos, vehicleId, photoType, shiftId);
      
      return response.data;
      
    } catch (error: any) {
      console.error('❌ Error uploading batch photos:', error);
      
      // Simple error logging that will definitely show
      console.log('🔍 ERROR DETAILS:');
      console.log('Status:', error.response?.status);
      console.log('Status Text:', error.response?.statusText);
      console.log('Response Data:', error.response?.data);
      console.log('Error Message:', error.message);
      
      // Log detailed error info
      if (error.response) {
        console.error('❌ Backend Error Response:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        });
      }
      
      // Save to local history for retry later
      await this.saveToHistory(photos, vehicleId, photoType, shiftId);
      
      // Queue photos for later upload when endpoint is available
      await this.queuePhotosForUpload(vehicleId, photoType, photos, shiftId);
      
      throw error;
    }
  }

  /**
   * Check shift photo completion status
   */
  async getShiftPhotoStatus(shiftId: number): Promise<ShiftPhotoStatus> {
    try {
      const response = await api.get(`/vehicle-photos/vehicle-photos/shift_status/?shift_id=${shiftId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting shift photo status:', error);
      throw error;
    }
  }

  /**
   * Get photos for a specific shift
   */
  async getShiftPhotos(shiftId: number): Promise<any[]> {
    try {
      const response = await api.get(`/vehicle-photos/vehicle-photos/?shift_id=${shiftId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting shift photos:', error);
      return [];
    }
  }

  /**
   * Get current user's photo history (using existing endpoint)
   */
  async getUserPhotoHistory(page = 1, limit = 20): Promise<any> {
    try {
      // Use the existing photos endpoint with user filter
      const response = await api.get(`/vehicle-photos/vehicle-photos/?page=${page}&limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Error getting user photo history:', error);
      return { results: [], count: 0, next: null, previous: null };
    }
  }

  /**
   * Get photos for branch admins (using existing endpoint)
   */
  async getBranchPhotoHistory(page = 1, limit = 20): Promise<any> {
    try {
      // Use the existing photos endpoint - backend should filter by branch for admins
      const response = await api.get(`/vehicle-photos/vehicle-photos/?page=${page}&limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Error getting branch photo history:', error);
      return { results: [], count: 0, next: null, previous: null };
    }
  }

  /**
   * Get photos for a specific driver (using existing endpoint)
   */
  async getDriverPhotoHistory(driverId: number, page = 1, limit = 20): Promise<any> {
    try {
      // Use the existing photos endpoint with driver filter
      const response = await api.get(`/vehicle-photos/vehicle-photos/?driver_id=${driverId}&page=${page}&limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Error getting driver photo history:', error);
      return { results: [], count: 0, next: null, previous: null };
    }
  }

  /**
   * Queue photos for offline upload
   */
  async queuePhotosForUpload(
    vehicleId: number,
    photoType: 'pre_shift' | 'post_shift',
    photos: PhotoData[],
    shiftId?: number
  ): Promise<void> {
    try {
      const queue = await this.getPhotoQueue();
      
      const queueItem = {
        id: Date.now().toString(),
        vehicleId,
        photoType,
        photos,
        shiftId,
        timestamp: new Date().toISOString(),
      };
      
      queue.push(queueItem);
      await AsyncStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
      
      console.log(`📸 Queued ${photos.length} photos for offline upload`);
    } catch (error) {
      console.error('Error queuing photos:', error);
    }
  }

  /**
   * Get queued photos
   */
  async getPhotoQueue(): Promise<any[]> {
    try {
      const queue = await AsyncStorage.getItem(this.QUEUE_KEY);
      return queue ? JSON.parse(queue) : [];
    } catch (error) {
      console.error('Error getting photo queue:', error);
      return [];
    }
  }

  /**
   * Upload queued photos when online
   */
  async uploadQueuedPhotos(): Promise<{ uploaded: number; failed: number }> {
    try {
      const queue = await this.getPhotoQueue();
      let uploaded = 0;
      let failed = 0;
      const remainingQueue = [];

      for (const queueItem of queue) {
        try {
          await this.uploadBatchPhotos(
            queueItem.photos,
            queueItem.vehicleId,
            queueItem.photoType,
            queueItem.shiftId
          );
          uploaded++;
        } catch (error) {
          console.error('Failed to upload queued photos:', error);
          failed++;
          remainingQueue.push(queueItem);
        }
      }

      // Update queue with remaining items
      await AsyncStorage.setItem(this.QUEUE_KEY, JSON.stringify(remainingQueue));

      console.log(`📸 Upload complete: ${uploaded} uploaded, ${failed} failed`);
      return { uploaded, failed };
    } catch (error) {
      console.error('Error uploading queued photos:', error);
      return { uploaded: 0, failed: 0 };
    }
  }

  /**
   * Clear photo queue
   */
  async clearPhotoQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.QUEUE_KEY);
      console.log('📸 Photo queue cleared');
    } catch (error) {
      console.error('Error clearing photo queue:', error);
    }
  }

  /**
   * Get queued photos count
   */
  async getQueuedPhotosCount(): Promise<number> {
    try {
      const queue = await this.getPhotoQueue();
      return queue.length;
    } catch (error) {
      console.error('Error getting queued photos count:', error);
      return 0;
    }
  }

  /**
   * Validate photo before upload
   */
  validatePhoto(photoData: PhotoData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if URI exists
    if (!photoData.uri) {
      errors.push('Photo URI is required');
    }

    // Check shot type
    if (!photoData.shotType) {
      errors.push('Shot type is required');
    }

    // Check capture time
    if (!photoData.capturedAt) {
      errors.push('Capture time is required');
    }

    // Check if photo is recent (within last hour)
    const captureTime = new Date(photoData.capturedAt);
    const now = new Date();
    const diffInHours = (now.getTime() - captureTime.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours > 1) {
      errors.push('Photo was taken more than 1 hour ago');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Delete local photo files
   */
  async deleteLocalPhotos(photos: PhotoData[]): Promise<void> {
    try {
      for (const photo of photos) {
        try {
          await FileSystem.deleteAsync(photo.uri, { idempotent: true });
        } catch (error) {
          console.warn(`Failed to delete photo ${photo.uri}:`, error);
        }
      }
    } catch (error) {
      console.error('Error deleting local photos:', error);
    }
  }

  /**
   * Save photos to local history using SQLite as a group
   */
  async saveToHistory(
    photos: PhotoData[],
    vehicleId: number,
    photoType: 'pre_shift' | 'post_shift',
    shiftId?: number
  ): Promise<void> {
    try {
      console.log(`📸 Saving ${photos.length} photos as a group to SQLite database...`);
      
      // Create a photo group first
      const groupId = await databaseService.createPhotoGroup({
        vehicle_id: vehicleId,
        photo_type: photoType,
        shift_id: shiftId,
        submitted_at: new Date().toISOString(),
        photo_count: photos.length,
        uploaded: false,
        created_at: new Date().toISOString()
      });
      
      // Save each photo with the group ID
      for (const photo of photos) {
        const photoRecord: Omit<PhotoRecord, 'id'> = {
          image: photo.uri,
          shot_type: photo.shotType,
          photo_type: photoType,
          captured_at: photo.capturedAt,
          latitude: photo.latitude,
          longitude: photo.longitude,
          notes: photo.notes,
          vehicle_id: vehicleId,
          shift_id: shiftId,
          uploaded: false,
          created_at: new Date().toISOString(),
          group_id: groupId
        };
        
        await databaseService.insertPhoto(photoRecord);
      }
      
      console.log(`📸 Successfully saved photo group ${groupId} with ${photos.length} photos to SQLite database`);
    } catch (error) {
      console.error('❌ Error saving photo group to SQLite database:', error);
      throw error;
    }
  }

  /**
   * Get local photo history groups from SQLite
   */
  async getLocalPhotoHistory(): Promise<any[]> {
    try {
      const groups = await databaseService.getPhotoGroups();
      console.log(`📸 Retrieved ${groups.length} photo groups from SQLite database`);
      return groups;
    } catch (error) {
      console.error('❌ Error getting local photo groups from SQLite:', error);
      return [];
    }
  }

  /**
   * Get photos for a specific group
   */
  async getPhotosByGroup(groupId: number): Promise<any[]> {
    try {
      const photos = await databaseService.getPhotosByGroup(groupId);
      console.log(`📸 Retrieved ${photos.length} photos for group ${groupId}`);
      return photos;
    } catch (error) {
      console.error('❌ Error getting photos for group:', error);
      return [];
    }
  }

  /**
   * Clear local photo history from SQLite
   */
  async clearLocalPhotoHistory(): Promise<void> {
    try {
      await databaseService.clearAllData();
      console.log('📸 SQLite photo history cleared');
    } catch (error) {
      console.error('❌ Error clearing SQLite photo history:', error);
    }
  }
}

export const photoService = new PhotoService();
