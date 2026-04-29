"""
R.O.N.D.A. — API serializers with role-aware validation.
Branch Admin can only create/assign DRIVER accounts for their branch.
"""

from rest_framework import serializers
from decimal import Decimal, ROUND_HALF_UP
from django.contrib.auth.password_validation import validate_password

from .models import Branch, User, Vehicle, DriverSession, GPSLog, IncidentReport, PingRequest, PingStatus, VideoCall
from .models import Role, CallStatus


class QuantizedDecimalField(serializers.DecimalField):
    def to_internal_value(self, data):
        if data is None or data == '':
            return super().to_internal_value(data)
        try:
            dec = Decimal(str(data))
            quant = Decimal('1').scaleb(-int(self.decimal_places))
            data = str(dec.quantize(quant, rounding=ROUND_HALF_UP))
        except Exception:
            pass
        return super().to_internal_value(data)


class UserLogoutSerializer(serializers.Serializer):
    """Serializer for user logout action."""
    user_id = serializers.IntegerField()
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)
    
    def validate_user_id(self, value):
        try:
            user = User.objects.get(id=value)
            return value
        except User.DoesNotExist:
            raise serializers.ValidationError("User not found.")


class BranchSerializer(serializers.ModelSerializer):
    """Branch list/detail."""

    class Meta:
        model = Branch
        fields = ['id', 'name', 'code', 'is_main', 'address', 'latitude', 'longitude', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class UserListSerializer(serializers.ModelSerializer):
    """User list: safe fields only."""
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'role_display', 'branch', 'branch_name', 'is_active',
            'date_joined', 'last_login',
        ]
        read_only_fields = ['date_joined', 'last_login']


class UserCreateUpdateSerializer(serializers.ModelSerializer):
    """User create/update with password; enforces Branch Admin can only create drivers for their branch."""
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 'first_name', 'last_name',
            'role', 'branch', 'is_active',
        ]
        extra_kwargs = {'password': {'write_only': True}}

    def validate(self, attrs):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return attrs

        role = attrs.get('role') or (self.instance.role if self.instance else None)
        branch = attrs.get('branch') or (self.instance.branch_id if self.instance else None)

        if request.user.role == 'BRANCH_ADMIN':
            # Branch Admin can only create/assign DRIVER and only for their branch
            if role and role != Role.DRIVER:
                raise serializers.ValidationError(
                    {'role': 'Branch Admin can only create or assign Driver accounts.'}
                )
            if branch and branch != request.user.branch_id:
                raise serializers.ValidationError(
                    {'branch': 'Branch Admin can only assign users to their own branch.'}
                )
            # Force branch to admin's branch when creating
            if not self.instance and request.user.branch_id:
                attrs['branch_id'] = request.user.branch_id
                attrs['branch'] = request.user.branch

        if request.user.role == 'SUPER_ADMIN':
            if role == Role.DRIVER and not branch:
                raise serializers.ValidationError({'branch': 'Driver must have a branch.'})
            if role == Role.BRANCH_ADMIN and not branch:
                raise serializers.ValidationError({'branch': 'Branch Admin must have a branch.'})

        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class VehicleSerializer(serializers.ModelSerializer):
    """Vehicle list/detail."""
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Vehicle
        fields = ['id', 'branch', 'branch_name', 'plate_number', 'name', 'created_at']
        read_only_fields = ['created_at']


