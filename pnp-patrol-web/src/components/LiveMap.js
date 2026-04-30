import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as ronda from '../api/ronda';
import { useAuth } from '../contexts/AuthContext';
import 'leaflet/dist/leaflet.css';
import './LiveMap.css';

const DEFAULT_CENTER = [12.95, 121.1]; // San Francisco/Mulanay area - southern Quezon
const DEFAULT_ZOOM = 10;
const MIN_ZOOM = 9; // Don't zoom out too far
const MAX_ZOOM = 18; // Allow close zoom for detail
const REFRESH_MS = 5000; // Base interval (will be adapted)
const SMART_POLL_INTERVAL = 15000; // 15 seconds when no active drivers

// Map bounds - restrict to Philippines (roughly)
// [south, west], [north, east]
const PHILIPPINES_BOUNDS = [
  [4.5, 116.0],   // Southwest corner
  [21.5, 127.0]   // Northeast corner
];

// Expanded bounds to fully show Bondoc Peninsula including San Francisco
const QUEZON_BOUNDS = [
  [13.1, 120.8],  // Southwest - further south to show all of Bondoc Peninsula
  [15.0, 123.0]   // Northeast
];

// Quezon Province polygon boundary - accurate coordinates covering all cities and municipalities
// Color palette for drivers - distinct colors for easy identification
const DRIVER_COLORS = [
  { bg: '#e53935', border: '#c62828' }, // Red
  { bg: '#1e88e5', border: '#1565c0' }, // Blue
  { bg: '#43a047', border: '#2e7d32' }, // Green
  { bg: '#fb8c00', border: '#ef6c00' }, // Orange
  { bg: '#8e24aa', border: '#6a1b9a' }, // Purple
  { bg: '#00acc1', border: '#00838f' }, // Cyan
  { bg: '#f4511e', border: '#d84315' }, // Deep Orange
  { bg: '#3949ab', border: '#283593' }, // Indigo
  { bg: '#7cb342', border: '#558b2f' }, // Light Green
  { bg: '#fdd835', border: '#f9a825', text: '#333' }, // Yellow
];

// Vehicle type detection - returns text label
function getVehicleIcon(vehiclePlate) {
  const plate = vehiclePlate?.toLowerCase() || '';
  if (plate.includes('ambulance') || plate.includes('rescue')) return '[Ambulance]';
  if (plate.includes('police') || plate.includes('patrol') || plate.includes('pnp')) return '[Patrol]';
  if (plate.includes('motor') || plate.includes('bike')) return '[Motorcycle]';
  if (plate.includes('truck') || plate.includes('lorry')) return '[Truck]';
  if (plate.includes('bus') || plate.includes('van')) return '[Van]';
  return '[Vehicle]'; // Default
}

