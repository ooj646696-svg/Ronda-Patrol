#!/usr/bin/env python
"""
ASGI server startup script for Django Channels with WebSocket support
"""
import os
import sys
import django
from django.core.asgi import get_asgi_application

def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    
    try:
        django.setup()
        print("Django setup completed successfully")
        
        # Import the Channels-enabled ASGI application
        from backend.asgi import application
        print("Channels ASGI application imported")
        
        # Import and run daphne
        from daphne.server import Server
        
        print("Starting ASGI server with WebSocket support on 0.0.0.0:8000...")
        
        Server(
            application,
            endpoints=[
                "tcp:port=8000:interface=0.0.0.0"
            ],
            verbosity=1,
        ).run()
        
    except Exception as e:
        print(f"Error starting ASGI server: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
