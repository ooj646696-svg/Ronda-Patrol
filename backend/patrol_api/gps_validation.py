"""
GPS Validation Utilities for R.O.N.D.A.
Comprehensive GPS accuracy, speed, and outlier detection.
"""

import math
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass


@dataclass
class GPSValidationResult:
    """Result of GPS point validation"""
    is_valid: bool
    rejected_reason: Optional[str] = None
    accuracy_score: float = 0.0  # 0-1 scale, higher is better
    

@dataclass
class GPSPoint:
    """Represents a GPS coordinate with metadata"""
    latitude: float
    longitude: float
    timestamp: datetime
    accuracy: Optional[float] = None  # in meters
    speed: Optional[float] = None  # in m/s
    altitude: Optional[float] = None
    

class GPSValidator:
    """
    Comprehensive GPS validation with multiple quality checks.
    """
    
    # Configuration constants
    MAX_ACCEPTABLE_ACCURACY = 50.0  # meters
    MAX_GPS_AGE_MINUTES = 5  # GPS data must be less than 5 minutes old
    MAX_REALISTIC_SPEED_MPS = 55.56  # 200 km/h in m/s
    MAX_SPEED_JUMP_MPS = 27.78  # 100 km/h speed jump threshold
    MIN_DISTANCE_FOR_SPEED_CALC = 5.0  # meters
    OUTLIER_DISTANCE_THRESHOLD = 500.0  # meters from expected position
    MAX_REASONABLE_ACCELERATION = 8.0  # m/s² (0-100 km/h in 3.5s)
    
    # Philippines bounds (from existing code)
    MIN_LAT = 4.0
    MAX_LAT = 21.0
    MIN_LON = 112.0
    MAX_LON = 131.0
    
    def __init__(self):
        self.recent_points: List[GPSPoint] = []
        self.max_history = 5  # Keep last 5 points for outlier detection
    
    def validate_gps_point(
        self, 
        point: GPSPoint,
        previous_point: Optional[GPSPoint] = None
    ) -> GPSValidationResult:
        """
        Perform comprehensive validation on a single GPS point.
        
        Checks performed:
        1. Geographic bounds (Philippines)
        2. GPS accuracy threshold
        3. GPS age (timestamp not too old)
        4. Speed reasonableness
        5. Distance jump detection (outliers)
        6. Acceleration validation
        """
        
        # Check 1: Geographic bounds
        if not self._is_within_bounds(point.latitude, point.longitude):
            return GPSValidationResult(
                is_valid=False,
                rejected_reason=f"Coordinates out of bounds: ({point.latitude}, {point.longitude})",
                accuracy_score=0.0
            )
        
        # Check 2: Accuracy threshold
        if point.accuracy is not None and point.accuracy > self.MAX_ACCEPTABLE_ACCURACY:
            return GPSValidationResult(
                is_valid=False,
                rejected_reason=f"Poor accuracy: {point.accuracy:.1f}m > {self.MAX_ACCEPTABLE_ACCURACY}m threshold",
                accuracy_score=self._calculate_accuracy_score(point.accuracy)
            )
        
        # Check 3: GPS age
        age_check = self._check_gps_age(point.timestamp)
        if not age_check.is_valid:
            return age_check
        
        # Check 4-6: Require previous point for speed/outlier checks
        if previous_point is not None:
            # Check 4: Speed validation
            speed_check = self._validate_speed(point, previous_point)
            if not speed_check.is_valid:
                return speed_check
            
            # Check 5: Outlier detection (distance jump)
            outlier_check = self._detect_outlier(point, previous_point)
            if not outlier_check.is_valid:
                return outlier_check
            
            # Check 6: Acceleration validation
            accel_check = self._validate_acceleration(point, previous_point)
            if not accel_check.is_valid:
                return accel_check
        
        # Calculate overall accuracy score
        accuracy_score = self._calculate_overall_score(point)
        
        return GPSValidationResult(
            is_valid=True,
            rejected_reason=None,
            accuracy_score=accuracy_score
        )
    
    def _is_within_bounds(self, lat: float, lon: float) -> bool:
        """Check if coordinates are within Philippines bounds"""
        return (self.MIN_LAT <= lat <= self.MAX_LAT and 
                self.MIN_LON <= lon <= self.MAX_LON)
    
    def _check_gps_age(self, timestamp: datetime) -> GPSValidationResult:
        """Validate GPS data is not too old"""
        now = datetime.now(timezone.utc)
        
        # Ensure timestamp is timezone-aware
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        
        age = now - timestamp
        max_age = timedelta(minutes=self.MAX_GPS_AGE_MINUTES)
        
        if age > max_age:
            return GPSValidationResult(
                is_valid=False,
                rejected_reason=f"Stale GPS data: {age.total_seconds()/60:.1f} minutes old > {self.MAX_GPS_AGE_MINUTES} min threshold",
                accuracy_score=0.0
            )
        
        return GPSValidationResult(is_valid=True, accuracy_score=1.0)
    
    def _validate_speed(
        self, 
        current: GPSPoint, 
        previous: GPSPoint
    ) -> GPSValidationResult:
        """Validate speed is realistic and not jumping unrealistically"""
        
        # If device provides speed, validate it
        if current.speed is not None:
            if current.speed > self.MAX_REALISTIC_SPEED_MPS:
                return GPSValidationResult(
                    is_valid=False,
                    rejected_reason=f"Unrealistic speed: {current.speed:.1f} m/s ({current.speed*3.6:.0f} km/h)",
                    accuracy_score=0.0
                )
        
        # Calculate speed between points
        distance = self._haversine_distance(
            previous.latitude, previous.longitude,
            current.latitude, current.longitude
        )
        
        time_diff = (current.timestamp - previous.timestamp).total_seconds()
        if time_diff > 0:
            calculated_speed = distance / time_diff  # m/s
            
            if calculated_speed > self.MAX_REALISTIC_SPEED_MPS:
                return GPSValidationResult(
                    is_valid=False,
                    rejected_reason=f"Calculated speed unrealistic: {calculated_speed:.1f} m/s ({calculated_speed*3.6:.0f} km/h)",
                    accuracy_score=0.0
                )
            
            # Check for speed jumps if we have previous speed
            if previous.speed is not None and current.speed is not None:
                speed_diff = abs(current.speed - previous.speed)
                if speed_diff > self.MAX_SPEED_JUMP_MPS:
                    return GPSValidationResult(
                        is_valid=False,
                        rejected_reason=f"Speed jump too large: {speed_diff:.1f} m/s change",
                        accuracy_score=0.3
                    )
        
        return GPSValidationResult(is_valid=True, accuracy_score=1.0)
    
    def _detect_outlier(
        self, 
        current: GPSPoint, 
        previous: GPSPoint
    ) -> GPSValidationResult:
        """Detect if point is an outlier based on distance from previous"""
        
        distance = self._haversine_distance(
            previous.latitude, previous.longitude,
            current.latitude, current.longitude
        )
        
        # Check if distance jump is unrealistic
        if distance > self.OUTLIER_DISTANCE_THRESHOLD:
            return GPSValidationResult(
                is_valid=False,
                rejected_reason=f"Distance jump too large: {distance:.0f}m > {self.OUTLIER_DISTANCE_THRESHOLD}m threshold",
                accuracy_score=0.0
            )
        
        return GPSValidationResult(is_valid=True, accuracy_score=1.0)
    
    def _validate_acceleration(
        self, 
        current: GPSPoint, 
        previous: GPSPoint
    ) -> GPSValidationResult:
        """Validate acceleration is within reasonable limits"""
        
        if current.speed is None or previous.speed is None:
            return GPSValidationResult(is_valid=True, accuracy_score=1.0)
        
        time_diff = (current.timestamp - previous.timestamp).total_seconds()
        if time_diff <= 0:
            return GPSValidationResult(is_valid=True, accuracy_score=1.0)
        
        speed_diff = current.speed - previous.speed
        acceleration = speed_diff / time_diff  # m/s²
        
        if abs(acceleration) > self.MAX_REASONABLE_ACCELERATION:
            return GPSValidationResult(
                is_valid=False,
                rejected_reason=f"Unrealistic acceleration: {acceleration:.1f} m/s²",
                accuracy_score=0.2
            )
        
        return GPSValidationResult(is_valid=True, accuracy_score=1.0)
    
    def _calculate_accuracy_score(self, accuracy: float) -> float:
        """Calculate accuracy score (0-1) based on accuracy in meters"""
        if accuracy <= 5:  # Excellent accuracy
            return 1.0
        elif accuracy <= 10:  # Good accuracy
            return 0.9
        elif accuracy <= 20:  # Acceptable
            return 0.7
        elif accuracy <= 50:  # Poor but usable
            return 0.4
        else:  # Unusable
            return 0.0
    
    def _calculate_overall_score(self, point: GPSPoint) -> float:
        """Calculate overall quality score for a GPS point"""
        scores = []
        
        # Accuracy score
        if point.accuracy is not None:
            scores.append(self._calculate_accuracy_score(point.accuracy))
        else:
            scores.append(0.5)  # Neutral if unknown
        
        # Speed score (prefer points with speed data)
        if point.speed is not None:
            scores.append(1.0)
        else:
            scores.append(0.5)
        
        return sum(scores) / len(scores) if scores else 0.5
    
    @staticmethod
    def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two coordinates in meters"""
        R = 6371000  # Earth's radius in meters
        
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = (math.sin(delta_phi / 2) ** 2 + 
             math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def filter_gps_points(
        self, 
        points: List[Dict[str, Any]], 
        strict_mode: bool = False
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Filter a list of GPS points, returning valid and rejected lists.
        
        Args:
            points: List of GPS point dictionaries
            strict_mode: If True, reject borderline points
            
        Returns:
            Tuple of (valid_points, rejected_points_with_reasons)
        """
        valid_points = []
        rejected_points = []
        
        previous_point = None
        
        for point_data in points:
            try:
                point = GPSPoint(
                    latitude=float(point_data['latitude']),
                    longitude=float(point_data['longitude']),
                    timestamp=point_data['timestamp'] if isinstance(point_data['timestamp'], datetime) else datetime.fromisoformat(str(point_data['timestamp'])),
                    accuracy=float(point_data['accuracy']) if 'accuracy' in point_data else None,
                    speed=float(point_data['speed']) if 'speed' in point_data else None,
                    altitude=float(point_data['altitude']) if 'altitude' in point_data else None
                )
                
                result = self.validate_gps_point(point, previous_point)
                
                if result.is_valid:
                    if not strict_mode or result.accuracy_score >= 0.7:
                        valid_points.append(point_data)
                        previous_point = point  # Update for next iteration
                    else:
                        rejected_points.append({
                            **point_data,
                            'rejected_reason': f"Low quality score: {result.accuracy_score:.2f}"
                        })
                else:
                    rejected_points.append({
                        **point_data,
                        'rejected_reason': result.rejected_reason
                    })
                    
            except (KeyError, ValueError, TypeError) as e:
                rejected_points.append({
                    **point_data,
                    'rejected_reason': f"Parse error: {str(e)}"
                })
        
        return valid_points, rejected_points


# Global validator instance
gps_validator = GPSValidator()
