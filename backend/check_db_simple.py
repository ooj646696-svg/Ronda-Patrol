import sqlite3

# Connect to database
conn = sqlite3.connect('db.sqlite3')
cursor = conn.cursor()

# Check GPSLog table structure
try:
    cursor.execute("PRAGMA table_info(patrol_api_gpslog)")
    columns = cursor.fetchall()
    
    print("GPSLog table fields:")
    for col in columns:
        print(f"  - {col[1]} ({col[2]})")
    
    # Check for new fields
    field_names = [col[1] for col in columns]
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

except Exception as e:
    print(f"Error: {e}")

finally:
    conn.close()
