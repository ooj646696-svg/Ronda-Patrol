"""
WebSocket routing configuration for Django Channels.
"""

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/live-gps/$', consumers.LiveGPSConsumer.as_asgi()),
    re_path(r'ws/gps-update/$', consumers.GPSUpdateConsumer.as_asgi()),
]