class DriverSessionSerializer(serializers.ModelSerializer):
    """DriverSession with optional nested read."""
    driver_username = serializers.CharField(source='driver.username', read_only=True, allow_null=True)
    vehicle_plate = serializers.CharField(source='vehicle.plate_number', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = DriverSession
        fields = [
            'id', 'driver', 'driver_username', 'vehicle', 'vehicle_plate',
            'branch', 'branch_name', 'start_time', 'end_time', 'is_active',
        ]
        read_only_fields = ['start_time', 'end_time']

    def validate(self, attrs):
        if self.context.get('request') and self.context['request'].user.role == 'DRIVER':
            driver = attrs.get('driver') or getattr(self.instance, 'driver', None)
            if driver and driver.id != self.context['request'].user.id:
                raise serializers.ValidationError('Driver can only create sessions for themselves.')
        return attrs


class GPSLogSerializer(serializers.ModelSerializer):
    """GPS log serializer — stable field definition, no dynamic PRAGMA."""
    validation_result = serializers.SerializerMethodField(read_only=True)

    # Explicit field definitions — prevents "too many digits" errors
    # from raw GPS hardware float values
    accuracy  = serializers.DecimalField(max_digits=8,  decimal_places=2, required=False, allow_null=True)
    speed     = serializers.DecimalField(max_digits=8,  decimal_places=4, required=False, allow_null=True)
    altitude  = serializers.DecimalField(max_digits=9,  decimal_places=2, required=False, allow_null=True)
    latitude  = QuantizedDecimalField(max_digits=11, decimal_places=8, required=False)
    longitude = QuantizedDecimalField(max_digits=12, decimal_places=8, required=False)

    class Meta:
        model = GPSLog
        fields = [
            'id', 'session', 'latitude', 'longitude', 'timestamp',
            # New optional fields — use required=False so they're accepted
            # even if DB migration hasn't run yet
            'accuracy', 'speed', 'altitude',
            # Validation metadata — read-only, set by views.py
            'is_valid', 'rejection_reason', 'accuracy_score',
            'validation_result',
        ]
        read_only_fields = ['is_valid', 'rejection_reason', 'accuracy_score']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Gracefully remove fields that don't exist in the DB yet
        # so the serializer still works before migrations are run
        existing_field_names = {f.name for f in self.Meta.model._meta.get_fields()}
        optional_fields = ['accuracy', 'speed', 'altitude', 'is_valid', 'rejection_reason', 'accuracy_score']
        for field_name in optional_fields:
            if field_name not in existing_field_names:
                self.fields.pop(field_name, None)

    def validate(self, attrs):
        print(f"🔍 [Serializer] Validating GPS data: {attrs}")
        request = self.context.get('request')
        if request:
            print(f"🔍 [Serializer] Request user: {request.user.id} ({request.user.username})")
        return attrs

    def validate_session(self, value):
        print(f"🔍 [Serializer] Validating session: {value}")
        request = self.context.get('request')
        
        # If session doesn't exist, try to find user's active session automatically
        if not value:
            print(f"⚠️  [Serializer] No session provided, looking for user's active session")
            if request and request.user.role == 'DRIVER':
                from .models import DriverSession
                active_session = DriverSession.objects.filter(
                    driver=request.user, 
                    is_active=True
                ).first()
                if active_session:
                    print(f"✅ [Serializer] Found active session {active_session.id} for user {request.user.username}")
                    return active_session
                else:
                    raise serializers.ValidationError('No active session found for this driver.')
            raise serializers.ValidationError('Session is required.')
        
        if request and request.user.role == 'DRIVER' and value.driver_id != request.user.id:
            raise serializers.ValidationError('You can only add GPS logs to your own session.')
        if not value.is_active:
            raise serializers.ValidationError('GPS can only be recorded for an active session.')
        print(f"✅ [Serializer] Session validation passed")
        return value

    def validate_accuracy(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError('Accuracy cannot be negative.')
        if value is not None and value > 10000:
            raise serializers.ValidationError('Accuracy value seems unreasonable (>10000m).')
        return value

    def validate_speed(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError('Speed cannot be negative.')
        if value is not None and value > 138.89:
            raise serializers.ValidationError('Speed exceeds realistic maximum.')
        return value

    def validate_latitude(self, value):
        if value is None:
            return value
        try:
            dec = Decimal(str(value))
        except Exception:
            return value
        return dec.quantize(Decimal('0.00000001'), rounding=ROUND_HALF_UP)

    def validate_longitude(self, value):
        if value is None:
            return value
        try:
            dec = Decimal(str(value))
        except Exception:
            return value
        return dec.quantize(Decimal('0.00000001'), rounding=ROUND_HALF_UP)

    def get_validation_result(self, obj):
        if hasattr(obj, 'is_valid') and obj.is_valid:
            score = getattr(obj, 'accuracy_score', 'N/A')
            return f"Valid (score: {score})"
        reason = getattr(obj, 'rejection_reason', 'Unknown reason')
        return f"Invalid: {reason}"


class IncidentReportSerializer(serializers.ModelSerializer):
    """Incident report create/read."""
    resolved_by_username = serializers.ReadOnlyField(source='resolved_by.username')

    class Meta:
        model = IncidentReport
        fields = ['id', 'session', 'description', 'image', 'latitude', 'longitude', 'created_at', 'is_resolved', 'resolved_at', 'resolved_by', 'resolved_by_username']
        read_only_fields = ['created_at', 'resolved_at', 'resolved_by']


# Minimal serializers for write-only or list endpoints
class DriverSessionStartSerializer(serializers.Serializer):
    """Payload to start a session: vehicle_id (optional if only one vehicle per branch)."""
    vehicle_id = serializers.IntegerField(required=False)
    start_time = serializers.DateTimeField(required=False)

    def validate_vehicle_id(self, value):
        from .models import Vehicle
        if not Vehicle.objects.filter(pk=value).exists():
            raise serializers.ValidationError('Vehicle not found.')
        return value

    def validate_start_time(self, value):
        if value is None:
            return value
        from django.utils import timezone
        if timezone.is_naive(value):
            value = timezone.make_aware(value, timezone.get_current_timezone())
        return value


class PingRequestSerializer(serializers.ModelSerializer):
    """Ping request for admin to driver communication."""
    sender_name = serializers.CharField(source='sender.username', read_only=True)
    driver_name = serializers.CharField(source='driver.username', read_only=True)
    
    class Meta:
        model = PingRequest
        fields = [
            'id', 'sender', 'driver', 'sender_name', 'driver_name',
            'sent_at', 'responded_at', 'status', 'response',
            'response_location_lat', 'response_location_lon', 'response_time_seconds'
        ]
        read_only_fields = ['sent_at', 'responded_at', 'response_time_seconds']


class PingSendSerializer(serializers.Serializer):
    """Serializer for sending ping to driver."""
    driver_id = serializers.IntegerField()
    
    def validate_driver_id(self, value):
        from .models import User
        try:
            driver = User.objects.get(pk=value, role='DRIVER')
            return value
        except User.DoesNotExist:
            raise serializers.ValidationError('Driver not found.')


class PingResponseSerializer(serializers.Serializer):
    """Serializer for driver responding to ping."""
    ping_id = serializers.IntegerField()
    response = serializers.ChoiceField(choices=['YES', 'NO', 'NEED_ASSISTANCE'])
    latitude = QuantizedDecimalField(max_digits=11, decimal_places=8, required=False)
    longitude = QuantizedDecimalField(max_digits=11, decimal_places=8, required=False)
    
    def validate_ping_id(self, value):
        from .models import PingRequest
        try:
            ping = PingRequest.objects.get(pk=value, status__in=['SENT', 'DELIVERED'])
            return value
        except PingRequest.DoesNotExist:
            raise serializers.ValidationError('Ping request not found or already responded.')


class VideoCallSerializer(serializers.ModelSerializer):
    """Video call list/detail serializer"""
    initiator_name = serializers.CharField(source='initiator.username', read_only=True)
    recipient_name = serializers.CharField(source='recipient.username', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    session_info = serializers.SerializerMethodField()
    
    class Meta:
        model = VideoCall
        fields = [
            'id', 'initiator', 'initiator_name', 'recipient', 'recipient_name',
            'session', 'session_info', 'status', 'status_display',
            'started_at', 'ended_at', 'duration_seconds'
        ]
        read_only_fields = ['started_at', 'ended_at', 'duration_seconds']
    
    def get_session_info(self, obj):
        if obj.session:
            return {
                'id': obj.session.id,
                'vehicle_plate': obj.session.vehicle.plate_number,
                'branch_name': obj.session.branch.name
            }
        return None


class VideoCallInitiateSerializer(serializers.Serializer):
    """Serializer for initiating a video call"""
    recipient_id = serializers.IntegerField()
    session_id = serializers.IntegerField(required=False, allow_null=True)
    
    def validate_recipient_id(self, value):
        """Validate recipient exists and is a driver"""
        try:
            recipient = User.objects.get(id=value, role='DRIVER')
            return value
        except User.DoesNotExist:
            raise serializers.ValidationError('Recipient not found or is not a driver.')
