from patrol_api.models_snapshots import VehiclePhoto
from apps.vehicles.models import VehiclePhotoSubmission

print(f"VehiclePhoto records: {VehiclePhoto.objects.count()}")
print(f"Submissions: {VehiclePhotoSubmission.objects.count()}")

# Check if any photos have submission_id
photos_with_submission = VehiclePhoto.objects.filter(submission_id__isnull=False)
print(f"Photos with submission_id: {photos_with_submission.count()}")

# Show submissions
for sub in VehiclePhotoSubmission.objects.all():
    print(f"Submission {sub.id}: driver={sub.driver.username}, photos count={sub.photo_count}")
    
# Show some photos
for photo in VehiclePhoto.objects.all()[:5]:
    print(f"Photo {photo.id}: submission_id={photo.submission_id}, shot={photo.shot_type}, image={photo.image}")
