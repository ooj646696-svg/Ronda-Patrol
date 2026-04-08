"""
Serializers for Vehicle Snapshot System
"""
from rest_framework import serializers
from .models_snapshots import VehiclePhoto, PhotoRequirement, DamageReport

class VehiclePhotoSerializer(serializers.ModelSerializer):
    """Serializer for vehicle photos with metadata"""
    
    officer_name = serializers.CharField(source='officer.username', read_only=True)
    vehicle_plate = serializers.CharField(source='vehicle.plate_number', read_only=True)
    image_url = serializers.ImageField(source='image', read_only=True)
    thumbnail_url = serializers.ImageField(source='thumbnail', read_only=True)
    
    class Meta:
        model = VehiclePhoto
        fields = [
            'id', 'vehicle', 'vehicle_plate', 'officer', 'officer_name', 'shift',
            'photo_type', 'shot_type', 'image', 'image_url', 'thumbnail', 'thumbnail_url',
            'latitude', 'longitude', 'captured_at', 'uploaded_at', 'file_size',
            'image_quality_score', 'validation_status', 'notes',
            'reviewed_by', 'reviewed_at', 'rejection_reason'
        ]
        read_only_fields = ['uploaded_at', 'image_quality_score', 'validation_status']

class PhotoUploadSerializer(serializers.ModelSerializer):
    """Serializer for photo upload with validation"""
    
    class Meta:
        model = VehiclePhoto
        fields = [
            'vehicle', 'photo_type', 'shot_type', 'image', 'latitude', 
            'longitude', 'captured_at', 'notes'
        ]
    
    def validate_image(self, value):
        """Validate image size and format"""
        # Max file size: 10MB
        max_size = 10 * 1024 * 1024
        if value.size > max_size:
            raise serializers.ValidationError("Image size cannot exceed 10MB")
        
        # Validate image format
        allowed_formats = ['image/jpeg', 'image/png', 'image/webp']
        if value.content_type not in allowed_formats:
            raise serializers.ValidationError("Only JPEG, PNG, and WebP formats are allowed")
        
        return value

class BatchPhotoUploadSerializer(serializers.Serializer):
    """Serializer for uploading multiple photos at once"""
    
    photos = PhotoUploadSerializer(many=True)
    
    def validate_photos(self, photos):
        """Validate batch of photos"""
        if not photos:
            raise serializers.ValidationError("At least one photo is required")
        
        # Check for duplicate shot types within the same batch
        shot_types = [photo['shot_type'] for photo in photos]
        if len(shot_types) != len(set(shot_types)):
            raise serializers.ValidationError("Duplicate shot types are not allowed in a single batch")
        
        return photos

class PhotoRequirementSerializer(serializers.ModelSerializer):
    """Serializer for photo requirements configuration"""
    
    class Meta:
        model = PhotoRequirement
        fields = ['id', 'vehicle_type', 'shift_type', 'required_shots', 'optional_shots', 'is_active']

class DamageReportSerializer(serializers.ModelSerializer):
    """Serializer for damage reports"""
    
    officer_name = serializers.CharField(source='reporting_officer.username', read_only=True)
    vehicle_plate = serializers.CharField(source='vehicle.plate_number', read_only=True)
    photo_evidence = VehiclePhotoSerializer(source='photos', many=True, read_only=True)
    
    class Meta:
        model = DamageReport
        fields = [
            'id', 'vehicle', 'vehicle_plate', 'reporting_officer', 'officer_name', 
            'shift', 'description', 'severity', 'location_on_vehicle', 
            'photo_evidence', 'occurred_at', 'reported_at', 
            'is_repaired', 'repair_notes'
        ]

class ShiftPhotoStatusSerializer(serializers.Serializer):
    """Serializer for checking photo completion status"""
    
    shift_id = serializers.IntegerField()
    required_photos = serializers.ListField(child=serializers.CharField())
    completed_photos = serializers.ListField(child=serializers.CharField())
    missing_photos = serializers.ListField(child=serializers.CharField())
    is_complete = serializers.BooleanField()
    pre_shift_count = serializers.IntegerField()
    post_shift_count = serializers.IntegerField()

class PhotoReviewSerializer(serializers.ModelSerializer):
    """Serializer for admin photo review"""
    
    class Meta:
        model = VehiclePhoto
        fields = [
            'id', 'validation_status', 'reviewed_by', 'reviewed_at', 
            'rejection_reason', 'notes'
        ]
    
    def validate(self, data):
        """Validate review data"""
        if data.get('validation_status') == 'rejected' and not data.get('rejection_reason'):
            raise serializers.ValidationError("Rejection reason is required when rejecting a photo")
        
        return data
