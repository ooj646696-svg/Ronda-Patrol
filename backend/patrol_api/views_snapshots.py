"""
API Views for Vehicle Snapshot System
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from PIL import Image
import io
import os
from django.conf import settings

from .models_snapshots import VehiclePhoto, PhotoRequirement, DamageReport
from .serializers_snapshots import (
    VehiclePhotoSerializer, PhotoUploadSerializer, BatchPhotoUploadSerializer,
    PhotoRequirementSerializer, DamageReportSerializer, ShiftPhotoStatusSerializer,
    PhotoReviewSerializer
)

class VehiclePhotoViewSet(viewsets.ModelViewSet):
    """ViewSet for managing vehicle photos"""
    
    serializer_class = VehiclePhotoSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter photos by user, vehicle, or shift"""
        queryset = VehiclePhoto.objects.all()
        
        # Filter by current user's photos only
        if not self.request.user.is_staff:
            queryset = queryset.filter(officer=self.request.user)
        
        # Filter by vehicle
        vehicle_id = self.request.query_params.get('vehicle_id')
        if vehicle_id:
            queryset = queryset.filter(vehicle_id=vehicle_id)
        
        # Filter by shift
        shift_id = self.request.query_params.get('shift_id')
        if shift_id:
            queryset = queryset.filter(shift_id=shift_id)
        
        # Filter by photo type
        photo_type = self.request.query_params.get('photo_type')
        if photo_type:
            queryset = queryset.filter(photo_type=photo_type)
        
        return queryset.select_related('vehicle', 'officer', 'shift').order_by('-captured_at')
    
    def create(self, request, *args, **kwargs):
        """Upload a single photo with metadata"""
        serializer = PhotoUploadSerializer(data=request.data)
        if serializer.is_valid():
            photo = serializer.save(officer=request.user)
            
            # Generate thumbnail
            self._generate_thumbnail(photo)
            
            # Validate photo quality
            quality_score = self._analyze_photo_quality(photo)
            photo.image_quality_score = quality_score
            photo.save()
            
            # Return full photo data
            response_serializer = VehiclePhotoSerializer(photo)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def batch_upload(self, request):
        """Upload multiple photos at once"""
        serializer = BatchPhotoUploadSerializer(data=request.data)
        if serializer.is_valid():
            uploaded_photos = []
            
            for photo_data in serializer.validated_data['photos']:
                photo = VehiclePhoto.objects.create(
                    officer=request.user,
                    **photo_data
                )
                
                # Generate thumbnail and analyze quality
                self._generate_thumbnail(photo)
                photo.image_quality_score = self._analyze_photo_quality(photo)
                photo.save()
                
                uploaded_photos.append(photo)
            
            # Return all uploaded photos
            response_serializer = VehiclePhotoSerializer(uploaded_photos, many=True)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def required(self, request):
        """Get required photos for a specific vehicle"""
        vehicle_id = request.query_params.get('vehicle_id')
        if not vehicle_id:
            return Response({'error': 'vehicle_id parameter is required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Get the vehicle through the VehiclePhoto relationship to avoid import issues
        from .models import Vehicle
        vehicle = get_object_or_404(Vehicle, id=vehicle_id)
        
        vehicle_type = getattr(vehicle, 'vehicle_type', None)
        requirements = None
        if vehicle_type is not None:
            requirements = PhotoRequirement.objects.filter(
                vehicle_type=vehicle_type,
                is_active=True
            ).first()
        
        if requirements:
            return Response({
                'required_shots': requirements.required_shots,
                'optional_shots': requirements.optional_shots
            })
        
        # Default requirements
        default_required = ['front', 'rear', 'left_side', 'right_side', 'odometer', 'fuel_gauge']
        return Response({
            'required_shots': default_required,
            'optional_shots': ['interior']
        })
    
    @action(detail=False, methods=['get'])
    def shift_status(self, request):
        """Check photo completion status for a shift"""
        shift_id = request.query_params.get('shift_id')
        if not shift_id:
            return Response({'error': 'shift_id parameter is required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Get required shots for this shift's vehicle
        shift_photos = VehiclePhoto.objects.filter(shift_id=shift_id)
        
        if not shift_photos.exists():
            return Response({'error': 'No photos found for this shift'}, 
                          status=status.HTTP_404_NOT_FOUND)
        
        vehicle = shift_photos.first().vehicle
        requirements = PhotoRequirement.objects.filter(
            vehicle_type=vehicle.vehicle_type,
            is_active=True
        ).first()
        
        required_shots = requirements.required_shots if requirements else [
            'front', 'rear', 'left_side', 'right_side', 'odometer', 'fuel_gauge'
        ]
        
        # Check completion status
        pre_shift_photos = shift_photos.filter(photo_type='pre_shift').values_list('shot_type', flat=True)
        post_shift_photos = shift_photos.filter(photo_type='post_shift').values_list('shot_type', flat=True)
        
        missing_pre = set(required_shots) - set(pre_shift_photos)
        missing_post = set(required_shots) - set(post_shift_photos)
        
        is_complete = len(missing_pre) == 0 and len(missing_post) == 0
        
        return Response({
            'shift_id': shift_id,
            'required_photos': required_shots,
            'completed_photos': list(pre_shift_photos) + list(post_shift_photos),
            'missing_photos': list(missing_pre) + list(missing_post),
            'is_complete': is_complete,
            'pre_shift_count': len(pre_shift_photos),
            'post_shift_count': len(post_shift_photos)
        })
    
    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        """Admin review of photo"""
        if not request.user.is_staff:
            return Response({'error': 'Admin permissions required'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        photo = self.get_object()
        serializer = PhotoReviewSerializer(photo, data=request.data, partial=True)
        
        if serializer.is_valid():
            serializer.save(reviewed_by=request.user, reviewed_at=timezone.now())
            return Response(serializer.data)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def _generate_thumbnail(self, photo):
        """Generate thumbnail for uploaded photo"""
        try:
            img = Image.open(photo.image.path)
            
            # Create thumbnail (300x300, maintaining aspect ratio)
            img.thumbnail((300, 300), Image.Resampling.LANCZOS)
            
            # Save thumbnail
            thumb_path = photo.image.path.replace('vehicle_photos/', 'vehicle_photos/thumbnails/')
            os.makedirs(os.path.dirname(thumb_path), exist_ok=True)
            
            img.save(thumb_path, 'JPEG', quality=85)
            photo.thumbnail = thumb_path.replace(settings.MEDIA_ROOT, '').lstrip('/')
            
        except Exception as e:
            print(f"Error generating thumbnail: {e}")
    
    def _analyze_photo_quality(self, photo):
        """Analyze photo quality (blur detection, brightness, etc.)"""
        try:
            img = Image.open(photo.image.path)
            
            # Simple quality metrics (can be enhanced with OpenCV)
            width, height = img.size
            file_size = photo.image.size
            
            # Basic quality score based on resolution and file size
            resolution_score = min(1.0, (width * height) / (1920 * 1080))
            size_score = min(1.0, file_size / (2 * 1024 * 1024))  # 2MB as good size
            
            quality_score = (resolution_score + size_score) / 2
            return round(quality_score, 2)
            
        except Exception as e:
            print(f"Error analyzing photo quality: {e}")
            return 0.5  # Default score

class PhotoRequirementViewSet(viewsets.ModelViewSet):
    """ViewSet for managing photo requirements"""
    
    queryset = PhotoRequirement.objects.all()
    serializer_class = PhotoRequirementSerializer
    permission_classes = [permissions.IsAdminUser]

class DamageReportViewSet(viewsets.ModelViewSet):
    """ViewSet for managing damage reports"""
    
    serializer_class = DamageReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter damage reports by user or vehicle"""
        queryset = DamageReport.objects.all()
        
        if not self.request.user.is_staff:
            queryset = queryset.filter(reporting_officer=self.request.user)
        
        vehicle_id = self.request.query_params.get('vehicle_id')
        if vehicle_id:
            queryset = queryset.filter(vehicle_id=vehicle_id)
        
        return queryset.select_related('vehicle', 'reporting_officer', 'shift').order_by('-reported_at')