// Get driver initials (up to 2 characters)
function getDriverInitials(driverName) {
  if (!driverName) return '?';
  const parts = driverName.split(/[\s_-]+/).filter(p => p.length > 0);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Generate consistent color index for a driver
function getDriverColorIndex(driverName) {
  if (!driverName) return 0;
  let hash = 0;
  for (let i = 0; i < driverName.length; i++) {
    hash = driverName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % DRIVER_COLORS.length;
}

// Create custom marker icon with driver initials
function createDriverIcon(driverName, vehiclePlate, hasEmergency, hasAssistance, isOffline = false) {
  const colorIndex = getDriverColorIndex(driverName);
  const colors = DRIVER_COLORS[colorIndex];
  const initials = getDriverInitials(driverName);

  // Use grey colors if offline, otherwise use emergency/assistance colors if active
  let bgColor, borderColor;
  if (isOffline) {
    bgColor = '#808080'; // Grey for offline
    borderColor = '#606060';
  } else if (hasEmergency) {
    bgColor = '#c62828';
    borderColor = '#8e0000';
  } else if (hasAssistance) {
    bgColor = '#ef6c00';
    borderColor = '#b35900';
  } else {
    bgColor = colors.bg;
    borderColor = colors.border;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
    <circle cx="20" cy="24" r="18" fill="${bgColor}" stroke="${borderColor}" stroke-width="3"/>
    ${isOffline ? '<circle cx="32" cy="16" r="6" fill="#ff4444" stroke="#cc0000" stroke-width="1"/><text x="32" y="20" text-anchor="middle" fill="white" font-size="8" font-weight="bold">!</text>' : ''}
    <text x="20" y="28" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="Arial, sans-serif">${initials}</text>
  </svg>`;

  const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

  return L.icon({
    iconUrl: svgUrl,
    iconSize: [40, 48],
    iconAnchor: [20, 48],
    popupAnchor: [0, -48],
    className: `custom-driver-marker ${isOffline ? 'offline' : hasEmergency ? 'emergency' : hasAssistance ? 'assistance' : ''}`,
  });
}

// Create incident marker icon (emergency or assistance)
function createIncidentIcon(isEmergency) {
  const color = isEmergency ? '#c62828' : '#ef6c00';
  const strokeColor = isEmergency ? '#8e0000' : '#b35900';
  const label = isEmergency ? 'EMRG' : 'ASST';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <path d="M18 0 L36 18 L18 44 L0 18 Z" fill="${color}" stroke="${strokeColor}" stroke-width="2"/>
    <text x="18" y="26" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="Arial, sans-serif">${label}</text>
  </svg>`;

  const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

  return L.icon({
    iconUrl: svgUrl,
    iconSize: [36, 44],
    iconAnchor: [18, 40],
    popupAnchor: [0, -40],
    className: 'incident-marker',
  });
}

// Get incident type from description
function getIncidentType(description) {
  if (description?.includes('[EMERGENCY]')) return 'emergency';
  if (description?.includes('[ASSISTANCE]')) return 'assistance';
  return 'incident';
}

// Calculate circular offset for overlapping markers
function getCircularOffset(baseLat, baseLng, index, totalMarkers) {
  if (totalMarkers <= 1) {
    return [baseLat, baseLng];
  }

  // Start with some minimum distance
  const minDistance = 0.0002; // ~22 meters at equator
  const distance = minDistance + (index * 0.0001); // Increase distance for each marker
  
  // Calculate angle based on index (distribute evenly around circle)
  const angle = (index * 360) / totalMarkers;
  const angleRad = (angle * Math.PI) / 180;

  // Convert to lat/lng offset (approximate, works for small distances)
  // 1 degree latitude = 111.32 km
  // 1 degree longitude varies with latitude: 111.32 km * cos(latitude)
  const latOffset = distance * Math.cos(angleRad);
  const lngOffset = distance * Math.sin(angleRad) / Math.cos(baseLat * Math.PI / 180);

  return [baseLat + latOffset, baseLng + lngOffset];
}

// Calculate total distance traveled in GPS trail (in km)
function calculateTrailDistance(points) {
  if (!points || points.length < 2) return 0;
  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    const lat1 = points[i-1].latitude;
    const lon1 = points[i-1].longitude;
    const lat2 = points[i].latitude;
    const lon2 = points[i].longitude;
    
    // Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    totalDistance += R * c;
  }
  return totalDistance;
}

function FixLeafletIcons() {
  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });
  }, []);
  return null;
}

// Component to set map bounds and limits
function MapBounds() {
  const map = useMap();

  useEffect(() => {
    // Set max bounds to Quezon area (stricter)
    map.setMaxBounds(QUEZON_BOUNDS);
    // Set min/max zoom levels
    map.setMinZoom(MIN_ZOOM);
    map.setMaxZoom(MAX_ZOOM);
    // Fit bounds on initial load
    map.fitBounds(QUEZON_BOUNDS, { padding: [20, 20] });
  }, [map]);

  return null;
}

function MapCenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [map, center]);
  return null;
}

function MapZoomToDriver({ driverName, locations }) {
  const map = useMap();
  useEffect(() => {
    if (driverName && locations.length > 0) {
      const driver = locations.find(loc => loc.driver === driverName);
      if (driver && driver.latitude && driver.longitude) {
        map.setView([driver.latitude, driver.longitude], 15);
      }
    }
  }, [map, driverName, locations]);
  return null;
}

