"""
WebSocket consumers for real-time GPS updates
"""
import json
import math
from datetime import timedelta, datetime
from django.utils import timezone
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework.authtoken.models import Token

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from .models import DriverSession, GPSLog


def _get_query_params(scope):
    from urllib.parse import parse_qs
    query_string = scope.get('query_string', b'').decode('utf-8')
    return parse_qs(query_string)


@database_sync_to_async
def _get_user_from_token(token: str):
    """Authenticate either SimpleJWT access token or DRF Token."""
    # 1) SimpleJWT (what the mobile app is sending)
    try:
        jwt_auth = JWTAuthentication()
        validated = jwt_auth.get_validated_token(token)
        user = jwt_auth.get_user(validated)
        return user
    except (InvalidToken, TokenError) as e:
        print(f"[WS Auth] JWT token rejected: {e}")
    except Exception as e:
        print(f"[WS Auth] JWT auth unexpected error: {e}")

    # 2) DRF authtoken (fallback)
    try:
        token_obj = Token.objects.get(key=token)
        return token_obj.user
    except Token.DoesNotExist as e:
        print("[WS Auth] Token auth rejected: token key not found")
        raise


def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points on earth.
    Returns distance in meters.
    """
    lat1 = float(lat1)
    lon1 = float(lon1)
    lat2 = float(lat2)
    lon2 = float(lon2)
    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Radius of earth in meters
    r = 6371000
    return c * r


class LiveGPSConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time GPS location updates
    """
    
    async def connect(self):
        """Accept WebSocket connection and authenticate user"""
        try:
            query_params = _get_query_params(self.scope)
            print("[LiveGPS] Step 1: query params parsed")

            # Get token from query string or headers
            token = query_params.get('token', [None])[0]
            if not token:
                # Try to get from headers
                headers = dict(self.scope.get('headers', []))
                auth_header = headers.get(b'authorization', b'').decode('utf-8')
                if auth_header.startswith('Token '):
                    token = auth_header[6:]
            
            if not token:
                print("[LiveGPS] REJECT: no token provided")
                await self.close(code=4001)
                return
            
            print(f"[LiveGPS] Step 2: token found (len={len(token)})")

            # Authenticate user
            try:
                user = await _get_user_from_token(token)
            except Exception as e:
                print(f"[LiveGPS] REJECT: auth failed - {e}")
                await self.close(code=4002)
                return

            print(f"[LiveGPS] Step 3: user authenticated - {user.username} role={user.role}")
            self.scope['user'] = user

            # Cache user fields as primitives to avoid async ORM access
            self._user_role = user.role
            self._user_branch_id = user.branch_id  # FK _id is a plain int, no DB query
            self._user_id = user.id

            # Add user to appropriate group based on role
            if self._user_role == 'SUPER_ADMIN':
                group_name = 'live_gps_all'
            elif self._user_role == 'BRANCH_ADMIN':
                group_name = f'live_gps_branch_{self._user_branch_id}'
            elif self._user_role == 'DRIVER':
                group_name = f'live_gps_driver_{self._user_id}'
            else:
                print(f"[LiveGPS] REJECT: unknown role={self._user_role}")
                await self.close(code=4003)
                return
            
            print(f"[LiveGPS] Step 4: group={group_name}")

            # Join group
            await self.channel_layer.group_add(group_name, self.channel_name)
            self.group_name = group_name
            
            await self.accept()
            print("[LiveGPS] Step 5: connection accepted")
            
        except Exception as e:
            print(f"[LiveGPS] FATAL connect error: {type(e).__name__}: {e}")
            import traceback; traceback.print_exc()
            try:
                await self.close(code=4000)
            except Exception:
                pass
            return

        # Send initial data AFTER accept — failure must NOT close the connection
        try:
            await self.send_initial_data()
            print("[LiveGPS] Step 6: initial data sent")
        except Exception as e:
            print(f"[LiveGPS] initial data send failed (non-fatal): {type(e).__name__}: {e}")
            import traceback; traceback.print_exc()
    
    async def disconnect(self, close_code):
        """Handle disconnection"""
        print(f"[LiveGPS] disconnect code={close_code} group={getattr(self, 'group_name', 'N/A')}")
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
    
    async def send_initial_data(self):
        """Send initial live locations data"""
        user = self.scope['user']
        print(f"[LiveGPS] send_initial_data for {user.username}")
        live_data = await self.get_live_locations(user)
        print(f"[LiveGPS] get_live_locations returned {len(live_data)} sessions")
        payload = json.dumps({
            'type': 'initial_data',
            'data': live_data
        })
        await self.send(text_data=payload)
        print(f"[LiveGPS] initial_data sent ({len(payload)} bytes)")
    
    async def gps_update(self, event):
        """Handle GPS update broadcast"""
        await self.send(text_data=json.dumps({
            'type': 'gps_update',
            'data': event['data']
        }))
    
    async def driver_status_change(self, event):
        """Handle driver status changes (online/offline)"""
        await self.send(text_data=json.dumps({
            'type': 'status_change',
            'data': event['data']
        }))

    async def receive(self, text_data):
        """Handle messages from clients (heartbeat, etc.)."""
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        if data.get('type') == 'ping':
            await self.send(text_data=json.dumps({'type': 'pong'}))
            return
    
    @database_sync_to_async
    def get_live_locations(self, user):
        """Get live locations for user based on role"""
        ten_minutes_ago = timezone.now() - timedelta(minutes=10)
        results = []
        
        # Get sessions based on user role
        if user.role == 'SUPER_ADMIN':
            sessions = DriverSession.objects.filter(is_active=True).select_related('driver', 'vehicle', 'branch')
        elif user.role == 'BRANCH_ADMIN' and user.branch_id:
            sessions = DriverSession.objects.filter(is_active=True, branch_id=user.branch_id).select_related('driver', 'vehicle', 'branch')
        elif user.role == 'DRIVER':
            sessions = DriverSession.objects.filter(is_active=True, driver=user).select_related('driver', 'vehicle', 'branch')
        else:
            sessions = DriverSession.objects.none()
        
        for session in sessions:
            try:
                # Get latest GPS data
                recent_gps = GPSLog.objects.filter(
                    session=session,
                    timestamp__gte=ten_minutes_ago
                ).order_by('-timestamp').first()
                
                if recent_gps:
                    results.append({
                        'session_id': session.id,
                        'driver': session.driver.username,
                        'driver_id': session.driver.id,
                        'vehicle': session.vehicle.plate_number if session.vehicle else None,
                        'branch': session.branch.code if session.branch else None,
                        'latitude': float(recent_gps.latitude) if recent_gps else None,
                        'longitude': float(recent_gps.longitude) if recent_gps else None,
                        'timestamp': recent_gps.timestamp.isoformat() if recent_gps else None,
                        'heading': float(recent_gps.heading) if recent_gps and recent_gps.heading else None,
                        'is_app_offline': session.is_app_offline,
                    })
                else:
                    # Session exists but no recent GPS
                    results.append({
                        'session_id': session.id,
                        'driver': session.driver.username,
                        'driver_id': session.driver.id,
                        'vehicle': session.vehicle.plate_number if session.vehicle else None,
                        'branch': session.branch.code if session.branch else None,
                        'latitude': None,
                        'longitude': None,
                        'timestamp': None,
                        'heading': None,
                        'is_app_offline': session.is_app_offline,
                    })
                    
            except Exception as e:
                print(f"Error processing session {session.id}: {e}")
                continue
        
        return results


class GPSUpdateConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for receiving GPS updates from mobile apps
    """
    
    async def connect(self):
        """Accept connection from mobile app"""
        try:
            query_params = _get_query_params(self.scope)
            
            # Get session ID and token
            session_id = query_params.get('session_id', [None])[0]
            token = query_params.get('token', [None])[0]
            
            if not session_id or not token:
                await self.close(code=4001)
                return
            
            # Authenticate and validate session
            try:
                user = await _get_user_from_token(token)

                session = await database_sync_to_async(lambda: DriverSession.objects.select_related('vehicle', 'branch', 'driver').get(
                    id=session_id, driver=user, is_active=True
                ))()
                self.session = session
                self.user = user

                self.vehicle_plate = session.vehicle.plate_number if session.vehicle else None
                self.branch_code = session.branch.code if session.branch else None
                self.branch_id = session.branch_id
                
            except (Token.DoesNotExist, DriverSession.DoesNotExist):
                await self.close(code=4003)
                return
            
            # Join driver-specific group
            group_name = f'driver_gps_{session_id}'
            await self.channel_layer.group_add(group_name, self.channel_name)
            self.group_name = group_name
            
            await self.accept()
            
        except Exception as e:
            print(f"Mobile GPS WebSocket connection error: {e}")
            await self.close(code=4000)
    
    async def disconnect(self, close_code):
        """Handle disconnection"""
        print(f"[GPSUpdate] disconnect code={close_code} session={getattr(self, 'session', 'N/A')}")
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
    
    async def receive(self, text_data):
        """Receive GPS data from mobile app"""
        try:
            data = json.loads(text_data)

            if data.get('type') == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
                return

            if data.get('type') not in (None, 'gps_update'):
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Unsupported message type'
                }))
                return
            
            # Validate GPS data
            required_fields = ['latitude', 'longitude', 'timestamp']
            if not all(field in data for field in required_fields):
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Missing required GPS fields'
                }))
                return
            
            # Store GPS data
            await self.store_gps_data(data)
            
            # Broadcast to relevant groups
            await self.broadcast_gps_update(data)
            
            # Acknowledge receipt
            await self.send(text_data=json.dumps({
                'type': 'gps_received',
                'timestamp': timezone.now().isoformat()
            }))
            
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))
        except Exception as e:
            print(f"Error processing GPS data: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Internal server error'
            }))
    
    @database_sync_to_async
    def store_gps_data(self, data):
        """Store GPS data in database with smart filtering"""
        try:
            # Get last GPS point for this session
            last_gps = GPSLog.objects.filter(session=self.session).order_by('-timestamp').first()
            
            should_save = True
            
            if last_gps:
                # Check distance threshold (20 meters)
                distance = haversine_distance(
                    last_gps.latitude, last_gps.longitude,
                    data['latitude'], data['longitude']
                )
                
                # Check time threshold (30 seconds)
                current_time = timezone.now()
                if data['timestamp']:
                    try:
                        timestamp = timezone.make_aware(datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00')))
                    except:
                        timestamp = current_time
                else:
                    timestamp = current_time
                
                time_diff = (timestamp - last_gps.timestamp).total_seconds()
                
                # Only save if moved > 20m OR time elapsed > 30s
                should_save = distance > 20 or time_diff > 30
                
                if not should_save:
                    print(f"Skipping GPS save - distance: {distance:.1f}m, time: {time_diff:.1f}s")
            
            if should_save:
                current_time = timezone.now()
                if data.get('timestamp'):
                    try:
                        parsed_timestamp = datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00'))
                        timestamp = timezone.make_aware(parsed_timestamp) if timezone.is_naive(parsed_timestamp) else parsed_timestamp
                    except Exception:
                        timestamp = current_time
                else:
                    timestamp = current_time

                GPSLog.objects.create(
                    session=self.session,
                    latitude=data['latitude'],
                    longitude=data['longitude'],
                    timestamp=timestamp,
                    accuracy=data.get('accuracy'),
                    speed=data.get('speed'),
                    altitude=data.get('altitude'),
                    heading=data.get('heading'),
                )
                print(f"GPS saved for session {self.session.id}")
                
        except Exception as e:
            print(f"Error storing GPS data: {e}")
    
    async def broadcast_gps_update(self, gps_data):
        """Broadcast GPS update to relevant groups"""
        payload = {
            'session_id': self.session.id,
            'driver': self.user.username,
            'driver_id': self.user.id,
            'vehicle': getattr(self, 'vehicle_plate', None),
            'branch': getattr(self, 'branch_code', None),
            **gps_data,
        }

        await self.channel_layer.group_send(
            'live_gps_all',
            {
                'type': 'gps_update',
                'data': payload,
            }
        )

        if getattr(self, 'branch_id', None):
            await self.channel_layer.group_send(
                f'live_gps_branch_{self.branch_id}',
                {
                    'type': 'gps_update',
                    'data': payload,
                }
            )

        await self.channel_layer.group_send(
            f'live_gps_driver_{self.user.id}',
            {
                'type': 'gps_update',
                'data': payload,
            }
        )
