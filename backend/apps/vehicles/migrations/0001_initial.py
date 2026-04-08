# Generated migration for vehicles app

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('patrol_api', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='VehiclePhotoSubmission',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('photo_type', models.CharField(choices=[('pre_shift', 'Pre-Shift'), ('post_shift', 'Post-Shift')], max_length=20)),
                ('submitted_at', models.DateTimeField(auto_now_add=True)),
                ('captured_at', models.DateTimeField()),
                ('photo_count', models.PositiveIntegerField(default=0)),
                ('status', models.CharField(choices=[('pending', 'Pending Upload'), ('uploaded', 'Uploaded'), ('failed', 'Failed')], default='pending', max_length=20)),
                ('shift_id', models.PositiveIntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='photo_submissions', to='patrol_api.branch')),
                ('driver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='photo_submissions', to=settings.AUTH_USER_MODEL)),
                ('vehicle', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='photo_submissions', to='patrol_api.vehicle')),
            ],
            options={
                'verbose_name': 'Vehicle Photo Submission',
                'verbose_name_plural': 'Vehicle Photo Submissions',
                'ordering': ['-submitted_at'],
            },
        ),
    ]
