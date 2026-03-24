import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as ronda from '../api/ronda';
import { useAuth } from '../contexts/AuthContext';
import VideoCallButton from './VideoCallButton';
import 'leaflet/dist/leaflet.css';
import './LiveMap.css';

const DEFAULT_CENTER = [14.7269, 121.8656]; // Quezon Province center
const DEFAULT_ZOOM = 9;
const REFRESH_MS = 5000; // Base interval (will be adapted)
const SMART_POLL_INTERVAL = 15000; // 15 seconds when no active drivers

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

// Vehicle type detection and icons
function getVehicleIcon(vehiclePlate) {
  const plate = vehiclePlate?.toLowerCase() || '';
  if (plate.includes('ambulance') || plate.includes('rescue')) return '🚑';
  if (plate.includes('police') || plate.includes('patrol') || plate.includes('pnp')) return '🚓';
  if (plate.includes('motor') || plate.includes('bike')) return '🏍️';
  if (plate.includes('truck') || plate.includes('lorry')) return '🚛';
  if (plate.includes('bus') || plate.includes('van')) return '🚌';
  return '🚗'; // Default car
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
function createDriverIcon(driverName, vehiclePlate) {
  const colorIndex = getDriverColorIndex(driverName);
  const colors = DRIVER_COLORS[colorIndex];
  const initials = getDriverInitials(driverName);
  const vehicleEmoji = getVehicleIcon(vehiclePlate);
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48"><text x="20" y="14" text-anchor="middle" font-size="16">${vehicleEmoji}</text><circle cx="20" cy="32" r="14" fill="${colors.bg}" stroke="${colors.border}" stroke-width="3"/><text x="20" y="37" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="Arial, sans-serif">${initials}</text></svg>`;
  
  const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  
  return L.icon({
    iconUrl: svgUrl,
    iconSize: [40, 48],
    iconAnchor: [20, 48],
    popupAnchor: [0, -48],
    className: 'custom-driver-marker',
  });
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

function LiveMarkers({ locations, branchFilter, userRole, onPing, pinging, showTrails }) {
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
          
          return (
            <React.Fragment key={`${loc.session_id}-${index}`}>
              {/* Optional trail - only shown when toggle is enabled */}
              {showTrails && (
                <PersistentTrail 
                  sessionId={loc.session_id} 
                  recentPoints={loc.recent_points || []}
                  showTrails={showTrails}
                />
              )}
              
              {/* Current position marker */}
              <Marker 
                position={position}
                icon={createDriverIcon(loc.driver, loc.vehicle)}
              >
                <Popup>
                  <div className="marker-popup">
                    <strong className="driver-name">{loc.driver}</strong>
                    <div className="popup-info">
                      {loc.vehicle} — {loc.branch}<br />
                      {loc.timestamp ? new Date(loc.timestamp).toLocaleString() : '—'}<br />
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
                            {pingResponse === 'YES' && '✅ Driver is fine'}
                            {pingResponse === 'NO' && '❌ Driver needs assistance'}
                            {pingResponse === 'NEED_ASSISTANCE' && '🚨 Emergency help needed'}
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
                            📢 Send Ping
                          </button>
                        ) : (
                          <button className="ping-btn disabled" disabled>
                            ⏳ Waiting for response...
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* Video Call Button for Admins */}
                    {isAdmin && (
                      <div className="video-call-action">
                        <hr />
                        <VideoCallButton
                          driverId={loc.driver_id}
                          driverName={loc.driver}
                          sessionId={loc.session_id}
                          disabled={pingStatus === 'RESPONDED' || pingStatus === 'DELIVERED'}
                        />
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [pinging, setPinging] = useState({});
  const [showTrails, setShowTrails] = useState(false);
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

  const fetchLive = useCallback(async () => {
    try {
      const [liveData, sessionsData] = await Promise.all([
        ronda.sessions.live(),
        ronda.sessions.list(),
      ]);
      
      // Count active drivers with GPS
      const activeDriversWithGPS = liveData.filter(loc => loc.latitude != null && loc.longitude != null);
      const hasActiveDrivers = activeDriversWithGPS.length > 0;
      
      setLocations(liveData);
      setAllSessions(sessionsData);
      setLastUpdate(new Date());
      setError(null); // Clear any previous errors
      
      // Return polling decision for useEffect
      return hasActiveDrivers ? REFRESH_MS : SMART_POLL_INTERVAL;
    } catch (e) {
      const errorMessage = e.message || 'Failed to load live GPS data';
      setError(errorMessage);
      
      // Don't change locations on error, keep last known data
      
      // Return slower polling on error to reduce server load
      return SMART_POLL_INTERVAL * 2; // Even slower on error
    } finally {
      setLoading(false);
    }
  }, [setLocations, setAllSessions, setLastUpdate, setError, setLoading]);

  useEffect(() => {
    let currentInterval = REFRESH_MS;
    let isMounted = true;
    
    const setupPolling = async () => {
      if (!isMounted) return;
      
      try {
        const nextInterval = await fetchLive();
        
        if (!isMounted) return;
        
        // Only update interval if it changed significantly
        if (Math.abs(nextInterval - currentInterval) > 1000) {
          currentInterval = nextInterval;
          
          // Clear existing interval
          if (fetchRef.current) {
            clearInterval(fetchRef.current);
          }
          
          // Set new interval
          fetchRef.current = setInterval(async () => {
            if (!isMounted) return;
            await setupPolling();
          }, currentInterval);
        }
      } catch (error) {
        if (isMounted) {
          setError('Failed to setup polling');
        }
      }
    };
    
    // Initial setup
    setupPolling();
    
    // Cleanup
    return () => {
      isMounted = false;
      if (fetchRef.current) {
        clearInterval(fetchRef.current);
        fetchRef.current = null;
      }
    };
  }, [fetchLive]);

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
            {showTrails ? '📍 Trails: ON' : '📍 Trails: OFF'}
          </button>
          
          <span className="live-map-updated">
            Real-time updates every 5s. Last: {lastUpdate ? lastUpdate.toLocaleTimeString() : '—'}
          </span>
        </div>
        <MapContainer center={center} zoom={DEFAULT_ZOOM} className="live-map" scrollWheelZoom>
          <FixLeafletIcons />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <LiveMarkers 
            locations={locations} 
            branchFilter={branchFilter} 
            userRole={user?.role}
            onPing={handlePing}
            pinging={pinging}
            showTrails={showTrails}
          />
          <MapCenter center={center} />
          <MapZoomToDriver driverName={selectedDriver} locations={locations} />
        </MapContainer>
        <div className="live-map-legend">
          <span className="badge active">Active</span> Has recent GPS
          <span className="badge inactive" style={{ marginLeft: '1rem' }}>Inactive</span> No recent position
        </div>
      </div>
      
      {/* Right Sidebar */}
      <div className="live-map-sidebar">
        <div className="sidebar-header">
          <h3>Active Drivers</h3>
          <span className="driver-count">{locations.filter(l => l.latitude != null && l.longitude != null).length}</span>
        </div>
        
        <div className="driver-list">
          {locations.filter(l => l.latitude != null && l.longitude != null).map((loc) => {
            const colorIndex = getDriverColorIndex(loc.driver);
            const colors = DRIVER_COLORS[colorIndex];
            const pingStatus = loc.recent_ping ? loc.recent_ping.status : null;
            const pingResponse = loc.recent_ping ? loc.recent_ping.response : null;
            const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_ADMIN';
            
            return (
              <div key={loc.session_id} className="driver-card">
                <div className="driver-header">
                  <div className="driver-color" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
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
                        {pingResponse === 'YES' && '✅ Fine'}
                        {pingResponse === 'NO' && '❌ Needs help'}
                        {pingResponse === 'NEED_ASSISTANCE' && '🚨 Emergency'}
                      </span>
                    ) : (
                      <span className="ping-badge pending">
                        ⏳ Waiting...
                      </span>
                    )}
                  </div>
                )}
                
                {/* Ping Button */}
                {isAdmin && (
                  <div className="driver-ping-action">
                    {(!loc.recent_ping || pingStatus === 'RESPONDED') ? (
                      <button 
                        className="ping-btn-small"
                        onClick={() => handlePing && handlePing(loc.driver_id, loc.driver)}
                        disabled={pinging[loc.driver_id]}
                      >
                        {pinging[loc.driver_id] ? '⏳' : '📢'} Ping
                      </button>
                    ) : (
                      <button className="ping-btn-small disabled" disabled>
                        ⏳ Waiting...
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
