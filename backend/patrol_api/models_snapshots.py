"""
Vehicle Snapshot Models for Pre/Post Shift Photo Documentation
"""
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class VehiclePhoto(models.Model):
    """Individual vehicle photos with metadata"""
    
    PHOTO_TYPES = [
        ('pre_shift', 'Pre-Shift'),
        ('post_shift', 'Post-Shift'),
    ]
    
    SHOT_TYPES = [
        ('front', 'Front View'),
        ('rear', 'Rear View'),
        ('left_side', 'Left Side'),
        ('right_side', 'Right Side'),
        ('odometer', 'Odometer'),
        ('fuel_gauge', 'Fuel Gauge'),
        ('interior', 'Interior'),
        ('damage', 'Damage Documentation'),
        ('tires', 'Tires'),
        ('equipment', 'Equipment'),
    ]
    
    VALIDATION_STATUS = [
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('needs_retake', 'Needs Retake'),
    ]
    
    # Relationships
    vehicle = models.ForeignKey('patrol_api.Vehicle', on_delete=models.CASCADE, related_name='photos')
    officer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='vehicle_photos')
    shift = models.ForeignKey('patrol_api.DriverSession', on_delete=models.CASCADE, related_name='photos', null=True, blank=True)
    submission_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)  # Links to VehiclePhotoSubmission
    
    # Photo Classification
    photo_type = models.CharField(max_length=20, choices=PHOTO_TYPES)
    shot_type = models.CharField(max_length=20, choices=SHOT_TYPES)
    
    # File Storage
    image = models.ImageField(upload_to='vehicle_photos/%Y/%m/%d/')
    thumbnail = models.ImageField(upload_to='vehicle_photos/thumbnails/%Y/%m/%d/', null=True, blank=True)
    
    # Metadata
    latitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    longitude = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    captured_at = models.DateTimeField()
    uploaded_at = models.DateTimeField(auto_now_add=True)
    file_size = models.IntegerField(null=True, blank=True)
    
    # Quality & Validation
    image_quality_score = models.FloatField(null=True, blank=True)
    validation_status = models.CharField(max_length=20, choices=VALIDATION_STATUS, default='pending')
    notes = models.TextField(blank=True)
    
    # Admin Review
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_photos')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-captured_at']
        indexes = [
            models.Index(fields=['vehicle', 'photo_type']),
            models.Index(fields=['officer', 'captured_at']),
            models.Index(fields=['validation_status']),
        ]
    
    def __str__(self):
        return f"{self.vehicle.plate_number} - {self.get_photo_type_display()} - {self.get_shot_type_display()}"

class PhotoRequirement(models.Model):
    """Configure required photos for different vehicle/shift types"""
    
    vehicle_type = models.CharField(max_length=50)
    shift_type = models.CharField(max_length=50)
    required_shots = models.JSONField(default=list)  # ['front', 'rear', 'left_side', 'right_side']
    optional_shots = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['vehicle_type', 'shift_type']
    
    def __str__(self):
        return f"{self.vehicle_type} - {self.shift_type} Requirements"

class DamageReport(models.Model):
    """Document damage with photo evidence"""
    
    SEVERITY_LEVELS = [
        ('minor', 'Minor'),
        ('moderate', 'Moderate'),
        ('major', 'Major'),
        ('critical', 'Critical'),
    ]
    
    vehicle = models.ForeignKey('patrol_api.Vehicle', on_delete=models.CASCADE, related_name='damage_reports')
    reporting_officer = models.ForeignKey(User, on_delete=models.CASCADE)
    shift = models.ForeignKey('patrol_api.DriverSession', on_delete=models.CASCADE, related_name='damage_reports')
    
    # Damage Details
    description = models.TextField()
    severity = models.CharField(max_length=20, choices=SEVERITY_LEVELS)
    location_on_vehicle = models.CharField(max_length=100)
    
    # Photo Evidence
    photos = models.ManyToManyField(VehiclePhoto, related_name='damage_reports')
    
    # Timestamps
    occurred_at = models.DateTimeField()
    reported_at = models.DateTimeField(auto_now_add=True)
    
    # Status
    is_repaired = models.BooleanField(default=False)
    repair_notes = models.TextField(blank=True)
    
    def __str__(self):
        return f"Damage Report - {self.vehicle.plate_number} - {self.severity}"
