"""
WebSocket consumers for video call signaling and real-time communication.
Handles WebRTC signaling between web dashboard and mobile app.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from .models import VideoCall, CallStatus


class VideoCallConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for video call signaling"""
    
    async def connect(self):
        """Accept connection and authenticate user"""
        self.user = self.scope["user"]
        
        if isinstance(self.user, AnonymousUser):
            await self.close()
            return
        
        self.user_group_name = f"user_{self.user.id}"
        
        # Join user-specific group
        await self.channel_layer.group_add(
            self.user_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Notify user is online
        await self.channel_layer.group_send(
            self.user_group_name,
            {
                'type': 'user_status',
                'status': 'online',
                'user_id': self.user.id
            }
        )
    
    async def disconnect(self, close_code):
        """Handle disconnection"""
        if hasattr(self, 'user_group_name'):
            # Notify user is offline
            await self.channel_layer.group_send(
                self.user_group_name,
                {
                    'type': 'user_status',
                    'status': 'offline',
                    'user_id': self.user.id
                }
            )
            
            # Leave user group
            await self.channel_layer.group_discard(
                self.user_group_name,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'initiate_call':
                await self.handle_initiate_call(data)
            elif message_type == 'accept_call':
                await self.handle_accept_call(data)
            elif message_type == 'reject_call':
                await self.handle_reject_call(data)
            elif message_type == 'end_call':
                await self.handle_end_call(data)
            elif message_type == 'webrtc_offer':
                await self.handle_webrtc_offer(data)
            elif message_type == 'webrtc_answer':
                await self.handle_webrtc_answer(data)
            elif message_type == 'ice_candidate':
                await self.handle_ice_candidate(data)
                
        except json.JSONDecodeError:
            await self.send_error("Invalid JSON format")
        except Exception as e:
            await self.send_error(f"Error processing message: {str(e)}")
    
    async def handle_initiate_call(self, data):
        """Handle call initiation"""
        recipient_id = data.get('recipient_id')
        session_id = data.get('session_id')
        
        if not recipient_id:
            await self.send_error("Recipient ID is required")
            return
        
        # Create video call record
        call = await self.create_video_call(recipient_id, session_id)
        
        # Send call request to recipient
        await self.channel_layer.group_send(
            f"user_{recipient_id}",
            {
                'type': 'incoming_call',
                'call_id': call.id,
                'initiator_id': self.user.id,
                'initiator_name': self.user.username,
                'session_id': session_id
            }
        )
        
        # Confirm call initiation to sender
        await self.send_message({
            'type': 'call_initiated',
            'call_id': call.id,
            'recipient_id': recipient_id
        })
    
    async def handle_accept_call(self, data):
        """Handle call acceptance"""
        call_id = data.get('call_id')
        
        call = await self.get_video_call(call_id)
        if not call:
            await self.send_error("Invalid call ID")
            return
        
        # Update call status
        await self.update_call_status(call, CallStatus.ACTIVE)
        
        # Notify initiator that call was accepted
        await self.channel_layer.group_send(
            f"user_{call.initiator.id}",
            {
                'type': 'call_accepted',
                'call_id': call_id,
                'recipient_id': self.user.id
            }
        )
        
        # Confirm acceptance to recipient
        await self.send_message({
            'type': 'call_accepted_confirmation',
            'call_id': call_id
        })
    
    async def handle_reject_call(self, data):
        """Handle call rejection"""
        call_id = data.get('call_id')
        
        call = await self.get_video_call(call_id)
        if not call:
            await self.send_error("Invalid call ID")
            return
        
        # Update call status
        await self.update_call_status(call, CallStatus.REJECTED)
        
        # Notify initiator that call was rejected
        await self.channel_layer.group_send(
            f"user_{call.initiator.id}",
            {
                'type': 'call_rejected',
                'call_id': call_id,
                'recipient_id': self.user.id
            }
        )
        
        # Confirm rejection to recipient
        await self.send_message({
            'type': 'call_rejected_confirmation',
            'call_id': call_id
        })
    
    async def handle_end_call(self, data):
        """Handle call termination"""
        call_id = data.get('call_id')
        
        call = await self.get_video_call(call_id)
        if not call:
            await self.send_error("Invalid call ID")
            return
        
        # Update call status
        await self.update_call_status(call, CallStatus.ENDED)
        
        # Notify other participant
        other_user_id = call.initiator.id if call.recipient.id == self.user.id else call.recipient.id
        await self.channel_layer.group_send(
            f"user_{other_user_id}",
            {
                'type': 'call_ended',
                'call_id': call_id,
                'ended_by': self.user.id
            }
        )
        
        # Confirm end to sender
        await self.send_message({
            'type': 'call_ended_confirmation',
            'call_id': call_id
        })
    
    async def handle_webrtc_offer(self, data):
        """Handle WebRTC offer"""
        call_id = data.get('call_id')
        offer = data.get('offer')
        
        call = await self.get_video_call(call_id)
        if not call:
            return
        
        # Forward offer to other participant
        recipient_id = call.recipient.id if call.initiator.id == self.user.id else call.initiator.id
        await self.channel_layer.group_send(
            f"user_{recipient_id}",
            {
                'type': 'webrtc_offer',
                'call_id': call_id,
                'offer': offer,
                'sender_id': self.user.id
            }
        )
    
    async def handle_webrtc_answer(self, data):
        """Handle WebRTC answer"""
        call_id = data.get('call_id')
        answer = data.get('answer')
        
        call = await self.get_video_call(call_id)
        if not call:
            return
        
        # Forward answer to other participant
        recipient_id = call.recipient.id if call.initiator.id == self.user.id else call.initiator.id
        await self.channel_layer.group_send(
            f"user_{recipient_id}",
            {
                'type': 'webrtc_answer',
                'call_id': call_id,
                'answer': answer,
                'sender_id': self.user.id
            }
        )
    
    async def handle_ice_candidate(self, data):
        """Handle ICE candidate"""
        call_id = data.get('call_id')
        candidate = data.get('candidate')
        
        call = await self.get_video_call(call_id)
        if not call:
            return
        
        # Forward ICE candidate to other participant
        recipient_id = call.recipient.id if call.initiator.id == self.user.id else call.initiator.id
        await self.channel_layer.group_send(
            f"user_{recipient_id}",
            {
                'type': 'ice_candidate',
                'call_id': call_id,
                'candidate': candidate,
                'sender_id': self.user.id
            }
        )
    
    # Database operations
    @database_sync_to_async
    def create_video_call(self, recipient_id, session_id=None):
        """Create a new video call"""
        from .models import User, DriverSession
        
        recipient = User.objects.get(id=recipient_id)
        session = None
        if session_id:
            try:
                session = DriverSession.objects.get(id=session_id)
            except DriverSession.DoesNotExist:
                pass
        
        return VideoCall.objects.create(
            initiator=self.user,
            recipient=recipient,
            session=session,
            status=CallStatus.RINGING
        )
    
    @database_sync_to_async
    def get_video_call(self, call_id):
        """Get video call by ID"""
        try:
            return VideoCall.objects.get(id=call_id)
        except VideoCall.DoesNotExist:
            return None
    
    @database_sync_to_async
    def update_call_status(self, call, status):
        """Update call status"""
        call.status = status
        if status in [CallStatus.ENDED, CallStatus.REJECTED, CallStatus.MISSED]:
            from django.utils import timezone
            call.ended_at = timezone.now()
        call.save()
    
    # Message helpers
    async def send_message(self, data):
        """Send message to WebSocket"""
        await self.send(text_data=json.dumps(data))
    
    async def send_error(self, error_message):
        """Send error message"""
        await self.send_message({
            'type': 'error',
            'message': error_message
        })
    
    # Channel message handlers
    async def incoming_call(self, event):
        """Handle incoming call notification"""
        await self.send_message({
            'type': 'incoming_call',
            'call_id': event['call_id'],
            'initiator_id': event['initiator_id'],
            'initiator_name': event['initiator_name'],
            'session_id': event.get('session_id')
        })
    
    async def call_accepted(self, event):
        """Handle call accepted notification"""
        await self.send_message({
            'type': 'call_accepted',
            'call_id': event['call_id'],
            'recipient_id': event['recipient_id']
        })
    
    async def call_rejected(self, event):
        """Handle call rejected notification"""
        await self.send_message({
            'type': 'call_rejected',
            'call_id': event['call_id'],
            'recipient_id': event['recipient_id']
        })
    
    async def call_ended(self, event):
        """Handle call ended notification"""
        await self.send_message({
            'type': 'call_ended',
            'call_id': event['call_id'],
            'ended_by': event['ended_by']
        })
    
    async def webrtc_offer(self, event):
        """Handle WebRTC offer"""
        await self.send_message({
            'type': 'webrtc_offer',
            'call_id': event['call_id'],
            'offer': event['offer'],
            'sender_id': event['sender_id']
        })
    
    async def webrtc_answer(self, event):
        """Handle WebRTC answer"""
        await self.send_message({
            'type': 'webrtc_answer',
            'call_id': event['call_id'],
            'answer': event['answer'],
            'sender_id': event['sender_id']
        })
    
    async def ice_candidate(self, event):
        """Handle ICE candidate"""
        await self.send_message({
            'type': 'ice_candidate',
            'call_id': event['call_id'],
            'candidate': event['candidate'],
            'sender_id': event['sender_id']
        })
    
    async def user_status(self, event):
        """Handle user status change"""
        await self.send_message({
            'type': 'user_status',
            'user_id': event['user_id'],
            'status': event['status']
        })
