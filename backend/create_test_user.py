#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from patrol_api.models import User

def create_test_user():
    try:
        user = User.objects.get(username='driver1')
        print(f'User driver1 already exists: {user.username}, Role: {user.role}')
    except User.DoesNotExist:
        print('Creating driver1 user...')
        user = User.objects.create_user(
            username='driver1',
            email='driver1@test.com',
            password='password123',
            role='DRIVER',
            is_active=True
        )
        print(f'Created user: {user.username}, Role: {user.role}')

    print('\nAll users:')
    for u in User.objects.all():
        print(f'  - {u.username} ({u.role}) - Active: {u.is_active}')

if __name__ == '__main__':
    create_test_user()
