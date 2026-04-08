"""
URL patterns for Vehicle Snapshot System
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views_snapshots

router = DefaultRouter()
router.register(r'photos', views_snapshots.VehiclePhotoViewSet, basename='vehicle-photos')
router.register(r'requirements', views_snapshots.PhotoRequirementViewSet, basename='photo-requirements')
router.register(r'damage-reports', views_snapshots.DamageReportViewSet, basename='damage-reports')

urlpatterns = [
    path('vehicle-photos/', include(router.urls)),
]
