# Generated migration to fix GPS decimal field precision

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patrol_api', '0008_videocall_gpslog_accuracy_gpslog_accuracy_score_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='gpslog',
            name='accuracy',
            field=models.DecimalField(blank=True, decimal_places=8, help_text='GPS accuracy in meters (lower is better)', max_digits=15, null=True),
        ),
        migrations.AlterField(
            model_name='gpslog',
            name='altitude',
            field=models.DecimalField(blank=True, decimal_places=8, help_text='Altitude in meters', max_digits=15, null=True),
        ),
        migrations.AlterField(
            model_name='gpslog',
            name='speed',
            field=models.DecimalField(blank=True, decimal_places=4, help_text='Speed in meters per second', max_digits=10, null=True),
        ),
    ]