function MatchedTrail({ sessionId, showTrails, fallbackPoints }) {
  const [matchedPositions, setMatchedPositions] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const [lastFetchedTimestamp, setLastFetchedTimestamp] = useState(null);

  const latestFallbackTimestamp = (() => {
    if (!fallbackPoints || fallbackPoints.length === 0) return null;
    const last = fallbackPoints[fallbackPoints.length - 1];
    return last && last.timestamp ? String(last.timestamp) : null;
  })();

  useEffect(() => {
    let cancelled = false;
    if (!showTrails) return;
    if (!sessionId) return;

    const now = Date.now();
    const timestampUnchanged =
      latestFallbackTimestamp && lastFetchedTimestamp && latestFallbackTimestamp === lastFetchedTimestamp;
    if (timestampUnchanged && lastFetchedAt && now - lastFetchedAt < 30000) return;
    if (!latestFallbackTimestamp && lastFetchedAt && now - lastFetchedAt < 30000) return;

    (async () => {
      try {
        const data = await ronda.sessions.matchedRoute(sessionId, { limit: 200, valid_only: 1 });
        const geom = data && data.matched_geometry;
        const coords = geom && geom.type === 'LineString' ? geom.coordinates : null;
        if (!coords || coords.length < 2) {
          if (!cancelled) setMatchedPositions(null);
          return;
        }

        const positions = coords
          .map((c) => {
            if (!Array.isArray(c) || c.length < 2) return null;
            const lon = Number(c[0]);
            const lat = Number(c[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
            return [lat, lon];
          })
          .filter(Boolean);

        if (!cancelled) {
          setMatchedPositions(positions.length >= 2 ? positions : null);
          setLastFetchedAt(now);
          setLastFetchedTimestamp(latestFallbackTimestamp);
        }
      } catch (e) {
        if (!cancelled) {
          setMatchedPositions(null);
          setLastFetchedAt(now);
          setLastFetchedTimestamp(latestFallbackTimestamp);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, showTrails, lastFetchedAt, latestFallbackTimestamp, lastFetchedTimestamp]);

  if (!showTrails) return null;

  if (matchedPositions && matchedPositions.length > 1) {
    return (
      <Polyline
        positions={matchedPositions}
        color="#2563eb"
        weight={4}
        opacity={0.85}
      />
    );
  }

  return (
    <PersistentTrail
      sessionId={sessionId}
      recentPoints={fallbackPoints || []}
      showTrails={showTrails}
    />
  );
}

// Persistent trail component that maintains state across updates
// Now optional - controlled by showTrails prop
function PersistentTrail({ sessionId, recentPoints, showTrails }) {
  const [trail, setTrail] = useState([]);
  const polylineRef = useRef(null);

  useEffect(() => {
    // Only process trails if showing is enabled
    if (!showTrails) return;
    if (!recentPoints || recentPoints.length === 0) return;

    // Convert to [lat, lng] format
    const newPoints = recentPoints.map(p => [p.latitude, p.longitude]);
    
    // Check if we have new points to append
    if (trail.length === 0) {
      // First time, set the entire trail
      setTrail(newPoints);
    } else {
      // Only update if we have more points than before
      if (newPoints.length > trail.length) {
        setTrail(newPoints);
      }
    }
  }, [recentPoints, trail.length, sessionId, showTrails]);

  // Don't render if trails disabled
  if (!showTrails) return null;

  return (
    <>
      {trail.length > 1 && (
        <Polyline
          ref={polylineRef}
          positions={trail}
          color="#ff6b35"
          weight={3}
          opacity={0.6}
          dashArray="10, 10"
        />
      )}
    </>
  );
}

// Incident Markers Component
function IncidentMarkers({ incidents, showIncidents, onResolve, onShowRoute, onHideRoute, userRole, incidentRoutes }) {
  if (!showIncidents || !incidents || incidents.length === 0) return null;

  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN';

  return (
    <>
      {incidents.map((incident) => {
        const type = getIncidentType(incident.description);
        const isEmergency = type === 'emergency';
        const cleanDesc = incident.description
          ?.replace(/\[EMERGENCY\]|\[ASSISTANCE\]/, '')
          .trim() || 'No description';

        const lat = parseFloat(incident.latitude);
        const lng = parseFloat(incident.longitude);
        const routeData = incidentRoutes[incident.id];

        // Skip if coordinates are invalid, zero, or out of reasonable range
        if (isNaN(lat) || isNaN(lng)) return null;
        if (lat === 0 && lng === 0) return null; // GPS not ready
        if (lat < 4 || lat > 22 || lng < 115 || lng > 130) return null; // Outside Philippines

        return (
          <React.Fragment key={`incident-${incident.id}`}>
            {routeData && routeData.geometry && (
              <GeoJSON
                data={routeData.geometry}
                style={{
                  color: '#2196f3',
                  weight: 4,
                  opacity: 0.8,
                  dashArray: '10, 10'
                }}
              />
            )}
            <Marker
              position={[lat, lng]}
              icon={createIncidentIcon(isEmergency)}
            >
              <Popup>
                <div className="incident-popup">
                  <strong className={isEmergency ? 'emergency-text' : 'assistance-text'}>
                    {isEmergency ? 'EMERGENCY ALERT' : 'ASSISTANCE REQUEST'}
                  </strong>
                  <div className="popup-info">
                    {cleanDesc}<br />
                    <strong>Time:</strong> {new Date(incident.created_at).toLocaleString()}<br />
                    <strong>Session:</strong> #{incident.session}<br />
                    {incident.latitude && incident.longitude && (
                      <>
                        <strong>Location:</strong><br />
                        {parseFloat(incident.latitude).toFixed(6)}, {parseFloat(incident.longitude).toFixed(6)}<br />
                        <a
                          href={`https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="map-link"
                        >
                          View on Map
                        </a>
                      </>
                    )}
                    {routeData && routeData.distance && (
                      <>
                        <strong>Route Distance:</strong> {(routeData.distance / 1000).toFixed(1)} km<br />
                        <strong>Est. Duration:</strong> {Math.round(routeData.duration / 60)} min
                      </>
                    )}
                  </div>
                  <div className="incident-action">
                    <hr />
                    <button
                      className="route-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (routeData) {
                          onHideRoute && onHideRoute(incident.id);
                        } else {
                          onShowRoute && onShowRoute(incident.id);
                        }
                      }}
                    >
                      {routeData ? 'Hide Route' : 'Show Route from Branch'}
                    </button>
                    {isAdmin && (
                      <button
                        className="resolve-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onResolve && onResolve(incident.id);
                        }}
                      >
                        Resolve Incident
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          </React.Fragment>
        );
      })}
    </>
  );
}

function LiveMarkers({ locations, branchFilter, userRole, onPing, pinging, showTrails, incidents }) {
  const filtered = branchFilter
    ? locations.filter((l) => l.branch === branchFilter)
    : locations;

  const withGPS = filtered.filter((l) => l.latitude != null && l.longitude != null);
  const withoutGPS = filtered.filter((l) => l.latitude == null || l.longitude == null);

  const groupedByCoords = {};
  withGPS.forEach((loc) => {
    const key = `${loc.latitude.toFixed(6)},${loc.longitude.toFixed(6)}`;
    if (!groupedByCoords[key]) {
      groupedByCoords[key] = [];
    }
    groupedByCoords[key].push(loc);
  });

  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'BRANCH_ADMIN';

  return (
    <>
      {Object.entries(groupedByCoords).map(([coordKey, locs]) => {
        const [centerLat, centerLng] = coordKey.split(',').map(parseFloat);
        
        return locs.map((loc, index) => {
          const position = getCircularOffset(centerLat, centerLng, index, locs.length);
          
          // Determine ping status display
          const pingStatus = loc.recent_ping ? loc.recent_ping.status : null;
          const pingResponse = loc.recent_ping ? loc.recent_ping.response : null;

          // Check for active incidents for this driver
          const driverEmergencies = incidents?.filter(inc =>
            inc.session === loc.session_id && inc.description?.includes('[EMERGENCY]')
          ) || [];
          const driverAssistance = incidents?.filter(inc =>
            inc.session === loc.session_id && inc.description?.includes('[ASSISTANCE]')
          ) || [];
          const hasEmergency = driverEmergencies.length > 0;
          const hasAssistance = driverAssistance.length > 0;

          // Determine if driver is offline (no GPS data for more than 5 minutes)
          let isOffline = false;
          
          // Debug: Log the entire location object
          console.log(`Driver ${loc.driver} data:`, {
            timestamp: loc.timestamp,
            last_updated: loc.last_updated,
            updated_at: loc.updated_at,
            created_at: loc.created_at,
            session_id: loc.session_id
          });
          
          // Check multiple possible timestamp fields
          const timestampField = loc.timestamp || loc.last_updated || loc.updated_at;
          
          if (timestampField) {
            try {
              const timestamp = new Date(timestampField);
              const now = new Date();
              const timeDiff = now.getTime() - timestamp.getTime();
              isOffline = timeDiff > 5 * 60 * 1000; // 5 minutes
              
              // Debug logging
              console.log(`Driver ${loc.driver} time analysis:`, {
                timestamp: timestampField,
                timeDiffMinutes: Math.round(timeDiff / 60000),
                isOffline
              });
            } catch (error) {
              console.error('Error parsing timestamp for offline detection:', error);
              isOffline = true; // Assume offline if timestamp is invalid
            }
          } else {
            isOffline = true; // Assume offline if no timestamp
            console.log(`Driver ${loc.driver} offline: No timestamp field found`);
          }

          return (
            <React.Fragment key={`${loc.session_id}-${index}`}>
              {/* Optional trail - only shown when toggle is enabled */}
              {showTrails && (
                <MatchedTrail
                  sessionId={loc.session_id}
                  showTrails={showTrails}
                  fallbackPoints={loc.recent_points || []}
                />
              )}

              {/* Current position marker */}
              <Marker
                position={position}
                icon={createDriverIcon(loc.driver, loc.vehicle, hasEmergency, hasAssistance, isOffline)}
              >
                <Popup>
                  <div className="marker-popup">
                    {/* Emergency Status Banner - Most Prominent */}
                    {incidents && incidents.filter(inc => inc.session === loc.session_id && inc.description?.includes('[EMERGENCY]')).length > 0 && (
                      <div className="emergency-banner">
                        <strong>EMERGENCY ALERT</strong>
                        <span>Driver needs immediate help!</span>
                      </div>
                    )}
                    {incidents && incidents.filter(inc => inc.session === loc.session_id && inc.description?.includes('[ASSISTANCE]')).length > 0 && (
                      <div className="assistance-banner">
                        <strong>ASSISTANCE REQUESTED</strong>
                        <span>Driver needs help</span>
                      </div>
                    )}

                    <strong className="driver-name">{loc.driver}</strong>
                    <div className="popup-info">
                      {isOffline && <div className="offline-indicator">📵 <strong>OFFLINE</strong> - No recent GPS data</div>}
                      {loc.vehicle} — {loc.branch}<br />
                      {timestampField ? new Date(timestampField).toLocaleString() : '—'}<br />
                      <strong>Coordinates:</strong><br />
                      Lat: {loc.latitude?.toFixed(6) || 'N/A'}<br />
                      Lng: {loc.longitude?.toFixed(6) || 'N/A'}<br />
                      {loc.recent_points && loc.recent_points.length > 0 && (
                        <>
                          <br />Trail points: {loc.recent_points.length}
                          {loc.recent_points.length > 1 && (
                            <>
                              <br />Distance: {calculateTrailDistance(loc.recent_points).toFixed(2)} km
                            </>
                          )}
                        </>
                      )}
                    </div>
                    
                    {/* Ping Status */}
                    {loc.recent_ping && (
                      <div className="ping-status-section">
                        <hr />
                        <strong>Ping Status:</strong><br />
                        {pingStatus === 'RESPONDED' ? (
                          <>
                            <span className="ping-badge success">Responded</span><br />
                            {pingResponse === 'YES' && 'Driver is fine'}
                            {pingResponse === 'NO' && 'Driver needs assistance'}
                            {pingResponse === 'NEED_ASSISTANCE' && 'EMERGENCY: Help needed'}
                            {loc.recent_ping.responded_at && (
                              <><br /><small>at {new Date(loc.recent_ping.responded_at).toLocaleTimeString()}</small></>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="ping-badge pending">Waiting for response...</span><br />
                            <small>Sent {loc.recent_ping.sent_at ? new Date(loc.recent_ping.sent_at).toLocaleTimeString() : '—'}</small>
                          </>
                        )}
                      </div>
                    )}
                    
                    {/* Ping Button for Admins */}
                    {isAdmin && (
                      <div className="ping-action">
                        <hr />
                        {(!loc.recent_ping || pingStatus === 'RESPONDED') ? (
                          <button
                            className="ping-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPing && onPing(loc.driver_id, loc.driver);
                            }}
                          >
                            Send Ping
                          </button>
                        ) : (
                          <button className="ping-btn disabled" disabled>
                            Waiting for response...
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        });
      })}
      
      {withoutGPS.map((loc) => {
        const defaultPosition = [14.7269, 121.8656]; // Quezon Province center
        return (
          <Marker key={`no-gps-${loc.session_id}`} position={defaultPosition}>
            <Popup>
              <div className="marker-popup">
                <strong className="driver-name">{loc.driver}</strong><br />
                {loc.vehicle} — {loc.branch}<br />
                <span style={{color: 'red'}}>No GPS data available</span>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export function LiveMap({ branchFilter, onBranchFilterChange, branches }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [pinging, setPinging] = useState({});
  const [showTrails, setShowTrails] = useState(false);
  const [showIncidents, setShowIncidents] = useState(true);
  const [incidentRoutes, setIncidentRoutes] = useState({});
  const fetchRef = useRef(null);

  const handlePing = async (driverId, driverName) => {
    if (pinging[driverId]) return;

    console.log('Sending ping from LiveMap:', { driverId, driverName, userRole: user?.role });

    setPinging(prev => ({ ...prev, [driverId]: true }));
    try {
      const response = await ronda.ping.send(driverId);
      console.log('Ping response:', response);
      alert(`Ping sent to ${driverName} successfully!`);
      // Refresh live data to show updated ping status
      refreshLiveData();
    } catch (error) {
      console.error('Ping failed:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      alert(`Failed to ping ${driverName}: ${errorMessage}`);
    } finally {
      setPinging(prev => ({ ...prev, [driverId]: false }));
    }
  };

  const handleResolve = async (incidentId) => {
    try {
      const response = await ronda.incidents.resolve(incidentId);
      console.log('Resolve response:', response);
      alert('Incident resolved successfully!');
      // Refresh live data to remove resolved incident from map
      refreshLiveData();
    } catch (error) {
      console.error('Resolve failed:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to resolve incident: ${errorMessage}`);
    }
  };

  const handleShowRoute = async (incidentId) => {
    try {
      const response = await ronda.incidents.route(incidentId);
      console.log('Route response:', response);
      setIncidentRoutes(prev => ({ ...prev, [incidentId]: response }));
    } catch (error) {
      console.error('Route fetch failed:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to get route: ${errorMessage}`);
    }
  };

  const handleHideRoute = (incidentId) => {
    setIncidentRoutes(prev => {
      const newRoutes = { ...prev };
      delete newRoutes[incidentId];
      return newRoutes;
    });
  };

  const refreshLiveData = async () => {
    try {
      const [liveData, sessionsData] = await Promise.all([
        ronda.sessions.live(),
        ronda.sessions.list(),
      ]);
      setLocations(liveData);
      setAllSessions(sessionsData);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Failed to refresh live data:', e);
    }
  };

  const fetchLive = async () => {
    try {
      const [liveData, sessionsData, incidentsData] = await Promise.all([
        ronda.sessions.live(),
        ronda.sessions.list(),
        ronda.incidents.list(),
      ]);

      // Count active drivers with GPS
      const activeDriversWithGPS = liveData.filter(loc => loc.latitude != null && loc.longitude != null);
      const hasActiveDrivers = activeDriversWithGPS.length > 0;

      setLocations(liveData);
      setAllSessions(sessionsData);
      // Filter incidents with coordinates, from today, and not resolved
      const incidentsList = Array.isArray(incidentsData) ? incidentsData : (incidentsData.results || []);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const recentIncidents = incidentsList.filter(inc =>
        inc.latitude && inc.longitude && new Date(inc.created_at) >= today && !inc.is_resolved
      );
      setIncidents(recentIncidents);
      setLastUpdate(new Date());
      setError(null);

      return hasActiveDrivers ? REFRESH_MS : SMART_POLL_INTERVAL;
    } catch (e) {
      const errorMessage = e.message || 'Failed to load live GPS data';
      setError(errorMessage);
      return SMART_POLL_INTERVAL * 2;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    // Initial fetch
    fetchLive();
    
    // Set up polling interval
    fetchRef.current = setInterval(() => {
      if (isMounted) {
        fetchLive();
      }
    }, REFRESH_MS);
    
    // Cleanup
    return () => {
      isMounted = false;
      if (fetchRef.current) {
        clearInterval(fetchRef.current);
        fetchRef.current = null;
      }
    };
  }, []);

  const displayList = branchFilter
    ? [...locations.filter((l) => l.branch === branchFilter), ...allSessions.filter((s) => s.branch_name && !locations.some((l) => l.session_id === s.id)).map((s) => ({ session_id: s.id, driver: s.driver_username, vehicle: s.vehicle_plate, branch: s.branch_name || s.branch, latitude: null, longitude: null, timestamp: null, is_active: s.is_active }))]
    : locations;

  const withCoords = displayList.filter((l) => l.latitude != null && l.longitude != null);
  const center = withCoords.length ? [withCoords[0].latitude, withCoords[0].longitude] : DEFAULT_CENTER;

  // Get unique active drivers for dropdown
  const activeDrivers = [...new Set(locations.filter(l => l.latitude != null && l.longitude != null).map(l => l.driver))];

  if (loading) return <div className="live-map-loading">Loading map…</div>;
  if (error) return <div className="live-map-error">{error}</div>;

  return (
    <div className="live-map-container">
      <div className="live-map-main">
        <div className="live-map-toolbar">
          {branches && branches.length > 0 && onBranchFilterChange && (
            <select
              value={branchFilter || ''}
              onChange={(e) => onBranchFilterChange(e.target.value || null)}
              className="live-map-select"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.code}>{b.name}</option>
              ))}
            </select>
          )}
          
          {activeDrivers.length > 0 && (
            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="live-map-select"
              style={{ marginLeft: '10px' }}
            >
              <option value="">Select driver to zoom</option>
              {activeDrivers.map((driver) => (
                <option key={driver} value={driver}>{driver}</option>
              ))}
            </select>
          )}
          
          {/* Trail Toggle Button */}
          <button
            className={`trail-toggle ${showTrails ? 'active' : ''}`}
            onClick={() => setShowTrails(!showTrails)}
            style={{ marginLeft: '10px' }}
            title={showTrails ? 'Hide movement trails' : 'Show movement trails'}
          >
            {showTrails ? 'Trails: ON' : 'Trails: OFF'}
          </button>

          {/* Incidents Toggle Button */}
          <button
            className={`incidents-toggle ${showIncidents ? 'active' : ''}`}
            onClick={() => setShowIncidents(!showIncidents)}
            style={{ marginLeft: '10px' }}
            title={showIncidents ? 'Hide incidents' : 'Show incidents'}
          >
            {showIncidents ? `Alerts: ON (${incidents.length})` : `Alerts: OFF (${incidents.length})`}
          </button>
          
          <span className="live-map-updated">
            Real-time updates every 5s. Last: {lastUpdate ? lastUpdate.toLocaleTimeString() : '—'}
          </span>
        </div>
        <MapContainer
          center={center}
          zoom={DEFAULT_ZOOM}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          maxBounds={QUEZON_BOUNDS}
          maxBoundsViscosity={1.0}
          className="live-map"
          scrollWheelZoom
        >
          <FixLeafletIcons />
          <MapBounds />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            bounds={PHILIPPINES_BOUNDS}
          />

          <LiveMarkers
            locations={locations}
            branchFilter={branchFilter}
            userRole={user?.role}
            onPing={handlePing}
            pinging={pinging}
            showTrails={showTrails}
            incidents={incidents}
          />
          <IncidentMarkers
            incidents={incidents}
            showIncidents={showIncidents}
            onResolve={handleResolve}
            onShowRoute={handleShowRoute}
            onHideRoute={handleHideRoute}
            userRole={user?.role}
            incidentRoutes={incidentRoutes}
          />
          <MapCenter center={center} />
          <MapZoomToDriver driverName={selectedDriver} locations={locations} />
        </MapContainer>
        <div className="live-map-legend">
          <span className="badge active">Active</span> Has recent GPS
          <span className="badge inactive" style={{ marginLeft: '1rem' }}>Inactive</span> No recent position
          {incidents.length > 0 && (
            <span style={{ marginLeft: '1rem' }}>
              <span className="badge emergency" style={{ background: '#c62828', color: 'white' }}>EMRG</span> Emergency
              <span className="badge assistance" style={{ background: '#ef6c00', color: 'white', marginLeft: '0.5rem' }}>ASST</span> Assistance
            </span>
          )}
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="live-map-sidebar">
        <div className="sidebar-header">
          <h3>Active Drivers</h3>
          <span className="driver-count">{locations.filter(l => l.latitude != null && l.longitude != null).length}</span>
        </div>

        {/* Recent Incidents Section */}
        {incidents.length > 0 && (
          <div className="sidebar-incidents">
            <div className="sidebar-incidents-header">
              <h4>Recent Alerts</h4>
              <span className="incident-count">{incidents.length}</span>
            </div>
            <div className="incidents-list-small">
              {incidents.slice(0, 3).map(incident => {
                const isEmergency = incident.description?.includes('[EMERGENCY]');
                const cleanDesc = incident.description
                  ?.replace(/\[EMERGENCY\]|\[ASSISTANCE\]/, '')
                  .trim()
                  .substring(0, 40) + '...';
                return (
                  <div key={incident.id} className={`sidebar-incident-item ${isEmergency ? 'emergency' : 'assistance'}`}>
                    <span className="incident-type-tag">{isEmergency ? 'EMRG' : 'ASST'}</span>
                    <span className="incident-desc-small" title={incident.description}>{cleanDesc}</span>
                    <span className="incident-time">{new Date(incident.created_at).toLocaleTimeString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        <div className="driver-list">
          {locations.filter(l => l.latitude != null && l.longitude != null).map((loc) => {
            const colorIndex = getDriverColorIndex(loc.driver);
            const colors = DRIVER_COLORS[colorIndex];
            const pingStatus = loc.recent_ping ? loc.recent_ping.status : null;
            const pingResponse = loc.recent_ping ? loc.recent_ping.response : null;
            const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_ADMIN';

            // Check for active incidents for this driver
            const driverEmergencies = incidents?.filter(inc =>
              inc.session === loc.session_id && inc.description?.includes('[EMERGENCY]')
            ) || [];
            const driverAssistance = incidents?.filter(inc =>
              inc.session === loc.session_id && inc.description?.includes('[ASSISTANCE]')
            ) || [];
            const hasEmergency = driverEmergencies.length > 0;
            const hasAssistance = driverAssistance.length > 0;

            // Check if driver is offline (same logic as markers)
            const timestampField = loc.timestamp || loc.last_updated || loc.updated_at;
            let isOfflineDriver = false;
            
            if (timestampField) {
              try {
                const timestamp = new Date(timestampField);
                const now = new Date();
                const timeDiff = now.getTime() - timestamp.getTime();
                isOfflineDriver = timeDiff > 5 * 60 * 1000; // 5 minutes
              } catch (error) {
                isOfflineDriver = true; // Assume offline if timestamp is invalid
              }
            } else {
              isOfflineDriver = true; // Assume offline if no timestamp
            }

            return (
              <div key={loc.session_id} className={`driver-card ${hasEmergency ? 'emergency' : hasAssistance ? 'assistance' : ''}`}>
                {/* Emergency Alert Banner */}
                {hasEmergency && (
                  <div className="driver-card-alert emergency">
                    <strong>EMERGENCY</strong>
                    <span>Needs immediate help!</span>
                  </div>
                )}
                {hasAssistance && !hasEmergency && (
                  <div className="driver-card-alert assistance">
                    <strong>ASSISTANCE</strong>
                    <span>Needs help</span>
                  </div>
                )}
                {isOfflineDriver && !hasEmergency && !hasAssistance && (
                  <div className="driver-card-alert offline">
                    <strong>📵 OFFLINE</strong>
                    <span>No recent GPS data</span>
                  </div>
                )}

                <div className="driver-header">
                  <div
                    className={`driver-color ${hasEmergency ? 'emergency' : hasAssistance ? 'assistance' : ''}`}
                    style={{ backgroundColor: hasEmergency ? '#c62828' : hasAssistance ? '#ef6c00' : colors.bg, borderColor: hasEmergency ? '#8e0000' : hasAssistance ? '#b35900' : colors.border }}
                  >
                    {getDriverInitials(loc.driver)}
                  </div>
                  <div className="driver-info">
                    <div className="driver-name">{loc.driver}</div>
                    <div className="driver-details">
                      {getVehicleIcon(loc.vehicle)} {loc.vehicle} — {loc.branch}
                    </div>
                  </div>
                </div>

                {/* Ping Status */}
                {loc.recent_ping && (
                  <div className="driver-ping-status">
                    {pingStatus === 'RESPONDED' ? (
                      <span className="ping-badge success">
                        {pingResponse === 'YES' && 'Fine'}
                        {pingResponse === 'NO' && 'Needs help'}
                        {pingResponse === 'NEED_ASSISTANCE' && 'EMERGENCY'}
                      </span>
                    ) : (
                      <span className="ping-badge pending">
                        Waiting...
                      </span>
                    )}
                  </div>
                )}
                
                {/* Ping Button */}
                {isAdmin && (
                  <div className="driver-ping-action">
                    {(!loc.recent_ping || pingStatus === 'RESPONDED') ? (
                      <button
                        className={`ping-btn-small ${hasEmergency ? 'emergency' : hasAssistance ? 'assistance' : ''}`}
                        onClick={() => handlePing && handlePing(loc.driver_id, loc.driver)}
                        disabled={pinging[loc.driver_id]}
                      >
                        {pinging[loc.driver_id] ? 'Sending...' : 'Send Ping'}
                      </button>
                    ) : (
                      <button className="ping-btn-small disabled" disabled>
                        Waiting...
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
