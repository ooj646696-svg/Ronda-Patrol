#!/usr/bin/env python
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def check_gpslog_fields():
    """Check if new GPS fields exist in the database"""
    with connection.cursor() as cursor:
        # Get table info
        cursor.execute("PRAGMA table_info(patrol_api_gpslog)")
        columns = cursor.fetchall()
        
        field_names = [col[1] for col in columns]
        print("GPSLog table fields:")
        for field in field_names:
            print(f"  - {field}")
        
        # Check for new fields
        new_fields = ['accuracy', 'speed', 'altitude', 'is_valid', 'rejection_reason', 'accuracy_score']
        missing_fields = [field for field in new_fields if field not in field_names]
        
        if missing_fields:
            print(f"\n❌ Missing fields: {missing_fields}")
            print("Migration 0008 needs to be applied!")
        else:
            print("\n All new GPS fields are present")
        
        # Check migrations
        cursor.execute("SELECT name FROM django_migrations WHERE app='patrol_api' ORDER BY applied")
        applied_migrations = [row[0] for row in cursor.fetchall()]
        print(f"\nApplied migrations: {applied_migrations}")
        
        if '0008_videocall_gpslog_accuracy_gpslog_accuracy_score_and_more' not in applied_migrations:
            print("❌ Migration 0008 has NOT been applied")
        else:
            print(" Migration 0008 has been applied")

if __name__ == '__main__':
    check_gpslog_fields()
