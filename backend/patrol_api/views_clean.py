# views_clean.py
"""
R.O.N.D.A. — API ViewSets.
- Driver: JWT login, start/stop session (single active), GPS only when session active.
- Branch Admin: view sessions and live vehicle locations for their branch.
- Super Admin: full access.
"""


from django.utils import timezone
from datetime import timedelta
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Branch, User, Vehicle, DriverSession, GPSLog, IncidentReport, PingRequest, PingStatus
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
)
from rest_framework.permissions import IsAuthenticated


# ---------- Ping Requests ----------
class PingSendView(APIView):
    """Send ping to driver (Admin only)."""
    permission_classes = [IsBranchAdmin]
    
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
            
            # Create ping request
            ping = PingRequest.objects.create(
                sender=request.user,
                driver_id=driver_id
            )
            
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
            
            # Get ping request
            ping = PingRequest.objects.get(pk=ping_id)
            
            # Verify this ping is for the current driver
            if ping.driver_id != request.user.id:
                return Response(
                    {'error': 'This ping is not for you.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Update ping with response
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
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        
        if user.role == 'DRIVER':
            # Get pings sent to this driver that haven't been responded to
            pings = PingRequest.objects.filter(
                driver=user,
                status__in=[PingStatus.SENT, PingStatus.DELIVERED]
            ).order_by('-sent_at')
        else:
            # Get pings sent by this admin that are still active
            pings = PingRequest.objects.filter(
                sender=user,
                status__in=[PingStatus.SENT, PingStatus.DELIVERED]
            ).order_by('-sent_at')
        
        serializer = PingRequestSerializer(pings, many=True)
        return Response(serializer.data)
