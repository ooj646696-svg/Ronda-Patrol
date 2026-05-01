from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import VehiclePhotoSubmission, VehiclePhoto
from .serializers import (
    VehiclePhotoSubmissionSerializer,
    VehiclePhotoSubmissionCreateSerializer,
    VehiclePhotoSerializer
)


class VehiclePhotoSubmissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and editing vehicle photo submissions.
    """
    queryset = VehiclePhotoSubmission.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.action == 'create':
            return VehiclePhotoSubmissionCreateSerializer
        return VehiclePhotoSubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = VehiclePhotoSubmission.objects.all()
        
        # Filter by user role
        if user.role == 'DRIVER':
            queryset = queryset.filter(driver=user)
        elif user.role == 'BRANCH_ADMIN':
            queryset = queryset.filter(branch=user.branch)
        # SUPER_ADMIN sees all
        
        # Filter by parameters
        branch_id = self.request.query_params.get('branch_id')
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
            
        vehicle_id = self.request.query_params.get('vehicle_id')
        if vehicle_id:
            queryset = queryset.filter(vehicle_id=vehicle_id)
            
        photo_type = self.request.query_params.get('photo_type')
        if photo_type:
            queryset = queryset.filter(photo_type=photo_type)
            
        date_from = self.request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(submitted_at__date__gte=date_from)
            
        date_to = self.request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(submitted_at__date__lte=date_to)
            
        return queryset.select_related('driver', 'branch', 'vehicle')

    def perform_create(self, serializer):
        # Set driver and branch from authenticated user
        try:
            branch = self.request.user.branch
            if not branch:
                # Create or assign a default branch if user doesn't have one
                from patrol_api.models import Branch
                branch, created = Branch.objects.get_or_create(
                    id=1,
                    defaults={'name': 'Default Branch', 'location': 'Default Location'}
                )
                print(f"🔧 Using branch: {branch.name} (created: {created})")
            
            serializer.save(
                driver=self.request.user,
                branch=branch
            )
        except Exception as e:
            print(f"❌ Error in perform_create: {e}")
            # Fallback to any existing branch
            from patrol_api.models import Branch
            default_branch = Branch.objects.first()
            if default_branch:
                serializer.save(
                    driver=self.request.user,
                    branch=default_branch
                )
            else:
                raise Exception("No branch available for user")

    @action(detail=False, methods=['get'])
    def my_submissions(self, request):
        """Get current user's photo submissions"""
        submissions = self.get_queryset().filter(driver=request.user)
        page = self.paginate_queryset(submissions)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(submissions, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def snapshots(self, request):
        """Get snapshots for admin panel (SuperAdmin and BranchAdmin)"""
        try:
            print(f"🔍 DEBUG: snapshots called by user {request.user.username}, role: {getattr(request.user, 'role', 'unknown')}")
            
            if request.user.role not in ['SUPER_ADMIN', 'BRANCH_ADMIN']:
                return Response(
                    {'error': 'Permission denied'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            submissions = self.get_queryset()
            print(f"🔍 DEBUG: Found {submissions.count()} submissions")
            
            page = self.paginate_queryset(submissions)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)
            
            serializer = self.get_serializer(submissions, many=True)
            return Response(serializer.data)
            
        except Exception as e:
            print(f"❌ ERROR in snapshots: {str(e)}")
            import traceback
            print(f"❌ TRACEBACK: {traceback.format_exc()}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def photos(self, request, pk=None):
        """Get photos for a specific submission"""
        try:
            submission = self.get_object()
            print(f"🔍 DEBUG: Getting photos for submission {submission.id}")
            
            # photos is a property that returns filtered queryset
            photos = submission.photos
            print(f"🔍 DEBUG: Found {photos.count()} photos")
            
            serializer = VehiclePhotoSerializer(photos, many=True, context={'request': request})
            return Response(serializer.data)
        except Exception as e:
            print(f"❌ ERROR in photos endpoint: {str(e)}")
            import traceback
            print(f"❌ TRACEBACK: {traceback.format_exc()}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def mark_uploaded(self, request, pk=None):
        """Mark submission as successfully uploaded"""
        if request.user.role not in ['SUPER_ADMIN', 'BRANCH_ADMIN']:
            return Response(
                {'error': 'Permission denied'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        submission = self.get_object()
        submission.status = 'uploaded'
        submission.save()
        
        return Response({
            'message': 'Submission marked as uploaded',
            'status': submission.status
        })

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def batch_upload(self, request):
        """
        Batch upload photos from mobile app
        Handles multipart form data with files named photos[0][image], photos[0][shot_type], etc.
        """
        try:
            print(f"🔍 DEBUG: Received batch upload request")
            print(f"🔍 DEBUG: Content-Type: {request.content_type}")
            print(f"🔍 DEBUG: Request data keys: {list(request.data.keys())}")
            print(f"🔍 DEBUG: Request files: {list(request.FILES.keys())}")
            
            vehicle_id = request.data.get('vehicle_id')
            photo_type = request.data.get('photo_type')
            captured_at = request.data.get('captured_at')
            shift_id = request.data.get('shift_id')
            
            print(f"🔍 DEBUG: vehicle_id={vehicle_id}, photo_type={photo_type}")
            
            if not vehicle_id or not photo_type:
                print(f"❌ ERROR: Missing vehicle_id or photo_type")
                return Response(
                    {'error': 'vehicle_id and photo_type are required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Validate vehicle
            from patrol_api.models import Vehicle
            vehicle = get_object_or_404(Vehicle, id=vehicle_id)
            print(f" DEBUG: Found vehicle: {vehicle.plate_number}")
            
            # Count photo files
            photo_files = [k for k in request.FILES.keys() if '[image]' in k]
            print(f"🔍 DEBUG: Found {len(photo_files)} photo files: {photo_files}")
            
            # Create submission
            submission = VehiclePhotoSubmission.objects.create(
                driver=request.user,
                branch=request.user.branch,
                vehicle=vehicle,
                photo_type=photo_type,
                captured_at=captured_at or timezone.now(),
                shift_id=shift_id,
                photo_count=len(photo_files),
                status='uploaded'
            )
            print(f" DEBUG: Created submission: {submission.id}")
            
            # Process each photo file
            from patrol_api.models_snapshots import VehiclePhoto
            created_photos = []
            
            for file_key in photo_files:
                # Extract index from key like "photos[0][image]"
                import re
                match = re.match(r'photos\[(\d+)\]\[image\]', file_key)
                if match:
                    index = match.group(1)
                    photo_file = request.FILES[file_key]
                    
                    # Get metadata from corresponding fields
                    shot_type = request.data.get(f'photos[{index}][shot_type]', f'photo_{index}')
                    latitude = request.data.get(f'photos[{index}][latitude]')
                    longitude = request.data.get(f'photos[{index}][longitude]')
                    notes = request.data.get(f'photos[{index}][notes]', '')
                    photo_captured_at = request.data.get(f'photos[{index}][captured_at]', captured_at)
                    
                    print(f"🔍 DEBUG: Processing photo {index}: {shot_type}, file: {photo_file.name}, size: {photo_file.size}")
                    
                    try:
                        photo = VehiclePhoto.objects.create(
                            vehicle=vehicle,
                            officer=request.user,
                            shift_id=shift_id,
                            submission_id=submission.id,
                            photo_type=photo_type,
                            shot_type=shot_type,
                            image=photo_file,
                            latitude=latitude,
                            longitude=longitude,
                            notes=notes,
                            captured_at=photo_captured_at or timezone.now(),
                            file_size=photo_file.size
                        )
                        created_photos.append(photo)
                        print(f" DEBUG: Created photo {index}: {photo.shot_type} (ID: {photo.id})")
                    except Exception as photo_error:
                        print(f"❌ ERROR creating photo {index}: {str(photo_error)}")
                        import traceback
                        print(f"❌ TRACEBACK: {traceback.format_exc()}")
            
            print(f" DEBUG: Created {len(created_photos)} photos total")
            
            # Update submission with actual photo count
            submission.photo_count = len(created_photos)
            submission.save()
            
            # Return response with submission details
            serializer = VehiclePhotoSubmissionSerializer(submission, context={'request': request})
            return Response({
                'message': 'Photos uploaded successfully',
                'submission': serializer.data,
                'photo_count': len(created_photos)
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            print(f"❌ ERROR in batch_upload: {str(e)}")
            import traceback
            print(f"❌ TRACEBACK: {traceback.format_exc()}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
