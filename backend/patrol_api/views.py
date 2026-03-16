"""
R.O.N.D.A. — API ViewSets.
- Driver: JWT login, start/stop session (single active), GPS only when session active.
- Branch Admin: view sessions and live vehicle locations for their branch, including recent ping info.
- Super Admin: full access.
"""

from django.utils import timezone
from datetime import timedelta
from django.db import models
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated as DRFIsAuthenticated

from .models import Branch, User, Vehicle, DriverSession, GPSLog, IncidentReport, PingRequest, PingStatus, VideoCall
from .notifications import send_ping_notification
from .serializers import (
    BranchSerializer,
    UserListSerializer,
    UserCreateUpdateSerializer,
    VehicleSerializer,
    DriverSessionSerializer,
    DriverSessionStartSerializer,
    GPSLogSerializer,
    IncidentReportSerializer,
    PingRequestSerializer,
    PingSendSerializer,
    PingResponseSerializer,
    VideoCallSerializer,
    VideoCallInitiateSerializer,
)
from .permissions import (
    IsSuperAdmin,
    IsBranchAdmin,
    IsDriver,
    BranchScopedPermission,
    UserManagementPermission,
)


# ---------- Branch ----------
class BranchViewSet(viewsets.ModelViewSet):
    """
    Branch management.
    - Super Admin: can list/create/update all branches.
    - Branch Admin: can only see their own branch (read-only).
    """
    serializer_class = BranchSerializer
    permission_classes = [IsBranchAdmin]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return Branch.objects.all()
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return Branch.objects.filter(pk=user.branch_id)
        return Branch.objects.none()

    def perform_create(self, serializer):
        if not self.request.user.is_super_admin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin can create branches.')
        serializer.save()

    def perform_update(self, serializer):
        if not self.request.user.is_super_admin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin can update branches.')
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        try:
            branch = self.get_object()

            if not request.user.is_super_admin:
                return Response(
                    {'detail': 'Only Super Admin can delete branches.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            if DriverSession.objects.filter(branch=branch, is_active=True).exists():
                return Response(
                    {'detail': 'Cannot delete branch with active patrol sessions. Stop all sessions first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            users_count = User.objects.filter(branch=branch).count()
            if users_count > 0:
                return Response(
                    {'detail': f'Cannot delete branch with {users_count} assigned users. Reassign or delete users first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            vehicles_count = Vehicle.objects.filter(branch=branch).count()
            if vehicles_count > 0:
                return Response(
                    {'detail': f'Cannot delete branch with {vehicles_count} registered vehicles. Delete vehicles first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            session_count = DriverSession.objects.filter(branch=branch).count()
            if session_count > 0:
                print(f"Deleting branch {branch.name} ({branch.code}) with {session_count} historical sessions")

            self.perform_destroy(branch)
            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            print(f"Error deleting branch: {e}")
            return Response(
                {'detail': f'Failed to delete branch: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ---------- User ----------
class UserViewSet(viewsets.ModelViewSet):
    """
    User CRUD. Super Admin: any role/branch. Branch Admin: only DRIVER for their branch.
    """
    permission_classes = [UserManagementPermission]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return User.objects.all().select_related('branch')
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return User.objects.filter(branch_id=user.branch_id).select_related('branch')
        return User.objects.none()

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return UserCreateUpdateSerializer
        return UserListSerializer

    def destroy(self, request, *args, **kwargs):
        try:
            user = self.get_object()

            if DriverSession.objects.filter(driver=user, is_active=True).exists():
                return Response(
                    {'detail': 'Cannot delete user with active patrol sessions. Stop all sessions first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if user.role == 'BRANCH_ADMIN':
                drivers_in_branch = User.objects.filter(branch=user.branch, role='DRIVER').exclude(id=user.id)
                if drivers_in_branch.exists():
                    return Response(
                        {'detail': 'Cannot delete branch admin with assigned drivers. Reassign drivers first.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            session_count = DriverSession.objects.filter(driver=user).count()
            gps_count = GPSLog.objects.filter(session__driver=user).count()

            if session_count > 0:
                print(f"Deleting user {user.username} with {session_count} historical sessions and {gps_count} GPS records")
                print(f"WARNING: Sessions will be preserved but driver field will be set to NULL")

            DriverSession.objects.filter(driver=user).update(driver=None)
            self.perform_destroy(user)
            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            print(f"Error deleting user: {e}")
            return Response(
                {'detail': f'Failed to delete user: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ---------- Vehicle ----------
class VehicleViewSet(viewsets.ModelViewSet):
    """
    Vehicles registered to a branch. Drivers can list vehicles for their branch.
    Super Admin / Branch Admin can create and manage vehicles.
    """
    serializer_class = VehicleSerializer
    permission_classes = [IsDriver, BranchScopedPermission]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return Vehicle.objects.all().select_related('branch')
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return Vehicle.objects.filter(branch_id=user.branch_id).select_related('branch')
        if user.role == 'DRIVER' and user.branch_id:
            return Vehicle.objects.filter(branch_id=user.branch_id).select_related('branch')
        return Vehicle.objects.none()

    def perform_create(self, serializer):
        if self.request.user.role == 'DRIVER':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin or Branch Admin can register vehicles.')
        user = self.request.user
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            serializer.save(branch_id=user.branch_id)

    def perform_update(self, serializer):
        if self.request.user.role == 'DRIVER':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin or Branch Admin can update vehicles.')
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role == 'DRIVER':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin or Branch Admin can delete vehicles.')
        instance.delete()

    def destroy(self, request, *args, **kwargs):
        try:
            vehicle = self.get_object()

            if DriverSession.objects.filter(vehicle=vehicle, is_active=True).exists():
                return Response(
                    {'detail': 'Cannot delete vehicle with active patrol sessions. Stop all sessions first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            session_count = DriverSession.objects.filter(vehicle=vehicle).count()
            if session_count > 0:
                print(f"Deleting vehicle {vehicle.plate_number} with {session_count} historical sessions")

            self.perform_destroy(vehicle)
            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            print(f"Error deleting vehicle: {e}")
            return Response(
                {'detail': f'Failed to delete vehicle: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ---------- DriverSession ----------
class DriverSessionViewSet(viewsets.ModelViewSet):
    """
    Sessions: Driver can start (one active only) and stop own session.
    Branch Admin sees all sessions in their branch; Super Admin sees all.
    """
    serializer_class = DriverSessionSerializer
    permission_classes = [IsDriver, BranchScopedPermission]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return DriverSession.objects.all().select_related('driver', 'vehicle', 'branch')
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return DriverSession.objects.filter(branch_id=user.branch_id).select_related('driver', 'vehicle', 'branch')
        if user.role == 'DRIVER':
            return DriverSession.objects.filter(driver_id=user.id).select_related('driver', 'vehicle', 'branch')
        return DriverSession.objects.none()

    def perform_create(self, serializer):
        pass

    @action(detail=False, methods=['post'], url_path='start')
    def start_session(self, request):
        """Driver starts a session. Only one active session per driver."""
        if request.user.role != 'DRIVER':
            return Response({'detail': 'Only drivers can start a session.'}, status=status.HTTP_403_FORBIDDEN)
        driver = request.user
        if not driver.branch_id:
            return Response({'detail': 'Driver must be assigned to a branch.'}, status=status.HTTP_400_BAD_REQUEST)

        if DriverSession.objects.filter(driver=driver, is_active=True).exists():
            return Response(
                {'detail': 'You already have an active session. Stop it before starting a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = DriverSessionStartSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        vehicle_id = ser.validated_data.get('vehicle_id')

        vehicle = None
        if vehicle_id:
            vehicle = Vehicle.objects.filter(pk=vehicle_id, branch_id=driver.branch_id).first()
            if not vehicle:
                return Response({'detail': 'Vehicle not found or not in your branch.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            vehicle = Vehicle.objects.filter(branch_id=driver.branch_id).first()
            if not vehicle:
                return Response({'detail': 'No vehicle assigned to your branch.'}, status=status.HTTP_400_BAD_REQUEST)

        session = DriverSession.objects.create(
            driver=driver,
            vehicle=vehicle,
            branch=driver.branch,
            start_time=timezone.now(),
            is_active=True,
        )
        return Response(DriverSessionSerializer(session).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='stop')
    def stop_session(self, request, pk=None):
        """Driver stops their active session."""
        session = self.get_object()
        if request.user.role != 'DRIVER' or session.driver_id != request.user.id:
            return Response({'detail': 'You can only stop your own session.'}, status=status.HTTP_403_FORBIDDEN)
        if not session.is_active:
            return Response({'detail': 'Session is already stopped.'}, status=status.HTTP_400_BAD_REQUEST)
        session.is_active = False
        session.end_time = timezone.now()
        session.save()
        return Response(DriverSessionSerializer(session).data)


# ---------- Live locations ----------
class LiveLocationsView(APIView):
    """
    GET: Branch Admin sees live vehicle locations for their branch.
    Super Admin sees all branches.
    """
    permission_classes = [IsBranchAdmin]

    def get(self, request):
        try:
            user = request.user
            if user.role == 'SUPER_ADMIN':
                sessions = DriverSession.objects.filter(is_active=True).select_related('driver', 'vehicle', 'branch')
            elif user.role == 'BRANCH_ADMIN' and user.branch_id:
                sessions = DriverSession.objects.filter(is_active=True, branch_id=user.branch_id).select_related('driver', 'vehicle', 'branch')
            else:
                sessions = DriverSession.objects.none()

            three_minutes_ago = timezone.now() - timedelta(minutes=3)
            results = []

            for s in sessions:
                try:
                    recent_gps = GPSLog.objects.filter(
                        session=s,
                        timestamp__gte=three_minutes_ago
                    ).order_by('timestamp')

                    valid_gps_points = []
                    for g in recent_gps:
                        try:
                            lat = float(g.latitude)
                            lon = float(g.longitude)
                            if not (4.0 <= lat <= 21.0 and 112.0 <= lon <= 131.0):
                                print(f"Invalid GPS coordinates for session {s.id}: {lat}, {lon}")
                                continue
                            valid_gps_points.append({
                                'latitude': lat,
                                'longitude': lon,
                                'timestamp': g.timestamp.isoformat()
                            })
                        except (ValueError, TypeError) as e:
                            print(f"Invalid GPS data for session {s.id}: {e}")
                            continue

                    last_gps = recent_gps.last() if recent_gps.exists() else None

                    # Get recent ping info for this driver
                    recent_ping = PingRequest.objects.filter(
                        driver=s.driver,
                        sent_at__gte=timezone.now() - timedelta(hours=1)
                    ).order_by('-sent_at').first()

                    ping_info = None
                    if recent_ping:
                        ping_info = {
                            'id': recent_ping.id,
                            'status': recent_ping.status,
                            'response': recent_ping.response,
                            'sent_at': recent_ping.sent_at.isoformat() if recent_ping.sent_at else None,
                            'responded_at': recent_ping.responded_at.isoformat() if recent_ping.responded_at else None,
                        }

                    results.append({
                        'session_id': s.id,
                        'driver': s.driver.username,
                        'driver_id': s.driver.id,
                        'vehicle': s.vehicle.plate_number,
                        'branch': s.branch.code,
                        'latitude': float(last_gps.latitude) if last_gps else None,
                        'longitude': float(last_gps.longitude) if last_gps else None,
                        'timestamp': last_gps.timestamp.isoformat() if last_gps else None,
                        'recent_points': valid_gps_points,
                        'total_points': len(valid_gps_points),
                        'recent_ping': ping_info,
                    })

                except Exception as e:
                    print(f"Error processing session {s.id}: {e}")
                    results.append({
                        'session_id': s.id,
                        'driver': s.driver.username,
                        'vehicle': s.vehicle.plate_number,
                        'branch': s.branch.code,
                        'latitude': None,
                        'longitude': None,
                        'timestamp': None,
                        'recent_points': [],
                        'total_points': 0,
                    })

            return Response(results)

        except Exception as e:
            print(f"Critical error in LiveLocationsView: {e}")
            return Response(
                {'error': 'Failed to load live locations', 'detail': str(e)},
                status=500
            )


# ---------- GPSLog ----------
class GPSLogViewSet(viewsets.ModelViewSet):
    """
    GPS logs. Driver can create only for their active session.
    Branch Admin / Super Admin can list/filter by session (branch-scoped).
    """
    serializer_class = GPSLogSerializer
    permission_classes = [IsDriver, BranchScopedPermission]

    def get_queryset(self):
        user = self.request.user
        qs = GPSLog.objects.all().select_related('session', 'session__driver', 'session__branch')
        if user.role == 'SUPER_ADMIN':
            return qs
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return qs.filter(session__branch_id=user.branch_id)
        if user.role == 'DRIVER':
            return qs.filter(session__driver_id=user.id)
        return qs.none()

    def perform_create(self, serializer):
        # Ensure driver can only create GPS logs for their own active session
        if self.request.user.role == 'DRIVER':
            session = serializer.validated_data.get('session')
            if session.driver_id != self.request.user.id:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('You can only add GPS logs to your own session.')
            if not session.is_active:
                from rest_framework.exceptions import ValidationError
                raise ValidationError('GPS can only be recorded for an active session.')
        serializer.save()


# ---------- IncidentReport ----------
class IncidentReportViewSet(viewsets.ModelViewSet):
    """Incident reports. Driver can create for own session; admins see branch-scoped."""
    serializer_class = IncidentReportSerializer
    permission_classes = [IsDriver, BranchScopedPermission]

    def get_queryset(self):
        user = self.request.user
        qs = IncidentReport.objects.all().select_related('session', 'session__driver', 'session__branch')
        if user.role == 'SUPER_ADMIN':
            return qs
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return qs.filter(session__branch_id=user.branch_id)
        if user.role == 'DRIVER':
            return qs.filter(session__driver_id=user.id)
        return qs.none()


# ---------- Ping ----------
class PingSendView(APIView):
    """Send ping to driver (Admin only)."""
    permission_classes = [IsSuperAdmin | IsBranchAdmin]

    def post(self, request):
        serializer = PingSendSerializer(data=request.data)
        if serializer.is_valid():
            driver_id = serializer.validated_data['driver_id']

            # Check if driver is in same branch (for Branch Admin)
            if request.user.role == 'BRANCH_ADMIN':
                driver = User.objects.get(pk=driver_id)
                if driver.branch_id != request.user.branch_id:
                    return Response(
                        {'error': 'You can only ping drivers in your branch.'},
                        status=status.HTTP_403_FORBIDDEN
                    )

            # Check cooldown (no ping in last 2 minutes)
            recent_ping = PingRequest.objects.filter(
                driver_id=driver_id,
                sent_at__gte=timezone.now() - timedelta(minutes=2)
            ).first()

            if recent_ping:
                return Response(
                    {'error': 'Driver was recently pinged. Please wait 2 minutes.'},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )

            ping = PingRequest.objects.create(
                sender=request.user,
                driver_id=driver_id
            )

            # Send push notification to driver
            try:
                success, message = send_ping_notification(
                    driver_id, 
                    request.user.username
                )
                if success:
                    ping.status = PingStatus.DELIVERED
                    ping.save()
            except Exception as e:
                # Log error but don't fail the ping creation
                print(f"Failed to send push notification: {e}")

            return Response(
                PingRequestSerializer(ping).data,
                status=status.HTTP_201_CREATED
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PingRespondView(APIView):
    """Respond to ping (Driver only)."""
    permission_classes = [IsDriver]

    def post(self, request):
        serializer = PingResponseSerializer(data=request.data)
        if serializer.is_valid():
            ping_id = serializer.validated_data['ping_id']
            response = serializer.validated_data['response']
            latitude = serializer.validated_data.get('latitude')
            longitude = serializer.validated_data.get('longitude')

            ping = PingRequest.objects.get(pk=ping_id)

            if ping.driver_id != request.user.id:
                return Response(
                    {'error': 'This ping is not for you.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            ping.status = PingStatus.RESPONDED
            ping.responded_at = timezone.now()
            ping.response = response
            if latitude and longitude:
                ping.response_location_lat = latitude
                ping.response_location_lon = longitude
            ping.save()

            return Response(
                {'message': 'Response recorded successfully.'},
                status=status.HTTP_200_OK
            )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PingActiveView(APIView):
    """Get active pings for current user."""
    permission_classes = [DRFIsAuthenticated]

    def get(self, request):
        user = request.user

        if user.role == 'DRIVER':
            pings = PingRequest.objects.filter(
                driver=user,
                status__in=[PingStatus.SENT, PingStatus.DELIVERED]
            ).order_by('-sent_at')
        else:
            pings = PingRequest.objects.filter(
                sender=user,
                status__in=[PingStatus.SENT, PingStatus.DELIVERED]
            ).order_by('-sent_at')

        serializer = PingRequestSerializer(pings, many=True)
        return Response(serializer.data)


# ---------- Video Call ----------
class VideoCallViewSet(viewsets.ModelViewSet):
    """
    Video call management for admin-to-driver communication.
    - Super Admin/Branch Admin: can initiate calls to drivers in their scope
    - All users: can view their own call history
    """
    serializer_class = VideoCallSerializer
    permission_classes = [DRFIsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return VideoCall.objects.all().select_related('initiator', 'recipient', 'session')
        elif user.role == 'BRANCH_ADMIN':
            # Branch admins can see calls involving their branch drivers
            return VideoCall.objects.filter(
                models.Q(recipient__branch=user.branch) | models.Q(initiator=user)
            ).select_related('initiator', 'recipient', 'session')
        else:
            # Drivers can only see their own calls
            return VideoCall.objects.filter(
                models.Q(initiator=user) | models.Q(recipient=user)
            ).select_related('initiator', 'recipient', 'session')
    
    @action(detail=False, methods=['post'])
    def initiate(self, request):
        """Initiate a video call to a driver"""
        if request.user.role not in ['SUPER_ADMIN', 'BRANCH_ADMIN']:
            return Response(
                {'detail': 'Only admins can initiate video calls.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = VideoCallInitiateSerializer(data=request.data)
        if serializer.is_valid():
            recipient_id = serializer.validated_data['recipient_id']
            session_id = serializer.validated_data.get('session_id')
            
            # Check if recipient is in scope for branch admin
            if request.user.role == 'BRANCH_ADMIN':
                recipient = User.objects.get(id=recipient_id)
                if recipient.branch_id != request.user.branch_id:
                    return Response(
                        {'detail': 'Cannot call driver outside your branch.'},
                        status=status.HTTP_403_FORBIDDEN
                    )
            
            # Create call record
            call = VideoCall.objects.create(
                initiator=request.user,
                recipient_id=recipient_id,
                session_id=session_id,
                status='RINGING'
            )
            
            return Response(
                VideoCallSerializer(call).data,
                status=status.HTTP_201_CREATED
            )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """Accept a video call"""
        call = self.get_object()
        
        if call.recipient != request.user:
            return Response(
                {'detail': 'Only call recipient can accept the call.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if call.status != 'RINGING':
            return Response(
                {'detail': 'Call cannot be accepted in current status.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        call.status = 'ACTIVE'
        call.save()
        
        return Response({'status': 'Call accepted'})
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a video call"""
        call = self.get_object()
        
        if call.recipient != request.user:
            return Response(
                {'detail': 'Only call recipient can reject the call.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if call.status != 'RINGING':
            return Response(
                {'detail': 'Call cannot be rejected in current status.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        call.status = 'REJECTED'
        call.ended_at = timezone.now()
        call.save()
        
        return Response({'status': 'Call rejected'})
    
    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        """End a video call"""
        call = self.get_object()
        
        if call.initiator != request.user and call.recipient != request.user:
            return Response(
                {'detail': 'Only call participants can end the call.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if call.status not in ['RINGING', 'ACTIVE']:
            return Response(
                {'detail': 'Call cannot be ended in current status.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        call.status = 'ENDED'
        call.ended_at = timezone.now()
        call.save()
        
        return Response({'status': 'Call ended'})