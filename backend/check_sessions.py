#!/usr/bin/env python
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from patrol_api.models import DriverSession, User, GPSLog

def check_session_status():
    """Check the session status for user 15 and session 64"""
    print("=== Checking Session Status ===")
    
    # Check user 15
    try:
        user = User.objects.get(id=15)
        print(f"User 15: {user.username} (Role: {user.role})")
        
        # Check active sessions for user 15
        active_sessions = DriverSession.objects.filter(driver=user, is_active=True)
        print(f"Active sessions for user 15: {active_sessions.count()}")
        for session in active_sessions:
            print(f"  - Session {session.id}: Vehicle {session.vehicle.plate_number if session.vehicle else 'None'}")
    except User.DoesNotExist:
        print("❌ User 15 does not exist")
    
    # Check session 64
    try:
        session = DriverSession.objects.get(id=64)
        print(f"\nSession 64:")
        print(f"  - Driver: {session.driver.username} (ID: {session.driver.id})")
        print(f"  - Is Active: {session.is_active}")
        print(f"  - Vehicle: {session.vehicle.plate_number if session.vehicle else 'None'}")
        print(f"  - Start Time: {session.start_time}")
        print(f"  - End Time: {session.end_time}")
        
        # Check recent GPS logs for session 64
        recent_gps = GPSLog.objects.filter(session=session).order_by('-timestamp')[:5]
        print(f"  - Recent GPS logs: {recent_gps.count()}")
        for gps in recent_gps:
            print(f"    * {gps.timestamp}: ({gps.latitude}, {gps.longitude})")
            
    except DriverSession.DoesNotExist:
        print("❌ Session 64 does not exist")
    
    # Check all active sessions
    print(f"\n=== All Active Sessions ===")
    all_active = DriverSession.objects.filter(is_active=True)
    print(f"Total active sessions: {all_active.count()}")
    for session in all_active:
        print(f"  - Session {session.id}: User {session.driver.username} (ID: {session.driver.id})")

if __name__ == '__main__':
    check_session_status()
