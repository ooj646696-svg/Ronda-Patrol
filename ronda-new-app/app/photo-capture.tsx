/**
 * Photo Capture Screen
 * Pre-shift and post-shift photo capture for vehicle inspection
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { useSession } from '../src/hooks/useSession';
import { useTheme } from '../src/theme/ThemeProvider';
import { photosApi } from '../src/api/photos';
import { cameraService } from '../src/services/camera';
import { PhotoData, ShotType, PhotoType } from '../src/types';

export default function PhotoCaptureScreen() {
  const { user } = useAuth();
  const { startSession, stopSession } = useSession();
  const { colors, theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const vehicleId = params.vehicleId ? parseInt(params.vehicleId as string) : undefined;
  const sessionId = params.sessionId ? parseInt(params.sessionId as string) : undefined;
  const mode = (params.mode as PhotoType) || 'pre_shift';
  
  const [requiredShots, setRequiredShots] = useState<ShotType[]>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<Record<ShotType, PhotoData | null>>({} as any);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [currentShot, setCurrentShot] = useState<ShotType | null>(null);

  const isPostShift = mode === 'post_shift';

  useEffect(() => {
    loadRequiredPhotos();
  }, [vehicleId]);

  const loadRequiredPhotos = async () => {
    if (!vehicleId) {
      console.error('No vehicleId provided');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      console.log('Loading photo requirements for vehicle:', vehicleId);
      const requirements = await photosApi.getRequiredPhotos(vehicleId);
      console.log('Photo requirements response:', requirements);
      setRequiredShots(requirements.required_shots);
    } catch (error: any) {
      console.error('Failed to load photo requirements:', error);
      console.error('Error details:', error?.response?.data || error?.message);
      // Fallback to default shots if API fails
      setRequiredShots(['front', 'rear', 'left_side', 'right_side', 'odometer', 'fuel_gauge']);
    } finally {
      setLoading(false);
    }
  };

  const handleTakePhoto = async (shotType: ShotType) => {
    try {
      setCurrentShot(shotType);
      
      // Request camera permissions
      const hasPermission = await cameraService.requestPermissions();
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
        setCurrentShot(null);
        return;
      }

      // Take photo using camera
      const photo = await cameraService.takePhoto();
      
      if (photo) {
        const photoData: PhotoData = {
          shotType,
          uri: photo.uri,
          capturedAt: new Date().toISOString(),
        };
        setCapturedPhotos({ ...capturedPhotos, [shotType]: photoData });
      }
    } catch (error) {
      console.error('Failed to take photo:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setCurrentShot(null);
    }
  };

  const handleComplete = async () => {
    if (!vehicleId) return;
    
    const photos = Object.values(capturedPhotos).filter(p => p !== null) as PhotoData[];
    
    if (photos.length < requiredShots.length) {
      Alert.alert('Photos Required', 'Please capture all required photos');
      return;
    }

    try {
      setUploading(true);
      await photosApi.uploadBatchPhotos(photos, vehicleId, mode);
      
      if (isPostShift) {
        // Post-shift: end the session
        if (sessionId) {
          await stopSession(sessionId);
        }
        Alert.alert('Shift Complete', 'Your shift has ended successfully.');
      } else {
        // Pre-shift: start a new session
        await startSession({ vehicle_id: vehicleId });
      }
      router.replace('/(tabs)' as any);
    } catch (error) {
      console.error('Failed to complete:', error);
      Alert.alert('Error', isPostShift ? 'Failed to end shift. Please try again.' : 'Failed to start session. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const completedCount = Object.values(capturedPhotos).filter(p => p !== null).length;
  const totalCount = requiredShots.length;
  const isComplete = completedCount === totalCount;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{isPostShift ? 'Post-Shift Photos' : 'Pre-Shift Photos'}</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { width: `${(completedCount / totalCount) * 100}%`, backgroundColor: colors.primary }]} />
        </View>
        <Text style={[styles.progressText, { color: colors.text }]}>{completedCount} / {totalCount} photos</Text>
      </View>

      {/* Photo List */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {requiredShots.map((shotType) => {
          const photo = capturedPhotos[shotType];
          const isCaptured = !!photo;
          
          return (
            <TouchableOpacity
              key={shotType}
              style={[
                styles.photoCard, 
                { backgroundColor: colors.card, borderColor: colors.border },
                isCaptured && [styles.photoCardCaptured, { borderColor: colors.primary }]
              ]}
              onPress={() => handleTakePhoto(shotType)}
            >
              {isCaptured ? (
                <View style={styles.capturedView}>
                  <Text style={[styles.checkIcon, { color: colors.primary }]}>✓</Text>
                  <Text style={[styles.photoLabel, { color: colors.text }]}>{formatShotType(shotType)}</Text>
                </View>
              ) : (
                <View style={styles.uncapturedView}>
                  <Text style={[styles.photoIcon, { color: colors.mutedText }]}>📷</Text>
                  <Text style={[styles.photoLabel, { color: colors.text }]}>{formatShotType(shotType)}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.button, 
            { backgroundColor: isComplete ? (isPostShift ? '#ff6b6b' : colors.primary) : colors.border },
            !isComplete && styles.buttonDisabled
          ]}
          onPress={handleComplete}
          disabled={!isComplete || uploading}
        >
          {uploading ? (
            <ActivityIndicator color={isComplete ? '#fff' : colors.mutedText} />
          ) : (
            <Text style={[styles.buttonText, { color: isComplete ? '#fff' : colors.mutedText }]}>
              {isPostShift ? 'End Shift' : 'Start Patrol'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function formatShotType(shotType: ShotType): string {
  const labels: Record<ShotType, string> = {
    front: 'Front View',
    rear: 'Rear View',
    left_side: 'Left Side',
    right_side: 'Right Side',
    odometer: 'Odometer',
    fuel_gauge: 'Fuel Gauge',
    interior: 'Interior',
    damage: 'Damage',
    tires: 'Tires',
    equipment: 'Equipment',
  };
  return labels[shotType] || shotType;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  progressContainer: {
    padding: 20,
    borderBottomWidth: 1,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    gap: 12,
  },
  photoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
  },
  photoCardCaptured: {
    // Visual styling for captured photo card
  },
  capturedView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  uncapturedView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  photoIcon: {
    fontSize: 24,
  },
  checkIcon: {
    fontSize: 24,
  },
  photoLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
