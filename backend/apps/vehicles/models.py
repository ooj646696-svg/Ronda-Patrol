from django.db import models
from django.conf import settings
from patrol_api.models import Branch, Vehicle
from patrol_api.models_snapshots import VehiclePhoto

class VehiclePhotoSubmission(models.Model):
    """Main submission record for a group of photos"""
    STATUS_CHOICES = [
        ('pending', 'Pending Upload'),
        ('uploaded', 'Uploaded'),
        ('failed', 'Failed'),
    ]
    
    PHOTO_TYPE_CHOICES = [
        ('pre_shift', 'Pre-Shift'),
        ('post_shift', 'Post-Shift'),
    ]

    id = models.AutoField(primary_key=True)
    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='photo_submissions')
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='photo_submissions')
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='photo_submissions')
    photo_type = models.CharField(max_length=20, choices=PHOTO_TYPE_CHOICES)
    submitted_at = models.DateTimeField(auto_now_add=True)
    captured_at = models.DateTimeField()
    photo_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    shift_id = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-submitted_at']
        verbose_name = "Vehicle Photo Submission"
        verbose_name_plural = "Vehicle Photo Submissions"

    def __str__(self):
        return f"{self.driver.username} - {self.vehicle.plate_number} - {self.photo_type}"

    @property
    def driver_name(self):
        return f"{self.driver.first_name} {self.driver.last_name}".strip() or self.driver.username

    @property
    def branch_name(self):
        return self.branch.name

    @property
    def vehicle_plate(self):
        return self.vehicle.plate_number

    @property
    def photos(self):
        """Get photos associated with this submission"""
        # This will link to the existing VehiclePhoto model
        # We'll need to add a submission_id foreign key to that model
        return VehiclePhoto.objects.filter(submission_id=self.id).order_by('shot_type')
