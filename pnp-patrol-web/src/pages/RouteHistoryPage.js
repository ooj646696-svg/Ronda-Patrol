import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as ronda from '../api/ronda';
import { reverseGeocode, getShortLocationName } from '../utils/geocoding';
import 'leaflet/dist/leaflet.css';
import './RouteHistoryPage.css';

// Check if Leaflet loaded properly
if (typeof L === 'undefined') {
  console.error('❌ Leaflet not loaded - check imports');
} else {
  console.log('✅ Leaflet loaded successfully');
}

// Custom marker icons for start and end points
const startIcon = new L.DivIcon({
  className: 'custom-marker start-marker',
  html: '<div style="background-color: #2e7d32; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">S</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const endIcon = new L.DivIcon({
  className: 'custom-marker end-marker',
  html: '<div style="background-color: #c62828; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">E</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const currentPositionIcon = new L.DivIcon({
  className: 'custom-marker current-marker',
  html: '<div style="background-color: #007bff; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function FixLeafletIcons() {
  useEffect(() => {
    if (typeof L !== 'undefined' && L.Icon?.Default) {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
    }
  }, []);
  return null;
}

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 1) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, positions]);
  return null;
}

// Speed-based color calculation
function getSpeedColor(speedKmh) {
  if (speedKmh <= 0) return '#9e9e9e'; // Gray for stationary
  if (speedKmh < 20) return '#4caf50'; // Green for slow
  if (speedKmh < 60) return '#ff9800'; // Orange for moderate
  return '#f44336'; // Red for fast
}

// Create colored segments based on speed
function createSpeedColoredSegments(points) {
  if (!points || points.length < 2) return [];
  
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = [points[i].latitude, points[i].longitude];
    const end = [points[i + 1].latitude, points[i + 1].longitude];
    const speed = points[i + 1].calculated_speed_kmh || 0;
    
    segments.push({
      positions: [start, end],
      color: getSpeedColor(speed),
      speed: speed,
      index: i,
    });
  }
  return segments;
}

const DEFAULT_CENTER = [14.7269, 121.8656]; // Quezon Province center
const DEFAULT_ZOOM = 9;

