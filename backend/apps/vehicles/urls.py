from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VehiclePhotoSubmissionViewSet

router = DefaultRouter()
router.register(r'submissions', VehiclePhotoSubmissionViewSet, basename='vehiclephotosubmission')

app_name = 'vehicles'

urlpatterns = [
    path('', include(router.urls)),
]
