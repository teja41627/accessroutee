export type UserRole = 'passenger' | 'operator' | 'admin';

export type PlaceCategory =
  | 'station'
  | 'bus_stop'
  | 'hospital'
  | 'toilet'
  | 'parking'
  | 'venue'
  | 'landmark';

export type OperationalStatus = 'operational' | 'unavailable' | 'degraded' | 'unknown';
export type VerificationStatus = 'verified' | 'reported_unavailable' | 'unverified' | 'unknown';

export type IncidentStatus =
  | 'submitted'
  | 'under_review'
  | 'verified'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'reopened';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentCategory =
  | 'Broken lift'
  | 'Blocked footpath'
  | 'Construction barrier'
  | 'Inaccessible entrance'
  | 'Broken ramp'
  | 'Crossing problem'
  | 'Missing accessibility information'
  | 'Other';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url: string | null;
  is_simulated: number;
  display_name: string;
  language: string;
  step_free: boolean;
  avoid_stairs: boolean;
  wheelchair_accessible: boolean;
  max_walking_m: number;
  prefer_fewer_transfers: boolean;
  audio_instructions: boolean;
  visual_instructions: boolean;
  simplified_guidance: boolean;
  optional_accessibility_notes: string;
  high_contrast: boolean;
  large_text: boolean;
  reduced_motion: boolean;
  updated_at: string;
  operator?: OperatorRecord | null;
}

export interface Organisation {
  id: string;
  name: string;
  type: string;
  contact_email: string;
  verified: number;
  is_simulated: number;
}

export interface OperatorRecord {
  id: string;
  user_id: string;
  organisation_id: string;
  organisation_name?: string;
  role: 'admin' | 'manager' | 'technician';
  title: string;
  can_verify: boolean;
  can_resolve: boolean;
  can_publish_maps: boolean;
  is_simulated: number;
}

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  address: string;
  lat: number;
  lng: number;
  accessibility_summary: string;
  operational_status: OperationalStatus;
  verification_status: VerificationStatus;
  data_source: string;
  last_updated: string;
  organisation_id: string | null;
  venue_id: string | null;
  primary_node_id: string | null;
  is_simulated: number;
}

export interface Asset {
  id: string;
  name: string;
  asset_type: 'lift' | 'ramp' | 'toilet' | 'crossing' | 'entrance' | 'escalator' | 'parking_bay' | 'tactile_path';
  place_id: string | null;
  venue_id: string | null;
  floor_id: string | null;
  node_id: string | null;
  organisation_id: string | null;
  lat: number;
  lng: number;
  operational_status: OperationalStatus;
  verification_status: VerificationStatus;
  accessibility_notes: string;
  data_source: string;
  last_updated: string;
  is_simulated: number;
}

export interface Venue {
  id: string;
  name: string;
  category: string;
  address: string;
  description: string;
  lat: number;
  lng: number;
  organisation_id: string;
  published: boolean;
  qr_code_token: string;
  updated_at: string;
  is_simulated: number;
}

export interface Floor {
  id: string;
  venue_id: string;
  level_number: number;
  name: string;
  map_version_id: string | null;
  is_simulated: number;
}

export interface MapNode {
  id: string;
  node_type: string;
  name: string;
  lat: number;
  lng: number;
  venue_id: string | null;
  floor_id: string | null;
  x_norm: number | null;
  y_norm: number | null;
  wheelchair_accessible: boolean;
  step_free: boolean;
  has_tactile_paving: boolean;
  door_width_cm: number | null;
  operational_status: OperationalStatus;
  verification_status: VerificationStatus;
  qr_landmark_code: string | null;
  is_simulated: number;
}

export interface MapEdge {
  id: string;
  from_node_id: string;
  to_node_id: string;
  bidirectional: boolean;
  distance_m: number;
  estimated_seconds: number;
  edge_type: string;
  has_stairs: boolean;
  step_free: boolean;
  wheelchair_accessible: boolean;
  max_slope_pct: number;
  surface_quality: 'smooth' | 'paved' | 'cobble' | 'unknown';
  width_cm: number;
  operational_status: OperationalStatus;
  asset_id: string | null;
  is_simulated: number;
}

export interface Incident {
  id: string;
  report_code: string;
  reporter_user_id: string;
  reporter_name?: string;
  category: IncidentCategory | string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  asset_id: string | null;
  asset_name?: string | null;
  place_id: string | null;
  place_name?: string | null;
  lat: number;
  lng: number;
  photo_data_url: string | null;
  assigned_operator_id: string | null;
  assigned_operator_name?: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  is_simulated: number;
}

export interface IncidentUpdate {
  id: string;
  incident_id: string;
  actor_user_id: string;
  actor_name?: string;
  from_status: string | null;
  to_status: string;
  note: string;
  created_at: string;
}

export interface RouteStep {
  edge_id: string;
  from_node_id: string;
  to_node_id: string;
  from_name: string;
  to_name: string;
  edge_type: string;
  instruction: string;
  maneuver: 'straight' | 'left' | 'right' | 'lift' | 'ramp' | 'transit' | 'crossing' | 'arrive';
  distance_m: number;
  estimated_seconds: number;
  step_free: boolean;
  wheelchair_accessible: boolean;
  surface_quality: string;
  floor_id?: string | null;
  coordinates: [number, number][]; // [lng, lat]
  x_norm?: number | null;
  y_norm?: number | null;
  warning?: string | null;
}

export interface ComputedRoute {
  mode: 'most_accessible' | 'least_walking' | 'fastest_feasible';
  label: string;
  feasible: boolean;
  total_distance_m: number;
  walking_distance_m: number;
  estimated_minutes: number;
  transfers: number;
  accessibility_compatibility: 'Full step-free match' | 'Partial match (disclosure)' | 'Blocked';
  data_confidence: 'Verified' | 'Contains unverified segments' | 'Contains unknown data';
  known_barriers: string[];
  unknown_disclosures: string[];
  steps: RouteStep[];
  geometry: [number, number][]; // [lng, lat]
  node_ids: string[];
  blocked_reason?: string;
}

export interface RoutePlanResponse {
  origin: { id: string; name: string; lat: number; lng: number };
  destination: { id: string; name: string; lat: number; lng: number };
  routes: ComputedRoute[];
  blocked_diagnostics: string[];
  active_disruptions: { asset_id: string; asset_name: string; status: string; incident_id?: string }[];
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'disruption' | 'incident_update' | 'route_alert' | 'system';
  related_incident_id: string | null;
  read: boolean;
  created_at: string;
}

export interface SavedPlace {
  id: string;
  user_id: string;
  place_id: string | null;
  label: string;
  route_json: string | null;
  created_at: string;
  place?: Place | null;
}

export interface JourneyRecord {
  id: string;
  user_id: string;
  origin_label: string;
  origin_node_id: string | null;
  destination_label: string;
  destination_node_id: string | null;
  route_mode: string;
  distance_m: number;
  duration_min: number;
  walking_m: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string;
  actor_name?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details_json: string;
  created_at: string;
}
