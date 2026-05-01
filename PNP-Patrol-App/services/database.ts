/**
 * SQLite Database Service for RONDA App
 * Handles local storage of photos, sessions, and app data
 * 
 * Note: Using AsyncStorage fallback for Expo Go compatibility
 * For production builds, replace with actual SQLite implementation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Fallback implementation using AsyncStorage for Expo Go compatibility
const DB_PHOTOS_KEY = '@ronda_db_photos';
const DB_PHOTO_GROUPS_KEY = '@ronda_db_photo_groups';
const DB_QUEUED_PHOTOS_KEY = '@ronda_db_queued_photos';

export interface PhotoRecord {
  id?: number;
  image: string;
  shot_type: string;
  photo_type: 'pre_shift' | 'post_shift';
  captured_at: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  vehicle_id: number;
  shift_id?: number;
  uploaded: boolean;
  created_at: string;
  group_id?: number; // Link to photo group
}

export interface PhotoGroup {
  id?: number;
  vehicle_id: number;
  photo_type: 'pre_shift' | 'post_shift';
  shift_id?: number;
  submitted_at: string;
  photo_count: number;
  uploaded: boolean;
  created_at: string;
}

export interface QueuedPhoto {
  id?: number;
  vehicle_id: number;
  photo_type: 'pre_shift' | 'post_shift';
  photos_data: string; // JSON string of photos array
  shift_id?: number;
  created_at: string;
}

class DatabaseService {
  private dbName = 'ronda.db';
  private nextId = 1;

  async init(): Promise<void> {
    try {
      console.log('🗄️ Initializing AsyncStorage database fallback...');
      
      // Initialize with empty arrays if keys don't exist
      const photos = await AsyncStorage.getItem(DB_PHOTOS_KEY);
      const groups = await AsyncStorage.getItem(DB_PHOTO_GROUPS_KEY);
      const queued = await AsyncStorage.getItem(DB_QUEUED_PHOTOS_KEY);
      
      if (!photos) await AsyncStorage.setItem(DB_PHOTOS_KEY, JSON.stringify([]));
      if (!groups) await AsyncStorage.setItem(DB_PHOTO_GROUPS_KEY, JSON.stringify([]));
      if (!queued) await AsyncStorage.setItem(DB_QUEUED_PHOTOS_KEY, JSON.stringify([]));
      
      // Get next ID for auto-increment
      const existingPhotos = photos ? JSON.parse(photos) : [];
      const existingGroups = groups ? JSON.parse(groups) : [];
      const existingQueued = queued ? JSON.parse(queued) : [];
      
      const maxPhotoId = Math.max(0, ...existingPhotos.map((p: any) => p.id || 0));
      const maxGroupId = Math.max(0, ...existingGroups.map((g: any) => g.id || 0));
      const maxQueuedId = Math.max(0, ...existingQueued.map((q: any) => q.id || 0));
      
      this.nextId = Math.max(maxPhotoId, maxGroupId, maxQueuedId) + 1;
      
      console.log(' AsyncStorage database fallback initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  private getNextId(): number {
    return this.nextId++;
  }

  // PHOTOS OPERATIONS
  async insertPhoto(photo: Omit<PhotoRecord, 'id'>): Promise<number> {
    try {
      const photos = await this.getPhotosFromStorage();
      const newPhoto = { ...photo, id: this.getNextId() };
      photos.push(newPhoto);
      await AsyncStorage.setItem(DB_PHOTOS_KEY, JSON.stringify(photos));
      
      console.log('📸 Photo saved to database:', newPhoto.id);
      return newPhoto.id;
    } catch (error) {
      console.error('❌ Failed to insert photo:', error);
      throw error;
    }
  }

  private async getPhotosFromStorage(): Promise<PhotoRecord[]> {
    try {
      const photos = await AsyncStorage.getItem(DB_PHOTOS_KEY);
      return photos ? JSON.parse(photos) : [];
    } catch (error) {
      console.error('❌ Failed to get photos:', error);
      return [];
    }
  }

  async getPhotos(limit = 50, offset = 0): Promise<PhotoRecord[]> {
    try {
      const photos = await this.getPhotosFromStorage();
      const sortedPhotos = photos.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return sortedPhotos.slice(offset, offset + limit);
    } catch (error) {
      console.error('❌ Failed to get photos:', error);
      return [];
    }
  }

  async getPhotosByVehicle(vehicleId: number): Promise<PhotoRecord[]> {
    try {
      const photos = await this.getPhotosFromStorage();
      return photos
        .filter(photo => photo.vehicle_id === vehicleId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } catch (error) {
      console.error('❌ Failed to get photos by vehicle:', error);
      return [];
    }
  }

  async updatePhotoUploadStatus(photoId: number, uploaded: boolean): Promise<void> {
    try {
      const photos = await this.getPhotosFromStorage();
      const photoIndex = photos.findIndex(p => p.id === photoId);
      
      if (photoIndex !== -1) {
        photos[photoIndex].uploaded = uploaded;
        await AsyncStorage.setItem(DB_PHOTOS_KEY, JSON.stringify(photos));
        console.log('📸 Photo upload status updated:', photoId, uploaded);
      }
    } catch (error) {
      console.error('❌ Failed to update photo upload status:', error);
      throw error;
    }
  }

  async deletePhoto(photoId: number): Promise<void> {
    try {
      const photos = await this.getPhotosFromStorage();
      const filteredPhotos = photos.filter(p => p.id !== photoId);
      await AsyncStorage.setItem(DB_PHOTOS_KEY, JSON.stringify(filteredPhotos));
      console.log('📸 Photo deleted from database:', photoId);
    } catch (error) {
      console.error('❌ Failed to delete photo:', error);
      throw error;
    }
  }

  async getPhotoCount(): Promise<number> {
    try {
      const photos = await this.getPhotosFromStorage();
      return photos.length;
    } catch (error) {
      console.error('❌ Failed to get photo count:', error);
      return 0;
    }
  }

  // PHOTO GROUPS OPERATIONS
  async createPhotoGroup(group: Omit<PhotoGroup, 'id'>): Promise<number> {
    try {
      const groups = await this.getPhotoGroupsFromStorage();
      const newGroup = { ...group, id: this.getNextId() };
      groups.push(newGroup);
      await AsyncStorage.setItem(DB_PHOTO_GROUPS_KEY, JSON.stringify(groups));
      
      console.log('📸 Photo group created:', newGroup.id);
      return newGroup.id;
    } catch (error) {
      console.error('❌ Failed to create photo group:', error);
      throw error;
    }
  }

  private async getPhotoGroupsFromStorage(): Promise<PhotoGroup[]> {
    try {
      const groups = await AsyncStorage.getItem(DB_PHOTO_GROUPS_KEY);
      return groups ? JSON.parse(groups) : [];
    } catch (error) {
      console.error('❌ Failed to get photo groups:', error);
      return [];
    }
  }

  async getPhotoGroups(limit = 50, offset = 0): Promise<PhotoGroup[]> {
    try {
      const groups = await this.getPhotoGroupsFromStorage();
      const sortedGroups = groups.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return sortedGroups.slice(offset, offset + limit);
    } catch (error) {
      console.error('❌ Failed to get photo groups:', error);
      return [];
    }
  }

  async getPhotosByGroup(groupId: number): Promise<PhotoRecord[]> {
    try {
      const photos = await this.getPhotosFromStorage();
      return photos
        .filter(photo => photo.group_id === groupId)
        .sort((a, b) => a.shot_type.localeCompare(b.shot_type));
    } catch (error) {
      console.error('❌ Failed to get photos by group:', error);
      return [];
    }
  }

  async updateGroupUploadStatus(groupId: number, uploaded: boolean): Promise<void> {
    try {
      // Update group status
      const groups = await this.getPhotoGroupsFromStorage();
      const groupIndex = groups.findIndex(g => g.id === groupId);
      
      if (groupIndex !== -1) {
        groups[groupIndex].uploaded = uploaded;
        await AsyncStorage.setItem(DB_PHOTO_GROUPS_KEY, JSON.stringify(groups));
      }
      
      // Update all photos in the group
      const photos = await this.getPhotosFromStorage();
      photos.forEach(photo => {
        if (photo.group_id === groupId) {
          photo.uploaded = uploaded;
        }
      });
      await AsyncStorage.setItem(DB_PHOTOS_KEY, JSON.stringify(photos));
      
      console.log('📸 Group upload status updated:', groupId, uploaded);
    } catch (error) {
      console.error('❌ Failed to update group upload status:', error);
      throw error;
    }
  }

  // QUEUED PHOTOS OPERATIONS
  async insertQueuedPhotos(queuedPhoto: Omit<QueuedPhoto, 'id'>): Promise<number> {
    try {
      const queued = await this.getQueuedPhotosFromStorage();
      const newQueued = { ...queuedPhoto, id: this.getNextId() };
      queued.push(newQueued);
      await AsyncStorage.setItem(DB_QUEUED_PHOTOS_KEY, JSON.stringify(queued));
      
      console.log('📸 Queued photos saved to database:', newQueued.id);
      return newQueued.id;
    } catch (error) {
      console.error('❌ Failed to insert queued photos:', error);
      throw error;
    }
  }

  private async getQueuedPhotosFromStorage(): Promise<QueuedPhoto[]> {
    try {
      const queued = await AsyncStorage.getItem(DB_QUEUED_PHOTOS_KEY);
      return queued ? JSON.parse(queued) : [];
    } catch (error) {
      console.error('❌ Failed to get queued photos:', error);
      return [];
    }
  }

  async getQueuedPhotos(): Promise<QueuedPhoto[]> {
    try {
      const queued = await this.getQueuedPhotosFromStorage();
      return queued.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } catch (error) {
      console.error('❌ Failed to get queued photos:', error);
      return [];
    }
  }

  async deleteQueuedPhoto(queueId: number): Promise<void> {
    try {
      const queued = await this.getQueuedPhotosFromStorage();
      const filteredQueued = queued.filter(q => q.id !== queueId);
      await AsyncStorage.setItem(DB_QUEUED_PHOTOS_KEY, JSON.stringify(filteredQueued));
      console.log('📸 Queued photo deleted from database:', queueId);
    } catch (error) {
      console.error('❌ Failed to delete queued photo:', error);
      throw error;
    }
  }

  // UTILITY OPERATIONS
  async getDatabaseStats(): Promise<{
    photosCount: number;
    queuedPhotosCount: number;
    uploadedPhotosCount: number;
    pendingPhotosCount: number;
  }> {
    try {
      const photos = await this.getPhotosFromStorage();
      const queued = await this.getQueuedPhotosFromStorage();
      const uploadedPhotosCount = photos.filter(p => p.uploaded).length;
      const pendingPhotosCount = photos.length - uploadedPhotosCount;

      return {
        photosCount: photos.length,
        queuedPhotosCount: queued.length,
        uploadedPhotosCount,
        pendingPhotosCount
      };
    } catch (error) {
      console.error('❌ Failed to get database stats:', error);
      return {
        photosCount: 0,
        queuedPhotosCount: 0,
        uploadedPhotosCount: 0,
        pendingPhotosCount: 0
      };
    }
  }

  async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        DB_PHOTOS_KEY,
        DB_PHOTO_GROUPS_KEY,
        DB_QUEUED_PHOTOS_KEY
      ]);
      console.log('🗄️ All database data cleared');
    } catch (error) {
      console.error('❌ Failed to clear database:', error);
      throw error;
    }
  }

  async closeDatabase(): Promise<void> {
    console.log('🗄️ Database connection closed (AsyncStorage fallback)');
  }
}

export const databaseService = new DatabaseService();