// Component to display location name with geocoding for route playback
function RouteLocationName({ latitude, longitude }) {
  const [locationName, setLocationName] = useState('Locating...');

  useEffect(() => {
    if (!latitude || !longitude) {
      setLocationName('No location');
      return;
    }

    let cancelled = false;

    const fetchLocation = async () => {
      const address = await reverseGeocode(latitude, longitude);
      if (!cancelled) {
        setLocationName(getShortLocationName(address));
      }
    };

    fetchLocation();

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  return <span className="route-location-text">{locationName}</span>;
}

// Lighter version for map popups
function RoutePopupLocationName({ latitude, longitude }) {
  const [locationName, setLocationName] = useState('Locating...');

  useEffect(() => {
    if (!latitude || !longitude) {
      setLocationName('No location');
      return;
    }

    let cancelled = false;

    const fetchLocation = async () => {
      const address = await reverseGeocode(latitude, longitude);
      if (!cancelled) {
        setLocationName(getShortLocationName(address));
      }
    };

    fetchLocation();

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  return <span style={{ fontWeight: 500 }}>{locationName}</span>;
}

export function RouteHistoryPage() {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedColors, setShowSpeedColors] = useState(true);
  const playbackRef = useRef(null);

  const loadSessions = useCallback(() => {
    ronda.sessions
      .list()
      .then(setSessions)
      .catch((e) => setError(e.message || 'Failed to load sessions'))
      .finally(() => setLoading(false));
  }, []);

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to delete this session and all its GPS data?')) return;
    
    setDeleting(true);
    try {
      await ronda.sessions.remove(sessionId);
      setSessions(sessions.filter(s => s.id !== sessionId));
      if (selectedId === sessionId) {
        setSelectedId(null);
        setRouteData(null);
      }
    } catch (e) {
      setError('Failed to delete session');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedId) {
      setRouteData(null);
      stopPlayback();
      return;
    }
    
    // Use the proper API client
    ronda.gpsLogs.sessionRoute(selectedId)
      .then(data => {
        console.log('🗺️ Route data received:', data);
        if (data.error) {
          throw new Error(data.error);
        }
        // Ensure route_points exists and is an array
        const safeData = {
          ...data,
          route_points: data.route_points || []
        };
        console.log('📍 Route points count:', safeData.route_points.length);
        setRouteData(safeData);
        setCurrentIndex(0);
        stopPlayback();
      })
      .catch(e => {
        console.error('Failed to load route:', e);
        setError('Failed to load route data');
      });
  }, [selectedId]);

  // Playback controls
  const startPlayback = () => {
    if (!routeData?.route_points?.length) return;
    setIsPlaying(true);
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
  };

  const pausePlayback = () => {
    setIsPlaying(false);
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
  };

  const resetPlayback = () => {
    stopPlayback();
    setCurrentIndex(0);
  };

  // Playback animation effect
  useEffect(() => {
    if (isPlaying && routeData?.route_points) {
      const interval = 1000 / playbackSpeed;
      
      playbackRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (!routeData?.route_points || prev >= routeData.route_points.length - 1) {
            stopPlayback();
            return prev;
          }
          return prev + 1;
        });
      }, interval);
    }
    
    return () => {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, routeData]);

  const handleSeek = (e) => {
    const value = parseInt(e.target.value, 10);
    setCurrentIndex(value);
  };

  // Calculate positions for map
  const allPositions = routeData?.route_points?.map(p => [p.latitude, p.longitude]) || [];
  const currentPosition = routeData?.route_points?.[currentIndex];
  const segments = showSpeedColors ? createSpeedColoredSegments(routeData?.route_points) : [];

  // Format helpers
  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  if (loading) return <div className="route-loading">Loading sessions…</div>;
  if (error) return <div className="route-error">{error}</div>;

  return (
    <div className="route-history-page">
      <h2>Route History Playback</h2>
      <p className="route-desc">Select a session to view animated route playback with speed visualization.</p>
      
      <div className="route-layout">
        {/* Left Sidebar */}
        <div className="route-sidebar">
          <div className="session-selector">
            <label className="route-label">Session</label>
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
              className="route-select"
            >
              <option value="">— Select session —</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.driver_username || s.driver} — {s.branch_name || s.branch} — {s.start_time ? new Date(s.start_time).toLocaleDateString() : ''}
                </option>
              ))}
            </select>
          </div>

          {routeData && (
            <div className="route-stats">
              <h4>Route Statistics</h4>
              <div className="stat-grid">
                <div className="stat-item">
                  <span className="stat-label">Distance</span>
                  <span className="stat-value">{(routeData?.total_distance_km || 0).toFixed(2)} km</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Duration</span>
                  <span className="stat-value">{formatDuration(routeData?.duration_seconds || 0)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Avg Speed</span>
                  <span className="stat-value">{(routeData?.average_speed_kmh || 0).toFixed(1)} km/h</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">GPS Points</span>
                  <span className="stat-value">{routeData?.total_points || 0}</span>
                </div>
              </div>
              
              <div className="session-details">
                <div className="detail-row">
                  <span className="detail-label">Driver:</span>
                  <span className="detail-value">{routeData?.driver || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Vehicle:</span>
                  <span className="detail-value">{routeData?.vehicle || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Start:</span>
                  <span className="detail-value">{formatTime(routeData?.start_time)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">End:</span>
                  <span className="detail-value">{formatTime(routeData?.end_time)}</span>
                </div>
              </div>
            </div>
          )}

          {selectedId && (
            <button 
              onClick={() => handleDeleteSession(selectedId)} 
              className="btn btn-small btn-danger delete-btn"
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete Session'}
            </button>
          )}
        </div>

        {/* Main Content - Map and Playback */}
        <div className="route-main">
          {routeData && (
            <div className="playback-controls">
              <div className="control-row">
                <button 
                  className="playback-btn" 
                  onClick={isPlaying ? pausePlayback : startPlayback}
                  disabled={!routeData?.route_points || currentIndex >= (routeData.route_points.length - 1)}
                >
                  {isPlaying ? '⏸️ Pause' : (!routeData?.route_points || currentIndex >= routeData.route_points.length - 1) ? '✅ Done' : '▶️ Play'}
                </button>
                <button className="playback-btn" onClick={resetPlayback}>
                  ⏹️ Reset
                </button>
                <button 
                  className={`playback-btn toggle-btn ${showSpeedColors ? 'active' : ''}`}
                  onClick={() => setShowSpeedColors(!showSpeedColors)}
                >
                  🎨 Speed Colors
                </button>
              </div>
              
              <div className="control-row">
                <label className="speed-label">Speed:</label>
                <select 
                  value={playbackSpeed} 
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="speed-select"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={5}>5x</option>
                  <option value={10}>10x</option>
                </select>
              </div>
              
              <div className="seek-bar">
                <span className="seek-label">Progress:</span>
                <input
                  type="range"
                  min={0}
                  max={routeData?.route_points ? routeData.route_points.length - 1 : 0}
                  value={currentIndex}
                  onChange={handleSeek}
                  className="seek-slider"
                />
                <span className="seek-value">
                  {currentIndex + 1} / {routeData?.route_points?.length || 0}
                </span>
              </div>

              {currentPosition && (
                <div className="current-position-info">
                  <div className="position-stat">
                    <span className="position-label">Time:</span>
                    <span className="position-value">{formatTime(currentPosition.timestamp)}</span>
                  </div>
                  <div className="position-stat">
                    <span className="position-label">Speed:</span>
                    <span 
                      className="position-value speed-value"
                      style={{ color: getSpeedColor(currentPosition.calculated_speed_kmh) }}
                    >
                      {currentPosition.calculated_speed_kmh?.toFixed(1) || 0} km/h
                    </span>
                  </div>
                  <div className="position-stat location-stat">
                    <span className="position-label">Location:</span>
                    <span className="position-value location-name">
                      <RouteLocationName latitude={currentPosition.latitude} longitude={currentPosition.longitude} />
                    </span>
                  </div>
                  <div className="position-stat">
                    <span className="position-label">Coords:</span>
                    <span className="position-value coords">
                      {currentPosition.latitude?.toFixed(6)}, {currentPosition.longitude?.toFixed(6)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="route-map-wrap">
            {(() => {
              try {
                return (
                  <MapContainer 
                    center={DEFAULT_CENTER} 
                    zoom={DEFAULT_ZOOM} 
                    className="route-map" 
                    scrollWheelZoom
                    style={{ 
                      height: '400px', 
                      width: '100%',
                      position: 'relative',
                      zIndex: 1
                    }}
                  >
                    <FixLeafletIcons />
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    
                    {routeData?.route_points && routeData.route_points.length > 0 ? (
                      <>
                        {/* Speed-colored segments */}
                        {showSpeedColors && segments.map((segment, idx) => (
                          <Polyline
                            key={`segment-${idx}`}
                            positions={segment.positions}
                            color={segment.color}
                            weight={4}
                            opacity={idx <= currentIndex ? 0.8 : 0.3}
                          />
                        ))}
                        
                        {/* Fallback: simple polyline if no speed colors */}
                        {!showSpeedColors && allPositions.length > 0 && (
                          <Polyline 
                            positions={allPositions.slice(0, currentIndex + 1)} 
                            color="#1e3a5f" 
                            weight={4} 
                            opacity={0.8} 
                          />
                        )}
                        
                        {/* Start marker */}
                        {routeData?.route_points && routeData.route_points.length > 0 && routeData.route_points[0] && (
                          <Marker 
                            position={[routeData.route_points[0].latitude, routeData.route_points[0].longitude]}
                            icon={startIcon}
                          >
                            <Popup>
                              <div className="marker-popup">
                                <strong>🚀 START</strong><br />
                                {formatTime(routeData.route_points[0].timestamp)}
                              </div>
                            </Popup>
                          </Marker>
                        )}
                        
                        {/* End marker */}
                        {routeData?.route_points && routeData.route_points.length > 0 && routeData.route_points[routeData.route_points.length - 1] && (
                          <Marker 
                            position={[
                              routeData.route_points[routeData.route_points.length - 1].latitude,
                              routeData.route_points[routeData.route_points.length - 1].longitude
                            ]}
                            icon={endIcon}
                          >
                            <Popup>
                              <div className="marker-popup">
                                <strong>🏁 END</strong><br />
                                {formatTime(routeData.route_points[routeData.route_points.length - 1].timestamp)}
                              </div>
                            </Popup>
                          </Marker>
                        )}
                        
                        {/* Current position marker */}
                        {currentPosition && (
                          <Marker 
                            position={[currentPosition.latitude, currentPosition.longitude]}
                            icon={currentPositionIcon}
                          >
                            <Popup>
                              <div className="marker-popup">
                                <strong>📍 Current Position</strong><br />
                                <RoutePopupLocationName latitude={currentPosition.latitude} longitude={currentPosition.longitude} /><br />
                                Time: {formatTime(currentPosition.timestamp)}<br />
                                Speed: <span style={{ color: getSpeedColor(currentPosition.calculated_speed_kmh) }}>
                                  {currentPosition.calculated_speed_kmh?.toFixed(1) || 0} km/h
                                </span><br />
                                Coords: {currentPosition.latitude?.toFixed(6)}, {currentPosition.longitude?.toFixed(6)}
                              </div>
                            </Popup>
                          </Marker>
                        )}
                        
                        <FitBounds positions={allPositions} />
                      </>
                    ) : (
                      routeData && (
                        <div style={{ 
                          position: 'absolute', 
                          top: '50%', 
                          left: '50%', 
                          transform: 'translate(-50%, -50%)',
                          background: 'white',
                          padding: '20px',
                          borderRadius: '8px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          textAlign: 'center',
                          zIndex: 999
                        }}>
                          <div style={{ fontSize: '24px', marginBottom: '10px' }}>📍</div>
                          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>No GPS Data</div>
                          <div style={{ color: '#666', fontSize: '14px' }}>
                            This session has no recorded GPS points.
                          </div>
                        </div>
                      )
                    )}
                  </MapContainer>
                );
              } catch (error) {
                console.error('❌ MapContainer error:', error);
                return (
                  <div style={{
                    width: '100%',
                    height: '400px',
                    background: '#ffebee',
                    border: '2px solid #f44336',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    padding: '20px'
                  }}>
                    <div style={{ color: '#c62828', fontWeight: 'bold', marginBottom: '10px' }}>
                      MapContainer Error
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', textAlign: 'center' }}>
                      {error.message}
                    </div>
                  </div>
                );
              }
            })()}
          </div>

          {/* Legend */}
          {routeData && (
            <div className="route-legend">
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#2e7d32' }}></span>
                <span>Start Point</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#c62828' }}></span>
                <span>End Point</span>
              </div>
              {showSpeedColors && (
                <>
                  <div className="legend-item">
                    <span className="legend-color" style={{ backgroundColor: '#9e9e9e' }}></span>
                    <span>Stationary (0 km/h)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color" style={{ backgroundColor: '#4caf50' }}></span>
                    <span>Slow (1-20 km/h)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color" style={{ backgroundColor: '#ff9800' }}></span>
                    <span>Moderate (20-60 km/h)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color" style={{ backgroundColor: '#f44336' }}></span>
                    <span>Fast (60+ km/h)</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
