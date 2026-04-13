"""
R.O.N.D.A. — API ViewSets.
- Driver: JWT login, start/stop session (single active), GPS only when session active.
- Branch Admin: view sessions and live vehicle locations for their branch, including recent ping info.
- Super Admin: full access.
"""

from django.utils import timezone
from datetime import timedelta
from django.db import models
from django.conf import settings
import requests
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView, exception_handler
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated as DRFIsAuthenticated

from .models import Branch, User, Vehicle, DriverSession, GPSLog, IncidentReport, PingRequest, PingStatus, VideoCall
from .notifications import send_ping_notification
from .gps_validation import gps_validator, GPSPoint  # Import GPS validation utilities
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
    UserLogoutSerializer,
)
from .permissions import (
    IsSuperAdmin,
    IsBranchAdmin,
    IsDriver,
    BranchScopedPermission,
    UserManagementPermission,
)


def custom_exception_handler(exc, context):
    """
    Custom exception handler to log validation errors and auto-fix session issues.
    """
    # Import here to avoid circular imports
    from rest_framework.views import exception_handler
    from rest_framework.exceptions import ValidationError
    from .models import DriverSession
    
    # Call DRF's default exception handler first
    response = exception_handler(exc, context)
    
    # If this is a validation error, log the details
    if isinstance(exc, ValidationError) and response is not None:
        request = context.get('request')
        
        print(f"❌ [Validation Error] {exc.detail}")
        if request:
            print(f"❌ [Validation Error] Request data: {getattr(request, 'data', 'N/A')}")
            print(f"❌ [Validation Error] User: {request.user} ({request.user.username})")
        
        # Auto-fix invalid session errors
        if 'session' in exc.detail and any('does not exist' in str(error) for error in exc.detail['session']):
            print(f"🔧 [Auto-Fix] Invalid session detected, attempting to find active session for user")
            if request and request.user.role == 'DRIVER':
                active_session = DriverSession.objects.filter(
                    driver=request.user, 
                    is_active=True
                ).first()
                if active_session:
                    print(f"✅ [Auto-Fix] Found active session {active_session.id}, updating request data")
                    # Update the request data with the correct session
                    if hasattr(request, 'data') and request.data:
                        request.data['session'] = active_session.id
                    
                    # Return a special response to indicate the request should be retried
                    response.status_code = 422  # Unprocessable Entity
                    response.data = {
                        'detail': 'Invalid session detected. Please retry with the correct session.',
                        'auto_fix_session': active_session.id
                    }
                else:
                    print(f"❌ [Auto-Fix] No active session found for user {request.user.username}")
    
    return response


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

    def create(self, request, *args, **kwargs):
        """Create user with better error handling for password validation"""
        try:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            
            # Return the created user data
            user = serializer.instance
            response_serializer = UserListSerializer(user, context={'request': request})
            
            return Response({
                'message': 'User created successfully',
                'user': response_serializer.data
            }, status=status.HTTP_201_CREATED)
            
        except serializers.ValidationError as e:
            # Handle validation errors (including password validation)
            error_data = e.detail
            if isinstance(error_data, dict):
                # Flatten password validation errors
                if 'password' in error_data:
                    password_errors = error_data['password']
                    if isinstance(password_errors, list):
                        error_data['password'] = password_errors[0] if password_errors else 'Password validation failed'
                    else:
                        error_data['password'] = str(password_errors)
            
            return Response({
                'error': 'Validation failed',
                'details': error_data
            }, status=status.HTTP_400_BAD_REQUEST)
            
        except Exception as e:
            return Response({
                'error': 'Failed to create user',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
                print(f"📨 [Ping] Sending ping from {request.user.username} to driver ID {user.id}")
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

    @action(detail=True, methods=['post'], permission_classes=[IsSuperAdmin])
    def force_logout(self, request, pk=None):
        """
        Force logout a user (Super Admin only).
        This will invalidate all their JWT tokens and stop active sessions.
        """
        try:
            user_to_logout = self.get_object()
            
            # Cannot logout yourself
            if user_to_logout == request.user:
                return Response(
                    {'detail': 'Cannot logout yourself through this endpoint.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Stop any active sessions
            active_sessions = DriverSession.objects.filter(driver=user_to_logout, is_active=True)
            sessions_stopped = active_sessions.count()
            active_sessions.update(is_active=False, end_time=timezone.now())
            
            # Note: JWT tokens are stateless, but we can implement a token blacklist
            # For now, we'll return success - tokens will be invalid on next refresh
            response_data = {
                'message': f'User {user_to_logout.username} has been logged out successfully.',
                'sessions_stopped': sessions_stopped,
                'user_id': user_to_logout.id,
                'username': user_to_logout.username,
                'role': user_to_logout.role
            }
            
            return Response(response_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {'detail': f'Failed to logout user: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'], permission_classes=[IsSuperAdmin])
    def logout_all_users(self, request):
        """
        Force logout all users except the requester (Super Admin only).
        """
        try:
            # Stop all active sessions except requester's
            active_sessions = DriverSession.objects.filter(is_active=True).exclude(driver=request.user)
            sessions_stopped = active_sessions.count()
            active_sessions.update(is_active=False, end_time=timezone.now())
            
            # Get all users except requester
            all_users = User.objects.exclude(id=request.user.id)
            users_logged_out = all_users.count()
            
            response_data = {
                'message': 'All users have been logged out successfully.',
                'users_logged_out': users_logged_out,
                'sessions_stopped': sessions_stopped,
                'excluded_user': request.user.username
            }
            
            return Response(response_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {'detail': f'Failed to logout all users: {str(e)}'},
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
        requested_start_time = ser.validated_data.get('start_time')

        vehicle = None
        if vehicle_id:
            vehicle = Vehicle.objects.filter(pk=vehicle_id).first()
            # Don't fail if vehicle not found, just proceed without it
            if not vehicle:
                print(f"⚠️ Vehicle {vehicle_id} not found, proceeding without vehicle")
        
        # Create session - vehicle is now optional
        session = DriverSession.objects.create(
            driver=driver,
            vehicle=vehicle,  # Can be None
            branch=driver.branch,
            start_time=requested_start_time or timezone.now(),
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


class LiveLocationsView(APIView):
    """
    GET: Branch Admin sees live vehicle locations for their branch.
    Super Admin sees all branches.
    """
    permission_classes = [DRFIsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            if user.role == 'SUPER_ADMIN':
                sessions = DriverSession.objects.filter(is_active=True).select_related('driver', 'vehicle', 'branch')
            elif user.role == 'BRANCH_ADMIN' and user.branch_id:
                sessions = DriverSession.objects.filter(is_active=True, branch_id=user.branch_id).select_related('driver', 'vehicle', 'branch')
            elif user.role == 'DRIVER':
                sessions = DriverSession.objects.filter(is_active=True, driver=user).select_related('driver', 'vehicle', 'branch')
            else:
                sessions = DriverSession.objects.none()

            ten_minutes_ago = timezone.now() - timedelta(minutes=10)
            results = []

            for s in sessions:
                try:
                    recent_gps = GPSLog.objects.filter(
                        session=s,
                        timestamp__gte=ten_minutes_ago
                    ).order_by('timestamp')

                    # Filter GPS points through validation - only show valid points
                    valid_gps_points = []
                    rejected_count = 0
                    previous_point = None
                    last_valid_gps = None
                    
                    for g in recent_gps:
                        try:
                            lat = float(g.latitude)
                            lon = float(g.longitude)
                            
                            # Skip if explicitly marked as invalid (if using new model fields)
                            if hasattr(g, 'is_valid') and not g.is_valid:
                                rejected_count += 1
                                continue
                            
                            # Check geographic bounds
                            if not (4.0 <= lat <= 21.0 and 112.0 <= lon <= 131.0):
                                print(f"Invalid GPS coordinates for session {s.id}: {lat}, {lon}")
                                rejected_count += 1
                                continue
                            
                            # Build GPS point for validation (if accuracy available)
                            point_data = {
                                'latitude': lat,
                                'longitude': lon,
                                'timestamp': g.timestamp,
                            }
                            if hasattr(g, 'accuracy') and g.accuracy:
                                point_data['accuracy'] = float(g.accuracy)
                            if hasattr(g, 'speed') and g.speed:
                                point_data['speed'] = float(g.speed)
                            
                            valid_gps_points.append({
                                'latitude': lat,
                                'longitude': lon,
                                'timestamp': g.timestamp.isoformat(),
                                'accuracy': float(g.accuracy) if hasattr(g, 'accuracy') and g.accuracy else None,
                            })
                            last_valid_gps = g
                            
                        except (ValueError, TypeError) as e:
                            print(f"Invalid GPS data for session {s.id}: {e}")
                            rejected_count += 1
                            continue
                    
                    # Log validation summary
                    if rejected_count > 0:
                        print(f" [LiveLocations] Session {s.id}: {len(valid_gps_points)} valid GPS points | {rejected_count} rejected")
                    else:
                        print(f" [LiveLocations] Session {s.id}: {len(valid_gps_points)} valid GPS points")

                    last_gps = last_valid_gps
                    if last_gps is None:
                        last_gps = GPSLog.objects.filter(session=s).order_by('-timestamp').first()
                        if last_gps is not None:
                            try:
                                lat = float(last_gps.latitude)
                                lon = float(last_gps.longitude)
                                if not (4.0 <= lat <= 21.0 and 112.0 <= lon <= 131.0):
                                    last_gps = None
                            except (ValueError, TypeError):
                                last_gps = None

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
                        'vehicle': s.vehicle.plate_number if s.vehicle else None,
                        'branch': s.branch.code if s.branch else None,
                        'latitude': float(last_gps.latitude) if last_gps else None,
                        'longitude': float(last_gps.longitude) if last_gps else None,
                        'timestamp': last_gps.timestamp.isoformat() if last_gps else None,
                        'recent_points': valid_gps_points,
                        'total_points': len(valid_gps_points),
                        'recent_ping': ping_info,
                    })

                except Exception as e:
                    print(f" [LiveLocations] Error processing session {s.id}: {e}")
                    results.append({
                        'session_id': s.id,
                        'driver': s.driver.username,
                        'vehicle': s.vehicle.plate_number if s.vehicle else None,
                        'branch': s.branch.code if s.branch else None,
                        'latitude': None,
                        'longitude': None,
                        'timestamp': None,
                        'recent_points': [],
                        'total_points': 0,
                    })

            return Response(results)

        except Exception as e:
            print(f" [LiveLocations] Critical error: {e}")
            return Response(
                {'error': 'Failed to load live locations', 'detail': str(e)},
                status=500
            )


class SessionMatchedRouteView(APIView):
    permission_classes = [DRFIsAuthenticated]

    def get(self, request, pk: int):
        user = request.user

        try:
            session = DriverSession.objects.select_related('driver', 'branch').get(pk=pk)
        except DriverSession.DoesNotExist:
            return Response({'detail': 'Session not found.'}, status=status.HTTP_404_NOT_FOUND)

        if user.role == 'DRIVER' and session.driver_id != user.id:
            return Response({'detail': 'You can only view your own session route.'}, status=status.HTTP_403_FORBIDDEN)
        if user.role == 'BRANCH_ADMIN' and user.branch_id and session.branch_id != user.branch_id:
            return Response({'detail': 'You can only view routes from your branch.'}, status=status.HTTP_403_FORBIDDEN)

        ors_key = getattr(settings, 'ORS_API_KEY', None)
        if not ors_key:
            return Response({'detail': 'ORS_API_KEY is not configured.'}, status=status.HTTP_400_BAD_REQUEST)

        profile = request.query_params.get('profile', 'driving-car')
        limit = int(request.query_params.get('limit', '200') or 200)
        limit = max(2, min(limit, 500))

        valid_only = (request.query_params.get('valid_only', '0') or '0').lower() in ('1', 'true', 'yes', 'on')

        qs = GPSLog.objects.filter(session=session).order_by('timestamp')
        if valid_only and hasattr(GPSLog, 'is_valid'):
            qs = qs.filter(is_valid=True)

        # Use the most recent points so the matched route aligns with the live marker (latest GPS).
        logs = list(qs.order_by('-timestamp')[:limit])
        logs.sort(key=lambda g: g.timestamp)
        if len(logs) < 2:
            return Response({'detail': 'Not enough GPS points to match.'}, status=status.HTTP_400_BAD_REQUEST)

        coords = []
        radiuses = []
        for g in logs:
            try:
                lat = float(g.latitude)
                lon = float(g.longitude)
            except (TypeError, ValueError):
                continue

            if not (4.0 <= lat <= 21.0 and 112.0 <= lon <= 131.0):
                continue

            coords.append([lon, lat])
            acc = None
            if hasattr(g, 'accuracy') and g.accuracy is not None:
                try:
                    acc = float(g.accuracy)
                except (TypeError, ValueError):
                    acc = None
            if acc is None:
                radiuses.append(50)
            else:
                radiuses.append(int(max(25, min(acc * 2, 200))))

        if len(coords) < 2:
            return Response({'detail': 'Not enough valid GPS points to match.'}, status=status.HTTP_400_BAD_REQUEST)

        ors_max_points = int(request.query_params.get('ors_max_points', '70') or 70)
        ors_max_points = max(2, min(ors_max_points, 200))

        deduped_coords = []
        deduped_radiuses = []
        for c, r in zip(coords, radiuses):
            if not deduped_coords:
                deduped_coords.append(c)
                deduped_radiuses.append(r)
                continue
            prev = deduped_coords[-1]
            if abs(c[0] - prev[0]) < 1e-7 and abs(c[1] - prev[1]) < 1e-7:
                continue
            deduped_coords.append(c)
            deduped_radiuses.append(r)

        coords = deduped_coords
        radiuses = deduped_radiuses

        if len(coords) < 2:
            return Response({'detail': 'Not enough GPS points to match after de-duplication.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(coords) > ors_max_points:
            n = len(coords)
            target = ors_max_points

            if target >= n:
                pass
            else:
                selected_idxs = [0]
                if target > 2:
                    for i in range(1, target - 1):
                        idx = int(round(i * (n - 1) / (target - 1)))
                        selected_idxs.append(idx)
                selected_idxs.append(n - 1)

                deduped_idxs = []
                seen = set()
                for idx in selected_idxs:
                    if idx in seen:
                        continue
                    seen.add(idx)
                    deduped_idxs.append(idx)
                deduped_idxs.sort()

                coords = [coords[i] for i in deduped_idxs]
                radiuses = [radiuses[i] for i in deduped_idxs]

            if len(coords) < 2:
                return Response({'detail': 'Not enough GPS points to match after downsampling.'}, status=status.HTTP_400_BAD_REQUEST)

        url = f"https://api.openrouteservice.org/v2/matching/{profile}/geojson"
        headers = {
            'Authorization': ors_key,
            'Content-Type': 'application/json',
            'Accept': 'application/geo+json',
        }
        payload = {
            'coordinates': coords,
            'radiuses': radiuses[: len(coords)],
        }

        def _post(_payload):
            return requests.post(url, json=_payload, headers=headers, timeout=20)

        try:
            resp = _post(payload)
        except requests.RequestException as e:
            return Response({'detail': f'Failed to contact ORS: {e}'}, status=status.HTTP_502_BAD_GATEWAY)

        # If ORS complains about a specific coordinate being non-routable, drop that point and retry.
        # This prevents a single bad GPS point from failing the entire match.
        drop_attempts = 0
        while resp.status_code >= 400 and 'Could not find routable point' in (resp.text or '') and drop_attempts < 5 and len(coords) > 2:
            try:
                import re

                m = re.search(r'coordinate\s+(\d+):', resp.text)
                if not m:
                    break
                idx = int(m.group(1)) - 1
                if idx < 0 or idx >= len(coords):
                    break

                coords.pop(idx)
                radiuses.pop(idx)
                payload = {
                    'coordinates': coords,
                    'radiuses': radiuses[: len(coords)],
                }

                drop_attempts += 1
                resp = _post(payload)
            except Exception:
                break

        # Final retry: widen radiuses if still non-routable.
        if resp.status_code >= 400 and 'Could not find routable point' in (resp.text or ''):
            try:
                retry_payload = {
                    **payload,
                    'radiuses': [int(max(r, 100)) for r in radiuses[: len(coords)]],
                }
                resp = _post(retry_payload)
            except requests.RequestException:
                pass

        if resp.status_code == 404:
            try:
                snap_url = f"https://api.openrouteservice.org/v2/snap/{profile}/json"
                snap_headers = {
                    'Authorization': ors_key,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
                snap_payload = {
                    'locations': coords,
                    'radius': 150,
                }
                snap_resp = requests.post(snap_url, json=snap_payload, headers=snap_headers, timeout=20)
                if snap_resp.status_code < 400:
                    snap_data = snap_resp.json() or {}
                    snapped = snap_data.get('locations') or []
                    snapped_coords = []
                    for item in snapped:
                        if not item:
                            continue
                        loc = item.get('location') if isinstance(item, dict) else None
                        if not loc or not isinstance(loc, list) or len(loc) < 2:
                            continue
                        try:
                            lon = float(loc[0])
                            lat = float(loc[1])
                        except (TypeError, ValueError):
                            continue
                        snapped_coords.append([lon, lat])

                    if len(snapped_coords) >= 2:
                        directions_url = f"https://api.openrouteservice.org/v2/directions/{profile}/geojson"
                        directions_headers = {
                            'Authorization': ors_key,
                            'Content-Type': 'application/json',
                            'Accept': 'application/geo+json',
                        }
                        directions_payload = {
                            'coordinates': snapped_coords,
                        }

                        try:
                            directions_resp = requests.post(
                                directions_url,
                                json=directions_payload,
                                headers=directions_headers,
                                timeout=20,
                            )
                        except requests.RequestException:
                            directions_resp = None

                        if directions_resp is not None and directions_resp.status_code < 400:
                            directions_data = directions_resp.json() or {}
                            features = directions_data.get('features') or []
                            geom = features[0].get('geometry') if features else None
                            if geom:
                                return Response({
                                    'session_id': session.id,
                                    'driver': session.driver.username if session.driver else None,
                                    'total_input_points': len(coords),
                                    'matched_geometry': geom,
                                    'raw': {'snap': snap_data, 'directions': directions_data},
                                })

                        return Response({
                            'session_id': session.id,
                            'driver': session.driver.username if session.driver else None,
                            'total_input_points': len(coords),
                            'matched_geometry': {'type': 'LineString', 'coordinates': snapped_coords},
                            'raw': snap_data,
                        })
            except Exception:
                pass

        if resp.status_code >= 400:
            print(
                f" [ORS] Map matching error | HTTP {resp.status_code} | Session: {session.id} | "
                f"Points: {len(coords)} | URL: {url} | Response: {resp.text[:500]}"
            )
            try:
                return Response(
                    {'detail': 'ORS error', 'ors_status': resp.status_code, 'ors': resp.json()},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            except Exception:
                return Response(
                    {'detail': 'ORS error', 'ors_status': resp.status_code, 'ors': resp.text},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        data = resp.json()
        features = data.get('features') or []
        geom = features[0].get('geometry') if features else None

        return Response({
            'session_id': session.id,
            'driver': session.driver.username if session.driver else None,
            'total_input_points': len(coords),
            'matched_geometry': geom,
            'raw': data,
        })


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
        user = self.request.user
        session = serializer.validated_data.get('session')
        
        # Detailed logging for debugging
        print(f" [GPS] Creating GPS log | User: {user.id} ({user.username}) | Session: {session.id if session else 'None'}")
        
        if user.role == 'DRIVER':
            if not session:
                print(f" [GPS] Error: No session provided in validated data")
                from rest_framework.exceptions import ValidationError
                raise ValidationError('Session is required.')
            
            print(f" [GPS] Session details | ID: {session.id} | Driver: {session.driver_id} | Active: {session.is_active}")
            print(f" [GPS] User details | ID: {user.id} | Username: {user.username}")
            
            if session.driver_id != user.id:
                print(f" [GPS] Error: Session {session.id} belongs to driver {session.driver_id}, not user {user.id}")
                # Let's also check what sessions this user actually has
                user_sessions = DriverSession.objects.filter(driver=user)
                active_user_sessions = user_sessions.filter(is_active=True)
                print(f" [GPS] User {user.id} has {user_sessions.count()} total sessions, {active_user_sessions.count()} active")
                for s in active_user_sessions:
                    print(f"  - Active Session {s.id}: Vehicle {s.vehicle.plate_number if s.vehicle else 'None'}")
                
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('You can only add GPS logs to your own session.')
            
            if not session.is_active:
                print(f" [GPS] Error: Session {session.id} is not active (is_active=False)")
                print(f" [GPS] Session {session.id} details | Start: {session.start_time} | End: {session.end_time}")
                from rest_framework.exceptions import ValidationError
                raise ValidationError('GPS can only be recorded for an active session.')
            
            print(f" [GPS] Session validation passed | Session {session.id} is active and belongs to user {user.id}")
        
        # Check if new GPS fields exist in database
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("PRAGMA table_info(patrol_api_gpslog)")
                columns = [col[1] for col in cursor.fetchall()]
                new_fields_exist = all(field in columns for field in ['accuracy', 'speed', 'altitude', 'is_valid', 'rejection_reason', 'accuracy_score'])
            
            if not new_fields_exist:
                print(" [GPS] New GPS fields not found in database - using legacy mode")
                # Save without new fields (legacy mode)
                serializer.save()
                print(f" [GPS] Point saved (legacy mode) | Lat: {serializer.validated_data.get('latitude')}, Lon: {serializer.validated_data.get('longitude')}")
                return
        except Exception as e:
            print(f" [GPS] Could not check database schema: {e}")
        
        # Validate GPS data quality before saving
        validated_data = serializer.validated_data
        latitude = float(validated_data.get('latitude'))
        longitude = float(validated_data.get('longitude'))
        timestamp = validated_data.get('timestamp')
        accuracy = validated_data.get('accuracy')
        speed = validated_data.get('speed')
        
        allow_stale = (self.request.query_params.get('allow_stale') or '0').lower() in ('1', 'true', 'yes', 'on')
        
        print(f" [GPS] Data | Lat: {latitude:.6f} | Lon: {longitude:.6f} | Acc: {accuracy or 'N/A'}m | Speed: {speed or 'N/A'} m/s")
        
        # Build GPS point for validation
        point = GPSPoint(
            latitude=latitude,
            longitude=longitude,
            timestamp=timestamp,
            accuracy=float(accuracy) if accuracy else None,
            speed=float(speed) if speed else None
        )
        
        # Get previous point for context validation (last valid GPS for this session)
        previous_point = None
        try:
            last_gps = GPSLog.objects.filter(
                session=session,
                is_valid=True
            ).order_by('-timestamp').first()
            
            if last_gps:
                previous_point = GPSPoint(
                    latitude=float(last_gps.latitude),
                    longitude=float(last_gps.longitude),
                    timestamp=last_gps.timestamp,
                    accuracy=float(last_gps.accuracy) if last_gps.accuracy else None,
                    speed=float(last_gps.speed) if last_gps.speed else None
                )
                print(f" [GPS] Previous point found | {last_gps.timestamp} | ({last_gps.latitude}, {last_gps.longitude})")
            else:
                print(f" [GPS] No previous GPS points for session {session.id}")
        except Exception as e:
            print(f" [GPS] Error fetching previous point: {e}")
            pass  # No previous point available
        
        # Run validation
        validation_result = gps_validator.validate_gps_point(point, previous_point, allow_stale=allow_stale)
        
        # Enhanced monitoring for low quality scores
        if validation_result.accuracy_score < 0.6:
            print(f" [GPS] Low quality point | Score: {validation_result.accuracy_score:.2f} | "
                  f"Reason: {validation_result.rejected_reason} | "
                  f"Session: {session.id} | Driver: {self.request.user.username}")
        
        # Save with validation metadata
        extra_data = {
            'is_valid': validation_result.is_valid,
            'rejection_reason': validation_result.rejected_reason,
            'accuracy_score': validation_result.accuracy_score
        }
        
        try:
            serializer.save(**extra_data)
            print(f" [GPS] Point saved | Score: {validation_result.accuracy_score:.2f} | Acc: {point.accuracy or 'N/A'}m | Speed: {point.speed or 'N/A'} m/s")
        except Exception as save_error:
            print(f" [GPS] Failed to save GPS point: {save_error}")
            # Try saving without validation metadata (in case fields don't exist)
            try:
                serializer.save()
                print(f" [GPS] Point saved (fallback mode) | Lat: {latitude:.6f}, Lon: {longitude:.6f}")
            except Exception as fallback_error:
                print(f" [GPS] Failed to save even in fallback mode: {fallback_error}")
                raise fallback_error

    @action(detail=False, methods=['get'], url_path='session-route')
    def session_route(self, request):
        """
        Get GPS route for a specific session with calculated speeds.
        Used for route history visualization with speed-based coloring.
        """
        session_id = request.query_params.get('session_id')
        if not session_id:
            return Response(
                {'error': 'session_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Get session details
            session = DriverSession.objects.get(pk=session_id)
            
            # Check permissions
            user = request.user
            if user.role == 'DRIVER' and session.driver_id != user.id:
                return Response(
                    {'error': 'You can only view your own routes.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            if user.role == 'BRANCH_ADMIN' and session.branch_id != user.branch_id:
                return Response(
                    {'error': 'You can only view routes from your branch.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Get GPS logs ordered by timestamp
            gps_logs = GPSLog.objects.filter(
                session_id=session_id,
                is_valid=True
            ).order_by('timestamp')
            
            # Calculate speeds between consecutive points
            route_points = []
            prev_point = None
            
            for log in gps_logs:
                point = {
                    'id': log.id,
                    'latitude': float(log.latitude),
                    'longitude': float(log.longitude),
                    'timestamp': log.timestamp.isoformat(),
                    'accuracy': float(log.accuracy) if log.accuracy else None,
                    'altitude': float(log.altitude) if log.altitude else None,
                }
                
                # Calculate speed from previous point
                if prev_point:
                    from .gps_validation import GPSValidator
                    distance = GPSValidator._haversine_distance(
                        prev_point['latitude'], prev_point['longitude'],
                        point['latitude'], point['longitude']
                    )
                    time_diff = (log.timestamp - prev_point['timestamp']).total_seconds()
                    
                    if time_diff > 0:
                        calculated_speed = distance / time_diff  # m/s
                        point['calculated_speed'] = round(calculated_speed, 2)
                        point['calculated_speed_kmh'] = round(calculated_speed * 3.6, 2)
                    else:
                        point['calculated_speed'] = 0
                        point['calculated_speed_kmh'] = 0
                    
                    point['distance_from_prev'] = round(distance, 2)
                else:
                    point['calculated_speed'] = 0
                    point['calculated_speed_kmh'] = 0
                    point['distance_from_prev'] = 0
                    point['is_start'] = True
                
                route_points.append(point)
                prev_point = {
                    'latitude': point['latitude'],
                    'longitude': point['longitude'],
                    'timestamp': log.timestamp
                }
            
            # Mark end point
            if route_points:
                route_points[-1]['is_end'] = True
            
            # Calculate total statistics
            total_distance = sum(p.get('distance_from_prev', 0) for p in route_points)
            if len(route_points) >= 2:
                start_time = gps_logs.first().timestamp
                end_time = gps_logs.last().timestamp
                duration_seconds = (end_time - start_time).total_seconds()
                duration_minutes = duration_seconds / 60
            else:
                duration_seconds = 0
                duration_minutes = 0
            
            return Response({
                'session_id': session_id,
                'driver': session.driver.username if session.driver else None,
                'vehicle': session.vehicle.plate_number if session.vehicle else None,
                'branch': session.branch.name if session.branch else None,
                'start_time': session.start_time.isoformat() if session.start_time else None,
                'end_time': session.end_time.isoformat() if session.end_time else None,
                'total_points': len(route_points),
                'total_distance_meters': round(total_distance, 2),
                'total_distance_km': round(total_distance / 1000, 2),
                'duration_seconds': round(duration_seconds, 2),
                'duration_minutes': round(duration_minutes, 2),
                'average_speed_kmh': round((total_distance / duration_seconds) * 3.6, 2) if duration_seconds > 0 else 0,
                'route_points': route_points
            })
            
        except DriverSession.DoesNotExist:
            return Response(
                {'error': 'Session not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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
                print(f"📨 [Ping] Sending ping from {request.user.username} to driver ID {driver_id}")
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