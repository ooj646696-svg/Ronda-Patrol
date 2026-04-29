/**
 * Photos API
 * Handles vehicle photo endpoints
 */
import { apiClient } from './client';
import { PhotoData, PhotoRequirement, PhotoUploadResponse, PhotoType } from '../types';

export const photosApi = {
  /**
   * Get required photo shots for a vehicle
   */
  async getRequiredPhotos(vehicleId: number): Promise<PhotoRequirement> {
    try {
      const response = await apiClient.get<PhotoRequirement>(
        `/vehicle-photos/photos/required/?vehicle_id=${vehicleId}`
      );
      return response.data;
    } catch (error) {
      // Fallback to default requirements if endpoint doesn't exist
      console.log('Using default photo requirements');
      return {
        required_shots: ['front', 'rear', 'left_side', 'right_side', 'odometer', 'fuel_gauge'],
        optional_shots: ['interior'],
      };
    }
  },

  /**
   * Upload a single photo
   */
  async uploadPhoto(
    vehicleId: number,
    photoType: PhotoType,
    photoData: PhotoData,
    shiftId?: number
  ): Promise<PhotoUploadResponse> {
    const formData = new FormData();
    
    // Get file info
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

    const apiResponse = await apiClient.post<PhotoUploadResponse>('/vehicle-photos/photos/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return apiResponse.data;
  },

  /**
   * Upload multiple photos in batch
   */
  async uploadBatchPhotos(
    photos: PhotoData[],
    vehicleId: number,
    photoType: PhotoType,
    shiftId?: number
  ): Promise<any> {
    const formData = new FormData();
    
    formData.append('vehicle_id', vehicleId.toString());
    formData.append('photo_type', photoType);
    formData.append('captured_at', new Date().toISOString());
    if (shiftId) {
      formData.append('shift_id', shiftId.toString());
    }
    
    photos.forEach((photo, index) => {
      const photoKey = `photos[${index}]`;
      
      formData.append(`${photoKey}[image]`, {
        uri: photo.uri,
        type: 'image/jpeg',
        name: `photo_${photo.shotType}_${Date.now()}.jpg`,
      } as any);
      
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
    
    const response = await apiClient.post('/vehicle-photos/submissions/batch_upload/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000,
    });
    
    return response.data;
  },
};
