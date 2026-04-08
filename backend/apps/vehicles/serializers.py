from rest_framework import serializers
from .models import VehiclePhotoSubmission
from patrol_api.models import Branch, Vehicle
from patrol_api.models_snapshots import VehiclePhoto


class VehiclePhotoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = VehiclePhoto
        fields = [
            'id', 'shot_type', 'image', 'image_url', 
            'latitude', 'longitude', 'notes', 'captured_at',
            'file_size', 'uploaded_at', 'submission_id'
        ]
    
    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None


class VehiclePhotoSubmissionSerializer(serializers.ModelSerializer):
    photos = serializers.SerializerMethodField()
    driver_name = serializers.CharField(read_only=True)
    branch_name = serializers.CharField(read_only=True)
    vehicle_plate = serializers.CharField(read_only=True)
    
    class Meta:
        model = VehiclePhotoSubmission
        fields = [
            'id', 'driver', 'branch', 'vehicle', 'photo_type',
            'submitted_at', 'captured_at', 'photo_count', 'status',
            'shift_id', 'driver_name', 'branch_name', 'vehicle_plate',
            'photos', 'created_at', 'updated_at'
        ]
        read_only_fields = ['driver', 'submitted_at', 'photo_count', 'created_at', 'updated_at']
    
    def get_photos(self, obj):
        """Get photos using the model's photos property"""
        photos = obj.photos
        return VehiclePhotoSerializer(photos, many=True, context=self.context).data


class VehiclePhotoSubmissionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new photo submissions"""
    photos_data = serializers.JSONField(write_only=True)
    
    class Meta:
        model = VehiclePhotoSubmission
        fields = [
            'vehicle', 'photo_type', 'captured_at', 'shift_id',
            'photos_data'
        ]
    
    def create(self, validated_data):
        photos_data = validated_data.pop('photos_data')
        submission = VehiclePhotoSubmission.objects.create(**validated_data)
        submission.photo_count = len(photos_data)
        submission.save()
        
        # Create individual photo records
        for photo_data in photos_data:
            VehiclePhoto.objects.create(
                submission_id=submission.id,
                shot_type=photo_data['shot_type'],
                image=photo_data['image'],
                latitude=photo_data.get('latitude'),
                longitude=photo_data.get('longitude'),
                notes=photo_data.get('notes'),
                captured_at=photo_data.get('captured_at', submission.captured_at),
                file_size=photo_data.get('file_size')
            )
        
        return submission
