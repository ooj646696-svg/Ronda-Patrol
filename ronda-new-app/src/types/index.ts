/**
 * TypeScript Type Definitions
 */

// User Types
export type UserRole = 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'DRIVER';

export interface User {
  id?: number;
  username: string;
  role: UserRole;
  branchId: number | null;
  branchName?: string;
  email?: string;
}

// Auth Types
export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

// Branch Types
export interface Branch {
  id: number;
  name: string;
  code: string;
  is_main: boolean;
  address?: string;
  latitude?: number;
  longitude?: number;
}

// Vehicle Types
export interface Vehicle {
  id: number;
  plate_number: string;
  name?: string;
  branch: number | Branch;
  branch_name?: string;
}

// Session Types
export interface DriverSession {
  id: number;
  driver: number | User;
  driver_username?: string;
  vehicle: number | Vehicle;
  vehicle_plate?: string;
  branch: number | Branch;
  branch_name?: string;
  start_time: string;
  end_time: string | null;
  is_active: boolean;
}

export interface SessionStartRequest {
  vehicle_id?: number;
  start_time?: string;
}

// GPS Types
export interface GPSLog {
  id: number;
  session: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
  speed?: number;
  altitude?: number;
  is_valid?: boolean;
  rejection_reason?: string;
  accuracy_score?: number;
}

export interface GPSCreateRequest {
  session: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
  speed?: number;
  altitude?: number;
}

// Photo Types
export type PhotoType = 'pre_shift' | 'post_shift';
export type ShotType = 'front' | 'rear' | 'left_side' | 'right_side' | 'odometer' | 'fuel_gauge' | 'interior' | 'damage' | 'tires' | 'equipment';

export interface PhotoData {
  shotType: ShotType;
  uri: string;
  latitude?: number;
  longitude?: number;
  capturedAt: string;
  notes?: string;
}

export interface PhotoRequirement {
  required_shots: ShotType[];
  optional_shots: ShotType[];
}

export interface PhotoUploadResponse {
  id: number;
  image: string;
  photo_type: PhotoType;
  shot_type: ShotType;
  vehicle: number;
  shift?: number;
  validation_status: string;
}

// Ping Types
export type PingStatus = 'SENT' | 'DELIVERED' | 'RESPONDED' | 'TIMEOUT';
export type PingResponse = 'YES' | 'NO' | 'NEED_ASSISTANCE';

export interface PingRequest {
  id: number;
  sender: {
    id: number;
    username: string;
  };
  driver: number;
  sent_at: string;
  responded_at?: string;
  status: PingStatus;
  response?: PingResponse;
  response_location_lat?: number;
  response_location_lon?: number;
  response_time_seconds?: number;
}

export interface PingRespondRequest {
  ping_id: number;
  response: PingResponse;
  latitude?: number;
  longitude?: number;
}

// Emergency Types (maps to backend IncidentReport)
export interface EmergencyAlert {
  id: number;
  session: number;
  description: string;
  image?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
}

// Live Location Types
export interface LiveLocation {
  session_id: number;
  driver: string;
  driver_id: number;
  vehicle?: string;
  branch?: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string | null;
  recent_points: Array<{
    latitude: number;
    longitude: number;
    timestamp: string;
    accuracy?: number;
  }>;
  total_points: number;
  recent_ping?: {
    id: number;
    status: PingStatus;
    response?: string;
    sent_at: string;
    responded_at?: string;
  };
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next?: string;
  previous?: string;
  results: T[];
}

// Error Types
export interface ApiError {
  response?: {
    status: number;
    data: {
      detail?: string;
      error?: string;
      [key: string]: any;
    };
  };
  message?: string;
}
