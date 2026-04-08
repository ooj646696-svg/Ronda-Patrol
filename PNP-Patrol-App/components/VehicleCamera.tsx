import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  Image as RNImage,
} from 'react-native';
import { Camera, CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface VehicleCameraProps {
  vehicleId: number;
  shiftId?: number;
  photoType: 'pre_shift' | 'post_shift';
  requiredShots: string[];
  onPhotosComplete: (photos: PhotoData[]) => void;
  onClose: () => void;
}

interface PhotoData {
  shotType: string;
  uri: string;
  latitude?: number;
  longitude?: number;
  capturedAt: string;
  notes?: string;
}

interface ShotGuide {
  type: string;
  title: string;
  description: string;
  overlayGuide?: 'rectangle' | 'circle' | 'grid';
}

const SHOT_GUIDES: Record<string, ShotGuide> = {
  front: {
    type: 'front',
    title: 'Front View',
    description: 'Stand 10 feet in front of vehicle. Include entire front bumper and grill.',
    overlayGuide: 'rectangle',
  },
  rear: {
    type: 'rear',
    title: 'Rear View',
    description: 'Stand 10 feet behind vehicle. Include entire rear bumper and trunk.',
    overlayGuide: 'rectangle',
  },
  left_side: {
    type: 'left_side',
    title: 'Left Side',
    description: 'Stand at middle of left side. Include front to rear in one shot.',
    overlayGuide: 'rectangle',
  },
  right_side: {
    type: 'right_side',
    title: 'Right Side',
    description: 'Stand at middle of right side. Include front to rear in one shot.',
    overlayGuide: 'rectangle',
  },
  odometer: {
    type: 'odometer',
    title: 'Odometer',
    description: 'Get close-up of odometer. Make sure numbers are clearly visible.',
    overlayGuide: 'circle',
  },
  fuel_gauge: {
    type: 'fuel_gauge',
    title: 'Fuel Gauge',
    description: 'Clear shot of fuel gauge showing current fuel level.',
    overlayGuide: 'circle',
  },
  interior: {
    type: 'interior',
    title: 'Interior',
    description: 'Shot from driver seat looking forward. Include dashboard and controls.',
    overlayGuide: 'grid',
  },
  damage: {
    type: 'damage',
    title: 'Damage',
    description: 'Close-up of any damage. Include reference object for scale.',
    overlayGuide: 'circle',
 },
};

export const VehicleCamera: React.FC<VehicleCameraProps> = ({
  vehicleId,
  shiftId,
  photoType,
  requiredShots,
  onPhotosComplete,
  onClose,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState<PhotoData[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const currentShot = requiredShots[currentShotIndex];
  const shotGuide = SHOT_GUIDES[currentShot];

  useEffect(() => {
    getLocation();
    console.log('📸 Camera permission status:', permission);
  }, [permission]);

  const onCameraReady = () => {
    console.log('📸 Camera is ready!');
    setCameraReady(true);
  };

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Location Error', 'Unable to get GPS location. Photos will not have location data.');
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current) {
      console.error('Camera ref is null');
      return;
    }
    
    setIsCapturing(true);
    try {
      console.log('📸 Taking picture for shot:', currentShot);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      const photoData: PhotoData = {
        shotType: currentShot,
        uri: photo.uri,
        latitude: location?.coords.latitude,
        longitude: location?.coords.longitude,
        capturedAt: new Date().toISOString(),
      };

      const updatedPhotos = [...capturedPhotos, photoData];
      setCapturedPhotos(updatedPhotos);

      // Move to next shot or show review
      if (currentShotIndex < requiredShots.length - 1) {
        setCurrentShotIndex(currentShotIndex + 1);
      } else {
        setShowReview(true);
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to take picture. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const retakePhoto = () => {
    const updatedPhotos = capturedPhotos.filter(p => p.shotType !== currentShot);
    setCapturedPhotos(updatedPhotos);
  };

  const renderOverlayGuide = () => {
    if (!shotGuide.overlayGuide) return null;

    switch (shotGuide.overlayGuide) {
      case 'rectangle':
        return (
          <View style={styles.rectangleGuide}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>
        );
      case 'circle':
        return <View style={styles.circleGuide} />;
      case 'grid':
        return (
          <View style={styles.gridGuide}>
            <View style={styles.gridLineH} />
            <View style={styles.gridLineV} />
          </View>
        );
      default:
        return null;
    }
  };

  const renderReviewModal = () => (
    <Modal visible={showReview} animationType="slide">
      <View style={styles.reviewContainer}>
        <View style={styles.reviewHeader}>
          <Text style={styles.reviewTitle}>Review Photos</Text>
          <TouchableOpacity onPress={() => setShowReview(false)} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.photoGrid}>
          {capturedPhotos.map((photo, index) => (
            <View key={photo.shotType} style={styles.photoItem}>
              <RNImage source={{ uri: photo.uri }} style={styles.thumbnail} />
              <View style={styles.photoInfo}>
                <Text style={styles.photoTitle}>
                  {SHOT_GUIDES[photo.shotType]?.title || photo.shotType}
                </Text>
                <Text style={styles.photoTime}>
                  {new Date(photo.capturedAt).toLocaleTimeString()}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setCurrentShotIndex(requiredShots.indexOf(photo.shotType));
                  setShowReview(false);
                }}
                style={styles.retakeButton}
              >
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <View style={styles.reviewActions}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              onPhotosComplete(capturedPhotos);
            }}
            style={styles.submitButton}
          >
            <Text style={styles.submitButtonText}>Submit Photos</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera permission is required</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera View - Preview may not show in Expo Go */}
      <CameraView 
        ref={cameraRef} 
        style={styles.camera} 
        facing="back"
        enableTorch={false}
        onCameraReady={onCameraReady}
      />

      {/* Preview Not Available Message */}
      <View style={styles.previewWarning}>
        <Text style={styles.warningText}>📸 Camera Ready</Text>
        <Text style={styles.warningSubtext}>Preview may not be visible in Expo Go</Text>
        <Text style={styles.warningSubtext}>Photos will still capture correctly</Text>
      </View>

      {/* Shot Guide Overlay */}
      <View style={styles.guideOverlay}>
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>{shotGuide.title}</Text>
          <Text style={styles.guideDescription}>{shotGuide.description}</Text>
          <View style={styles.progressIndicator}>
            <Text style={styles.progressText}>
              {currentShotIndex + 1} of {requiredShots.length}
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${((currentShotIndex + 1) / requiredShots.length) * 100}%` }
                ]} 
              />
            </View>
          </View>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={onClose} style={styles.cancelCaptureButton}>
          <Text style={styles.cancelCaptureButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={takePicture}
          disabled={isCapturing}
          style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
        >
          {isCapturing ? (
            <ActivityIndicator color="white" />
          ) : (
            <View style={styles.captureButtonInner} />
          )}
        </TouchableOpacity>

        {capturedPhotos.some(p => p.shotType === currentShot) && (
          <TouchableOpacity onPress={retakePhoto} style={styles.retakeCaptureButton}>
            <Text style={styles.retakeCaptureButtonText}>Retake</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Review Modal */}
      {renderReviewModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  // Preview warning
  previewWarning: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  warningText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  warningSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    textAlign: 'center',
  },
  // Overlay guides
  rectangleGuide: {
    position: 'absolute',
    top: '25%',
    left: '10%',
    width: '80%',
    height: '50%',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
    zIndex: 2,
  },
  circleGuide: {
    position: 'absolute',
    top: '35%',
    left: '35%',
    width: '30%',
    height: '30%',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 150,
    zIndex: 2,
  },
  gridGuide: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  gridLineH: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  gridLineV: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  cornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 20,
    height: 20,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: 'rgba(0, 255, 0, 0.8)',
  },
  cornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: 'rgba(0, 255, 0, 0.8)',
  },
  cornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 20,
    height: 20,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: 'rgba(0, 255, 0, 0.8)',
  },
  cornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: 'rgba(0, 255, 0, 0.8)',
  },
  // Guide overlay
  guideOverlay: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 3,
  },
  guideCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  guideTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  guideDescription: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  progressIndicator: {
    marginTop: 8,
  },
  progressText: {
    color: 'white',
    fontSize: 12,
    marginBottom: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  // Controls
  controls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 30,
    zIndex: 4,
  },
  cancelCaptureButton: {
    paddingHorizontal: 20,
      paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 25,
  },
  cancelCaptureButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  captureButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF5252',
  },
  retakeCaptureButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 152, 0, 0.9)',
    borderRadius: 25,
  },
  retakeCaptureButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Permission screen
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  permissionText: {
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  permissionButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Review modal
  reviewContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
reviewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
  },
  photoGrid: {
    flex: 1,
    padding: 20,
  },
  photoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  photoInfo: {
    flex: 1,
    marginLeft: 15,
  },
  photoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  photoTime: {
    fontSize: 12,
    color: '#666',
  },
  retakeButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: '#FF9800',
    borderRadius: 15,
  },
  retakeButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  reviewActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  cancelButton: {
    paddingHorizontal: 40,
    paddingVertical: 15,
    backgroundColor: '#f0f0f0',
    borderRadius: 25,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    paddingHorizontal: 40,
    paddingVertical: 15,
    backgroundColor: '#4CAF50',
    borderRadius: 25,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

export default VehicleCamera;
