"""
R.O.N.D.A. — API routes.
- /api/auth/ — JWT obtain & refresh
- /api/branches/ — Branch list/detail
- /api/users/ — User CRUD (Branch Admin: drivers of their branch only)
- /api/vehicles/ — Vehicle list/detail
- /api/sessions/ — DriverSession CRUD + start/stop
- /api/sessions/live/ — Live vehicle locations (last GPS per active session)
- /api/gps-logs/ — GPSLog CRUD
- /api/incidents/ — IncidentReport CRUD
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers_jwt import RondaTokenObtainPairSerializer
from .views import (
    BranchViewSet,
    UserViewSet,
    VehicleViewSet,
    DriverSessionViewSet,
    GPSLogViewSet,
    IncidentReportViewSet,
    LiveLocationsView,
    PingSendView,
    PingRespondView,
    PingActiveView,
    VideoCallViewSet,
)
from .notifications import (
    register_push_token,
    unregister_push_token,
    NotificationRegistrationView,
)

router = DefaultRouter()
router.register(r'branches', BranchViewSet, basename='branch')
router.register(r'users', UserViewSet, basename='user')
router.register(r'vehicles', VehicleViewSet, basename='vehicle')
router.register(r'sessions', DriverSessionViewSet, basename='session')
router.register(r'gps-logs', GPSLogViewSet, basename='gpslog')
router.register(r'incidents', IncidentReportViewSet, basename='incident')
router.register(r'video-calls', VideoCallViewSet, basename='videocall')

class RondaTokenObtainPairView(TokenObtainPairView):
    serializer_class = RondaTokenObtainPairSerializer


urlpatterns = [
    path('auth/token/', RondaTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('sessions/live/', LiveLocationsView.as_view(), name='live_locations'),
    path('ping/send/', PingSendView.as_view(), name='ping_send'),
    path('ping/respond/', PingRespondView.as_view(), name='ping_respond'),
    path('ping/active/', PingActiveView.as_view(), name='ping_active'),
    path('notifications/register/', register_push_token, name='register_push_token'),
    path('notifications/unregister/', unregister_push_token, name='unregister_push_token'),
    path('notifications/', NotificationRegistrationView.as_view(), name='notification_registration'),
    path('', include(router.urls)),
]
