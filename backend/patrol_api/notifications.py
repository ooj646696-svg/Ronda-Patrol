"""
Push notification management for R.O.N.D.A.
"""
import requests
from django.conf import settings
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import User, PushToken

# Expo Push Notification API URL
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

class NotificationRegistrationView(APIView):
    """Register/unregister push tokens for users"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Register a push token for the authenticated user"""
        push_token = request.data.get('push_token')
        
        if not push_token:
            return Response(
                {'error': 'push_token is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create or update push token
        token_obj, created = PushToken.objects.get_or_create(
            user=request.user,
            defaults={'token': push_token}
        )
        
        if not created:
            token_obj.token = push_token
            token_obj.is_active = True
            token_obj.save()
        
        return Response({
            'message': 'Push token registered successfully',
            'created': created
        })

    def delete(self, request):
        """Unregister a push token"""
        push_token = request.data.get('push_token')
        
        if not push_token:
            return Response(
                {'error': 'push_token is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            token_obj = PushToken.objects.get(
                user=request.user, 
                token=push_token
            )
            token_obj.is_active = False
            token_obj.save()
            
            return Response({'message': 'Push token unregistered'})
        except PushToken.DoesNotExist:
            return Response(
                {'error': 'Push token not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def register_push_token(request):
    """Register a push token (legacy endpoint)"""
    push_token = request.data.get('push_token')
    
    if not push_token:
        return JsonResponse(
            {'error': 'push_token is required'}, 
            status=400
        )
    
    # Create or update push token
    token_obj, created = PushToken.objects.get_or_create(
        user=request.user,
        defaults={'token': push_token}
    )
    
    if not created:
        token_obj.token = push_token
        token_obj.is_active = True
        token_obj.save()
    
    return JsonResponse({
        'message': 'Push token registered successfully',
        'created': created
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def unregister_push_token(request):
    """Unregister a push token (legacy endpoint)"""
    push_token = request.data.get('push_token')
    
    if not push_token:
        return JsonResponse(
            {'error': 'push_token is required'}, 
            status=400
        )
    
    try:
        token_obj = PushToken.objects.get(
            user=request.user, 
            token=push_token
        )
        token_obj.is_active = False
        token_obj.save()
        
        return JsonResponse({'message': 'Push token unregistered'})
    except PushToken.DoesNotExist:
        return JsonResponse(
            {'error': 'Push token not found'}, 
            status=404
        )

def send_push_notification(user_id, title, body, data=None):
    """
    Send a push notification to a specific user
    
    Args:
        user_id: The user ID to send notification to
        title: Notification title
        body: Notification body
        data: Additional data payload (dict)
    
    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        # Get active push tokens for the user
        push_tokens = PushToken.objects.filter(
            user_id=user_id, 
            is_active=True
        ).values_list('token', flat=True)
        
        if not push_tokens:
            return False, "No active push tokens found for user"
        
        # Prepare notification payload
        notification_data = {
            'to': list(push_tokens),
            'sound': 'default',
            'title': title,
            'body': body,
            'priority': 'high',
            'channelId': 'default',
        }
        
        if data:
            notification_data['data'] = data
        
        # Send to Expo Push API
        response = requests.post(
            EXPO_PUSH_URL,
            json=notification_data,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            
            # Check for any errors in the response
            if 'data' in result:
                errors = []
                for item in result['data']:
                    if item.get('status') == 'error':
                        errors.append(item.get('message', 'Unknown error'))
                
                if errors:
                    return False, f"Some notifications failed: {', '.join(errors)}"
            
            return True, "Notification sent successfully"
        else:
            return False, f"HTTP {response.status_code}: {response.text}"
            
    except requests.exceptions.RequestException as e:
        return False, f"Network error: {str(e)}"
    except Exception as e:
        return False, f"Error sending notification: {str(e)}"

def send_ping_notification(driver_id, admin_name):
    """
    Send a ping notification to a driver
    
    Args:
        driver_id: The driver user ID
        admin_name: Name of the admin sending the ping
    
    Returns:
        Tuple of (success: bool, message: str)
    """
    title = "📍 Ping Received"
    body = f"{admin_name} has sent you a ping. Please check your status."
    data = {
        'type': 'ping',
        'admin_name': admin_name,
        'timestamp': str(timezone.now())
    }
    
    return send_push_notification(driver_id, title, body, data)

def broadcast_notification(user_ids, title, body, data=None):
    """
    Send a broadcast notification to multiple users
    
    Args:
        user_ids: List of user IDs
        title: Notification title
        body: Notification body
        data: Additional data payload (dict)
    
    Returns:
        Dict with success counts and errors
    """
    results = {
        'success': 0,
        'failed': 0,
        'errors': []
    }
    
    for user_id in user_ids:
        success, message = send_push_notification(user_id, title, body, data)
        if success:
            results['success'] += 1
        else:
            results['failed'] += 1
            results['errors'].append(f"User {user_id}: {message}")
    
    return results
