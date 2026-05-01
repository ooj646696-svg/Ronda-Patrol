import os
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    
    print("Tables containing 'push':")
    for table in tables:
        if 'push' in table[0].lower():
            print(f"  {table[0]}")
    
    print("\nAll patrol_api tables:")
    for table in tables:
        if 'patrol_api' in table[0]:
            print(f"  {table[0]}")
