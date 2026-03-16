"""
WebSocket routing configuration for Django Channels.
"""

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/call/$', consumers.VideoCallConsumer.as_asgi()),
]
