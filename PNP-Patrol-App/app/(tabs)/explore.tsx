import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { photoService } from '@/services/photoService';
import { useAuth } from '@/lib/auth-context';

export default function PhotoHistoryScreen() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [groupPhotos, setGroupPhotos] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'user' | 'branch'>('user');

  useEffect(() => {
    loadPhotos();
  }, [viewMode]);

  // Reset to groups view when navigating back to this tab
  useFocusEffect(
    React.useCallback(() => {
      console.log('📸 History tab focused - resetting to groups view');
      setSelectedGroup(null);
      setGroupPhotos([]);
      return () => {};
    }, [])
  );

  const loadPhotos = async (pageNum = 1, refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
        setPage(1);
        setHasMore(true);
      } else if (pageNum > 1) {
        setLoading(true);
      }

      // Load local photo history
      console.log('📸 Loading local photo history...');
      const localPhotos = await photoService.getLocalPhotoHistory();
      
      // Sort by date (newest first)
      const sortedPhotos = localPhotos.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      setPhotos(sortedPhotos);
      setHasMore(false);
      console.log(`📸 Loaded ${sortedPhotos.length} photos from local history`);
      
      // TODO: When backend endpoints are ready, switch to API calls
      // const response = viewMode === 'user' 
      //   ? await photoService.getUserPhotoHistory(pageNum, 20)
      //   : await photoService.getBranchPhotoHistory(pageNum, 20);
      // const newPhotos = response.results || [];
      
      // if (refresh || pageNum === 1) {
      //   setPhotos(newPhotos);
      // } else {
      //   setPhotos(prev => [...prev, ...newPhotos]);
      // }
      // setHasMore(response.next !== null);
      // setPage(pageNum);
    } catch (error) {
      console.error('Error loading photos:', error);
      Alert.alert('Error', 'Failed to load photos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadPhotos(1, true);
  };

  const handleGroupClick = async (group: any) => {
    try {
      console.log('📸 Loading photos for group:', group.id);
      setSelectedGroup(group);
      const photos = await photoService.getPhotosByGroup(group.id);
      setGroupPhotos(photos);
    } catch (error) {
      console.error('Error loading group photos:', error);
      Alert.alert('Error', 'Failed to load photos');
    }
  };

  const handleBackToGroups = () => {
    console.log('🔙 Back button pressed - returning to groups list');
    setSelectedGroup(null);
    setGroupPhotos([]);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      loadPhotos(page + 1);
    }
  };

  const renderPhotoItem = ({ item }: { item: any }) => (
    <View style={styles.photoItem}>
      <Image source={{ uri: item.image }} style={styles.photoThumbnail} />
      <View style={styles.photoInfo}>
        <Text style={styles.photoTitle}>{item.shot_type?.replace('_', ' ').toUpperCase()}</Text>
        <Text style={styles.photoDate}>
          {new Date(item.captured_at).toLocaleDateString()} {new Date(item.captured_at).toLocaleTimeString()}
        </Text>
        <Text style={styles.photoVehicle}>Vehicle ID: {item.vehicle_id || 'Unknown'}</Text>
        <Text style={styles.photoType}>
          {item.photo_type === 'pre_shift' ? 'Pre-Shift' : 'Post-Shift'}
        </Text>
        {item.uploaded === false && (
          <Text style={styles.uploadStatus}>📤 Queued for upload</Text>
        )}
        {item.uploaded === true && (
          <Text style={styles.uploadStatusUploaded}>✅ Uploaded</Text>
        )}
        {item.latitude && item.longitude && (
          <Text style={styles.location}>
            📍 {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
          </Text>
        )}
      </View>
    </View>
  );

  const renderGroupItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.groupItem} 
      onPress={() => handleGroupClick(item)}
    >
      <View style={styles.groupHeader}>
        <Ionicons name="images" size={24} color="#1e3a5f" />
        <View style={styles.groupInfo}>
          <Text style={styles.groupTitle}>
            {item.photo_type === 'pre_shift' ? 'Pre-Shift' : 'Post-Shift'} Photos
          </Text>
          <Text style={styles.groupDate}>
            {new Date(item.submitted_at).toLocaleDateString()} {new Date(item.submitted_at).toLocaleTimeString()}
          </Text>
          <Text style={styles.groupCount}>{item.photo_count} photos</Text>
          <Text style={styles.photoVehicle}>Vehicle ID: {item.vehicle_id}</Text>
          {item.uploaded === false && (
            <Text style={styles.uploadStatus}>📤 Queued for upload</Text>
          )}
          {item.uploaded === true && (
            <Text style={styles.uploadStatusUploaded}>✅ Uploaded</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {selectedGroup ? (
          <View style={styles.groupHeaderNav}>
            <TouchableOpacity 
              onPress={handleBackToGroups} 
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Photo Group Details</Text>
            <View style={styles.placeholder} />
          </View>
        ) : (
          <>
            <Text style={styles.title}>Photo History</Text>
            {user?.role === 'branch_admin' && (
              <View style={styles.viewToggle}>
                <TouchableOpacity
                  style={[styles.toggleButton, viewMode === 'user' && styles.toggleButtonActive]}
                  onPress={() => setViewMode('user')}
                >
                  <Text style={[styles.toggleText, viewMode === 'user' && styles.toggleTextActive]}>My Photos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, viewMode === 'branch' && styles.toggleButtonActive]}
                  onPress={() => setViewMode('branch')}
                >
                  <Text style={[styles.toggleText, viewMode === 'branch' && styles.toggleTextActive]}>Branch</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>

      {/* Content */}
      {selectedGroup ? (
        // Show individual photos in the selected group
        <FlatList
          data={groupPhotos}
          renderItem={renderPhotoItem}
          keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
          contentContainerStyle={styles.photoList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="image-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No Photos Found</Text>
              <Text style={styles.emptySubtext}>This group has no photos</Text>
            </View>
          }
        />
      ) : (
        // Show photo groups
        <FlatList
          data={photos}
          renderItem={renderGroupItem}
          keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
          contentContainerStyle={styles.photoList}
          showsVerticalScrollIndicator={false}
          onRefresh={onRefresh}
          refreshing={refreshing}
          onEndReached={loadMore}
          onEndReachedThreshold={0.1}
          ListFooterComponent={
            loading ? <ActivityIndicator style={styles.loader} /> : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No Photos Yet</Text>
              <Text style={styles.emptySubtext}>Take photos in a session to see them here</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#007AFF',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
  },
  list: {
    padding: 16,
  },
  photoItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  photoInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  photoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  photoDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  photoVehicle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  photoType: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
    marginBottom: 2,
  },
  driverName: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  loader: {
    padding: 20,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  uploadStatus: {
    fontSize: 11,
    color: '#ff9800',
    marginTop: 4,
    fontWeight: '600',
  },
  uploadStatusUploaded: {
    fontSize: 11,
    color: '#4caf50',
    marginTop: 4,
    fontWeight: '600',
  },
  location: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    fontStyle: 'italic',
  },
  // Group styles
  groupItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  groupHeaderNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupInfo: {
    flex: 1,
    marginLeft: 12,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  groupDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  groupCount: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    marginBottom: 2,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginLeft: -8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  placeholder: {
    width: 40,
  },
  photoList: {
    padding: 16,
  },
});
