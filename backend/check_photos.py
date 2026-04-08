import sqlite3
import os

# Connect to the database
db_path = os.path.join(os.path.dirname(__file__), 'db.sqlite3')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check VehiclePhoto table
cursor.execute("SELECT COUNT(*) FROM patrol_api_vehiclephoto;")
count = cursor.fetchone()[0]
print(f"Total VehiclePhoto records: {count}")

if count > 0:
    cursor.execute("SELECT id, submission_id, shot_type, image FROM patrol_api_vehiclephoto LIMIT 5;")
    photos = cursor.fetchall()
    print("\nFirst 5 photos:")
    for photo in photos:
        print(f"  ID: {photo[0]}, Submission: {photo[1]}, Shot: {photo[2]}, Image: {photo[3]}")
else:
    print("No photos found in database!")

conn.close()
