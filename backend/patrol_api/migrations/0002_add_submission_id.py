# Add submission_id field to VehiclePhoto model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patrol_api', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='vehiclephoto',
            name='submission_id',
            field=models.PositiveIntegerField(blank=True, db_index=True, null=True),
        ),
    ]
