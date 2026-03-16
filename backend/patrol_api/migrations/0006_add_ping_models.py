# Generated migration to add ping models

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('patrol_api', '0005_update_driver_foreign_key'),
    ]

    operations = [
        migrations.CreateModel(
            name='PingRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sent_at', models.DateTimeField(auto_now_add=True)),
                ('responded_at', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(max_length=20, choices=[('SENT', 'Sent'), ('DELIVERED', 'Delivered'), ('RESPONDED', 'Responded'), ('TIMEOUT', 'Timeout')], default='SENT')),
                ('response', models.TextField(blank=True, null=True, help_text="Driver response (YES/NO/NEED_ASSISTANCE)")),
                ('response_location_lat', models.DecimalField(blank=True, decimal_places=8, max_digits=11, null=True)),
                ('response_location_lon', models.DecimalField(blank=True, decimal_places=8, max_digits=11, null=True)),
                ('response_time_seconds', models.PositiveIntegerField(blank=True, null=True, help_text="Time to respond in seconds")),
                ('driver', models.ForeignKey(limit_choices_to={'role': 'DRIVER'}, on_delete=django.db.models.deletion.CASCADE, related_name='received_pings', to='patrol_api.user')),
                ('sender', models.ForeignKey(limit_choices_to={'role__in': ['SUPER_ADMIN', 'BRANCH_ADMIN']}, on_delete=django.db.models.deletion.CASCADE, related_name='sent_pings', to='patrol_api.user')),
            ],
            options={
                'ordering': ['-sent_at'],
            },
        ),
        migrations.AddIndex(
            model_name='pingrequest',
            index=models.Index(fields=['driver', 'status'], name='patrol_api__driver_status_idx'),
        ),
        migrations.AddIndex(
            model_name='pingrequest',
            index=models.Index(fields=['sent_at'], name='patrol_api__sent_at_idx'),
        ),
        migrations.AddIndex(
            model_name='pingrequest',
            index=models.Index(fields=['status'], name='patrol_api__status_idx'),
        ),
    ]
