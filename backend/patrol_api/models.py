"""
R.O.N.D.A. — Mobile-Based GPS Patrol Monitoring and Driver Session Management.
Core models: Branch, User (role + branch), Vehicle, DriverSession, GPSLog, IncidentReport.
"""

from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone


class Role(models.TextChoices):
    """Role-based access: Super Admin (all branches), Branch Admin (own branch), Driver (own session)."""
    SUPER_ADMIN = 'SUPER_ADMIN', 'Super Admin'
    BRANCH_ADMIN = 'BRANCH_ADMIN', 'Branch Admin'
    DRIVER = 'DRIVER', 'Driver'


class Branch(models.Model):
    """
    Branch (e.g. 41 branches). One Main Branch for Super Admin; each branch has one Branch Admin
    and multiple drivers; one patrol vehicle per branch (device fixed per vehicle).
    """
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=32, unique=True, help_text='Short branch identifier')
    is_main = models.BooleanField(default=False, help_text='True only for the main branch (Super Admin)')
    address = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.code})"


class User(AbstractUser):
    """
    Custom user: role (SUPER_ADMIN, BRANCH_ADMIN, DRIVER) and optional branch.
    SUPER_ADMIN: branch null, access all. BRANCH_ADMIN/DRIVER: branch required.
    """
    role = models.CharField(max_length=20, choices=Role.choices)
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='users',
        help_text='Required for BRANCH_ADMIN and DRIVER; null for SUPER_ADMIN',
    )

    class Meta:
        ordering = ['username']

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    @property
    def is_super_admin(self):
        return self.role == Role.SUPER_ADMIN

    @property
    def is_branch_admin(self):
        return self.role == Role.BRANCH_ADMIN

    @property
    def is_driver(self):
        return self.role == Role.DRIVER


class Vehicle(models.Model):
    """Patrol vehicles registered to a branch; driver chooses one when starting a session."""
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='vehicles',
    )
    plate_number = models.CharField(max_length=32)
    name = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['branch__name']

    def __str__(self):
        return f"{self.plate_number} ({self.branch.code})"


class DriverSession(models.Model):
    """
    Driver session: one driver, one vehicle, one branch. Only one active session per driver.
    """
    driver = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='sessions')
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='sessions')
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name='sessions')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_app_offline = models.BooleanField(default=False, help_text='Mobile app is in offline mode')

    class Meta:
        ordering = ['-start_time']

    def __str__(self):
        driver_name = self.driver.username if self.driver else 'Unknown Driver'
        branch_code = self.branch.code if self.branch else 'Unknown Branch'
        return f"Session {self.id} — {driver_name} ({branch_code})"


class GPSLog(models.Model):
    """GPS log tied to an active session; recorded every ~60 seconds with quality metadata."""
    session = models.ForeignKey(DriverSession, on_delete=models.CASCADE, related_name='gps_logs')
    latitude = models.DecimalField(max_digits=11, decimal_places=8)
    longitude = models.DecimalField(max_digits=11, decimal_places=8)
    timestamp = models.DateTimeField()
    
    # GPS Quality Metadata
    accuracy = models.DecimalField(
        max_digits=15, 
        decimal_places=8, 
        null=True, 
        blank=True,
        help_text='GPS accuracy in meters (lower is better)'
    )
    speed = models.DecimalField(
        max_digits=10, 
        decimal_places=4, 
        null=True, 
        blank=True,
        help_text='Speed in meters per second'
    )
    altitude = models.DecimalField(
        max_digits=15, 
        decimal_places=8, 
        null=True, 
        blank=True,
        help_text='Altitude in meters'
    )
    heading = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Direction/heading in degrees (0-360, where 0=North, 90=East)'
    )
    
    # Validation Metadata
    is_valid = models.BooleanField(
        default=True,
        help_text='Whether this GPS point passed validation checks'
    )
    rejection_reason = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text='Reason for rejection if validation failed'
    )
    accuracy_score = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Quality score from 0.0 to 1.0 (higher is better)'
    )

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['session', 'timestamp']),  # For recent GPS queries
            models.Index(fields=['timestamp']),              # For cleanup jobs
            models.Index(fields=['session']),                # For session-based queries
            models.Index(fields=['is_valid']),               # For filtering valid points
            models.Index(fields=['accuracy']),               # For quality filtering
        ]

    def __str__(self):
        return f"GPS {self.session_id} @ {self.timestamp} ({'valid' if self.is_valid else 'invalid'})"


class IncidentReport(models.Model):
    """Incident report during a session (description, optional image and location)."""
    session = models.ForeignKey(DriverSession, on_delete=models.CASCADE, related_name='incident_reports')
    description = models.TextField()
    image = models.ImageField(upload_to='incidents/%Y/%m/%d/', blank=True, null=True)
    latitude = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    longitude = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_resolved = models.BooleanField(default=False, help_text='Whether this incident has been resolved')
    resolved_at = models.DateTimeField(null=True, blank=True, help_text='When the incident was resolved')
    resolved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_incidents',
        help_text='Admin who resolved this incident'
    )

    class Meta:
        ordering = ['-created_at']


class PingStatus(models.TextChoices):
    SENT = 'SENT', 'Sent'
    DELIVERED = 'DELIVERED', 'Delivered'
    RESPONDED = 'RESPONDED', 'Responded'
    TIMEOUT = 'TIMEOUT', 'Timeout'


class PingRequest(models.Model):
    """Ping request from admin to driver for accountability check."""
    sender = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='sent_pings',
        limit_choices_to={'role__in': ['SUPER_ADMIN', 'BRANCH_ADMIN']}
    )
    driver = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='received_pings',
        limit_choices_to={'role': 'DRIVER'}
    )
    sent_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=PingStatus.choices, default=PingStatus.SENT)
    response = models.TextField(null=True, blank=True, help_text="Driver response (YES/NO/NEED_ASSISTANCE)")
    response_location_lat = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    response_location_lon = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    response_time_seconds = models.PositiveIntegerField(null=True, blank=True, help_text="Time to respond in seconds")
    
    class Meta:
        ordering = ['-sent_at']
        indexes = [
            models.Index(fields=['driver', 'status']),  # For active pings per driver
            models.Index(fields=['sent_at']),           # For cleanup
            models.Index(fields=['status']),            # For status filtering
        ]
    
    def __str__(self):
        return f"Ping to {self.driver.username} - {self.status}"
    
    def save(self, *args, **kwargs):
        # Calculate response time if responded
        if self.responded_at and self.sent_at and not self.response_time_seconds:
            self.response_time_seconds = int((self.responded_at - self.sent_at).total_seconds())
        super().save(*args, **kwargs)


class PushToken(models.Model):
    """Push notification tokens for mobile devices"""
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='push_tokens'
    )
    token = models.TextField(
        unique=True,
        help_text="Expo push token"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this token is currently active"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_active']),  # For active tokens per user
            models.Index(fields=['token']),               # For token lookups
        ]
    
    def __str__(self):
        return f"Push token for {self.user.username}"




