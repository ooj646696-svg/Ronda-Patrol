#!/usr/bin/env python
"""Check database for VehiclePhoto records"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from patrol_api.models_snapshots import VehiclePhoto
from apps.vehicles.models import VehiclePhotoSubmission

print("=" * 60)
print("DATABASE CHECK - Vehicle Photos")
print("=" * 60)

print(f"\n1. VehiclePhotoSubmission count: {VehiclePhotoSubmission.objects.count()}")
print(f"2. VehiclePhoto count: {VehiclePhoto.objects.count()}")
print(f"3. Photos with submission_id: {VehiclePhoto.objects.filter(submission_id__isnull=False).count()}")

print("\n" + "-" * 60)
print("SUBMISSIONS:")
print("-" * 60)
for sub in VehiclePhotoSubmission.objects.all()[:5]:
    print(f"  ID: {sub.id}, Driver: {sub.driver.username}, Photo Count: {sub.photo_count}")

print("\n" + "-" * 60)
print("PHOTOS (first 10):")
print("-" * 60)
for photo in VehiclePhoto.objects.all()[:10]:
    print(f"  ID: {photo.id}, Submission ID: {photo.submission_id}, Shot: {photo.shot_type}, Image: {photo.image}")

print("\n" + "=" * 60)
