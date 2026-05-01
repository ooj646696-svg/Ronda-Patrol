import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as ronda from '../api/ronda';
import UserLogoutControl from '../components/UserLogoutControl';
import LogoutAllUsers from '../components/LogoutAllUsers';
import { reverseGeocode, getShortLocationName } from '../utils/geocoding';
import './DashboardPage.css';
import '../components/UserLogoutControl.css';

export function DashboardPage() {
  const { user } = useAuth();
  const [live, setLive] = useState([]);
  const [sessionsCount, setSessionsCount] = useState({ active: 0, total: 0 });
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pinging, setPinging] = useState({});
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [logoutMessage, setLogoutMessage] = useState(null);
  const [logoutError, setLogoutError] = useState(null);

  const handlePing = async (driverId, driverName) => {
    if (pinging[driverId]) return;
    
    console.log('Sending ping to driver:', { driverId, driverName, userRole: user?.role });
    
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

  const handleLogoutSuccess = (data) => {
    setLogoutMessage(data.message);
    setLogoutError(null);
    // Refresh live data to show updated sessions
    refreshLiveData();
    // Clear success message after 5 seconds
    setTimeout(() => setLogoutMessage(null), 5000);
  };

  const handleLogoutError = (error) => {
    setLogoutError(error);
    setLogoutMessage(null);
    // Clear error message after 5 seconds
    setTimeout(() => setLogoutError(null), 5000);
  };

  const refreshLiveData = async () => {
    try {
      const liveData = await ronda.sessions.live();
      setLive(liveData);
    } catch (e) {
      console.error('Failed to refresh live data:', e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [liveData, sessionsData] = await Promise.all([
          ronda.sessions.live(),
          ronda.sessions.list(),
        ]);
        if (cancelled) return;
        setLive(liveData);
        const active = sessionsData.filter((s) => s.is_active).length;
        setSessionsCount({ active, total: sessionsData.length });
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();

    // Fetch recent incidents
    async function fetchIncidents() {
      try {
        const data = await ronda.incidents.list();
        const incidentsList = Array.isArray(data) ? data : (data.results || []);
        // Get only the 5 most recent incidents
        incidentsList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (!cancelled) setIncidents(incidentsList.slice(0, 5));
      } catch (e) {
        console.error('Failed to fetch incidents:', e);
      } finally {
        if (!cancelled) setIncidentsLoading(false);
      }
    }
    fetchIncidents();
    
    // Refresh live data every 10 seconds (includes locations + ping status)
    const interval = setInterval(refreshLiveData, 10000);
    
    return () => { 
      cancelled = true; 
      clearInterval(interval);
    };
  }, []);

  // Component to display location name with geocoding
function LocationName({ latitude, longitude }) {
  const [locationName, setLocationName] = useState('Locating...');
  const [showCoords, setShowCoords] = useState(false);

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

  return (
    <span 
      className="location-name" 
      onClick={() => setShowCoords(!showCoords)}
      title={`${latitude?.toFixed(6)}, ${longitude?.toFixed(6)} - Click to toggle`}
    >
      {showCoords 
        ? `${latitude?.toFixed(6)}, ${longitude?.toFixed(6)}`
        : locationName
      }
    </span>
  );
}

const getPingStatusDisplay = (ping) => {
    if (!ping) return null;
    
    if (ping.status === 'RESPONDED') {
      const responseText = {
        'YES': 'Driver is fine',
        'NO': 'Driver needs assistance',
        'NEED_ASSISTANCE': 'Emergency help needed'
      }[ping.response] || `Responded: ${ping.response}`;
      
      return (
        <div className="ping-status responded">
          <span className="ping-badge success">Responded</span>
          <span className="ping-response">{responseText}</span>
          {ping.responded_at && (
            <span className="ping-time">
              {new Date(ping.responded_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      );
    }
    
    if (ping.status === 'SENT' || ping.status === 'DELIVERED') {
      return (
        <div className="ping-status pending">
          <span className="ping-badge warning">Waiting for response...</span>
          <span className="ping-time">
            Sent {new Date(ping.sent_at).toLocaleTimeString()}
          </span>
        </div>
      );
    }
    
    return null;
  };

  if (loading) return <div className="dashboard-loading">Loading…</div>;
  if (error) return <div className="dashboard-error">{error}</div>;

  return (
    <div className="dashboard">
      <h2>Dashboard</h2>
      <p className="dashboard-welcome">
        Welcome, {user?.username} ({user?.role?.replace('_', ' ')})
        {user?.branchName && <span className="branch-badge">{user.branchName}</span>}
      </p>
      <div className="dashboard-cards">
        <div className="card">
          <span className="card-value">{live.length}</span>
          <span className="card-label">Active vehicles (live)</span>
        </div>
        <div className="card">
          <span className="card-value">{sessionsCount.active}</span>
          <span className="card-label">Active sessions</span>
        </div>
        <div className="card">
          <span className="card-value">{sessionsCount.total}</span>
          <span className="card-label">Total sessions</span>
        </div>
        <div className="card incidents-card" onClick={() => window.location.href = '/incidents'}>
          <span className="card-value">{incidents.filter(i => i.description?.includes('[EMERGENCY]')).length}</span>
          <span className="card-label">Emergency Alerts</span>
        </div>
      </div>

      {/* Recent Incidents Widget */}
      {!incidentsLoading && incidents.length > 0 && (
        <div className="dashboard-section incidents-widget">
          <h3>Recent Incidents</h3>
          <div className="incidents-list-compact">
            {incidents.map(incident => {
              const isEmergency = incident.description?.includes('[EMERGENCY]');
              const isAssistance = incident.description?.includes('[ASSISTANCE]');
              const cleanDesc = incident.description?.replace(/\[EMERGENCY\]|\[ASSISTANCE\]/, '').trim();

              return (
                <div key={incident.id} className={`incident-item ${isEmergency ? 'emergency' : isAssistance ? 'assistance' : ''}`}>
                  <span className={`incident-type-badge ${isEmergency ? 'emergency' : isAssistance ? 'assistance' : ''}`}>
                    {isEmergency ? 'EMERGENCY' : isAssistance ? 'ASSISTANCE' : 'INCIDENT'}
                  </span>
                  <span className="incident-desc">{cleanDesc}</span>
                  <span className="incident-time-small">
                    {new Date(incident.created_at).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
          <a href="/incidents" className="view-all-link">View all incidents</a>
        </div>
      )}

      <div className="dashboard-section">
        <h3>Live Driver Locations</h3>
        <p className="section-hint">Click on a driver to view details and send pings</p>
        
        {/* Super Admin Logout All Users */}
        {user?.role === 'SUPER_ADMIN' && (
          <LogoutAllUsers
            onLogoutSuccess={handleLogoutSuccess}
            onLogoutError={handleLogoutError}
          />
        )}
        
        {/* Logout Messages */}
        {logoutMessage && (
          <div className="logout-success">
             {logoutMessage}
          </div>
        )}
        {logoutError && (
          <div className="logout-error">
            ❌ {logoutError}
          </div>
        )}
        
        {live.length === 0 ? (
          <p className="muted">No active patrols right now.</p>
        ) : (
          <div className="live-drivers-grid">
            {live.map((item) => {
              const pingStatus = item.recent_ping?.status;
              const cardPingClass = pingStatus === 'SENT' || pingStatus === 'DELIVERED' 
                ? 'ping-pending' 
                : pingStatus === 'RESPONDED' 
                  ? 'ping-responded' 
                  : '';
              const hasPingIndicator = pingStatus === 'SENT' || pingStatus === 'DELIVERED' || pingStatus === 'RESPONDED';
              
              return (
              <div 
                key={item.session_id} 
                className={`driver-card ${selectedDriver?.session_id === item.session_id ? 'selected' : ''} ${cardPingClass}`}
                onClick={() => setSelectedDriver(selectedDriver?.session_id === item.session_id ? null : item)}
              >
                {/* Ping indicator dot */}
                {hasPingIndicator && (
                  <div className={`ping-indicator ${pingStatus === 'RESPONDED' ? 'responded' : ''}`}></div>
                )}
                <div className="driver-header">
                  <span className="badge active">Active</span>
                  <span className="driver-name">{item.driver}</span>
                  {/* Super Admin Logout Control */}
                  {user?.role === 'SUPER_ADMIN' && (
                    <UserLogoutControl
                      user={{ id: item.driver_id, username: item.driver }}
                      onLogoutSuccess={handleLogoutSuccess}
                      onLogoutError={handleLogoutError}
                    />
                  )}
                </div>
                
                <div className="driver-info">
                  <div className="info-row">
                    <span className="info-label">Vehicle:</span>
                    <span className="info-value">{item.vehicle}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Branch:</span>
                    <span className="info-value">{item.branch_name || item.branch}</span>
                  </div>
                  {item.latitude && item.longitude && (
                    <div className="info-row">
                      <span className="info-label">Location:</span>
                      <span className="info-value location-value">
                        <LocationName latitude={item.latitude} longitude={item.longitude} />
                      </span>
                    </div>
                  )}
                  {item.timestamp && (
                    <div className="info-row">
                      <span className="info-label">Last Update:</span>
                      <span className="info-value">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Ping Status Display */}
                {item.recent_ping && (
                  <div className="ping-status-container">
                    <h4>Ping Status</h4>
                    {getPingStatusDisplay(item.recent_ping)}
                  </div>
                )}

                {/* Ping Button - Show if admin and no pending ping */}
                {(user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_ADMIN') && (
                  <div className="ping-actions">
                    {(!item.recent_ping || item.recent_ping.status === 'RESPONDED') ? (
                      <button 
                        className="ping-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePing(item.driver_id, item.driver);
                        }}
                        disabled={pinging[item.driver_id]}
                      >
                        {pinging[item.driver_id] ? 'Sending...' : '📢 Send Ping'}
                      </button>
                    ) : (
                      <button 
                        className="ping-button disabled"
                        disabled
                      >
                        ⏳ Waiting for response...
                      </button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
