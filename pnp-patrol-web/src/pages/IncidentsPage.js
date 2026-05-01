import React, { useState, useEffect } from 'react';
import * as ronda from '../api/ronda';
import { reverseGeocode, getShortLocationName } from '../utils/geocoding';
import './IncidentsPage.css';

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

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, emergency, assistance

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      const data = await ronda.incidents.list();
      // Handle both array and paginated response
      const incidentsList = Array.isArray(data) ? data : (data.results || []);
      // Sort by created_at descending (newest first)
      incidentsList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setIncidents(incidentsList);
      setError(null);
    } catch (err) {
      setError('Failed to load incidents');
      console.error('Error fetching incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchIncidents, 30000);
    return () => clearInterval(interval);
  }, []);

  const getIncidentType = (description) => {
    if (description?.includes('[EMERGENCY]')) return 'emergency';
    if (description?.includes('[ASSISTANCE]')) return 'assistance';
    return 'incident';
  };

  const getDisplayDescription = (description) => {
    return description?.replace(/\[EMERGENCY\]|\[ASSISTANCE\]/, '').trim() || 'No description';
  };

  const filteredIncidents = incidents.filter(incident => {
    if (filter === 'all') return true;
    const type = getIncidentType(incident.description);
    if (filter === 'emergency') return type === 'emergency';
    if (filter === 'assistance') return type === 'assistance';
    return true;
  });

  const emergencyCount = incidents.filter(i => getIncidentType(i.description) === 'emergency').length;
  const assistanceCount = incidents.filter(i => getIncidentType(i.description) === 'assistance').length;

  if (loading) return <div className="incidents-loading">Loading incidents...</div>;

  return (
    <div className="incidents-page">
      <div className="incidents-header">
        <h1>Incidents & Emergency Alerts</h1>
        <div className="incidents-stats">
          <span className="stat-badge emergency">{emergencyCount} Emergency</span>
          <span className="stat-badge assistance">{assistanceCount} Assistance</span>
          <span className="stat-badge total">{incidents.length} Total</span>
        </div>
      </div>

      <div className="incidents-toolbar">
        <div className="filter-buttons">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={filter === 'emergency' ? 'active emergency' : 'emergency'}
            onClick={() => setFilter('emergency')}
          >
            Emergency
          </button>
          <button
            className={filter === 'assistance' ? 'active assistance' : 'assistance'}
            onClick={() => setFilter('assistance')}
          >
            Assistance
          </button>
        </div>
        <button className="refresh-btn" onClick={fetchIncidents}>
          Refresh
        </button>
      </div>

      {error && <div className="incidents-error">{error}</div>}

      <div className="incidents-list">
        {filteredIncidents.length === 0 ? (
          <div className="no-incidents">
            <p>No incidents found.</p>
          </div>
        ) : (
          filteredIncidents.map(incident => {
            const type = getIncidentType(incident.description);
            const isEmergency = type === 'emergency';

            return (
              <div key={incident.id} className={`incident-card ${type}`}>
                <div className="incident-header">
                  <span className={`incident-badge ${type}`}>
                    {isEmergency ? 'EMERGENCY' : type === 'assistance' ? 'ASSISTANCE' : 'INCIDENT'}
                  </span>
                  <span className="incident-time">
                    {new Date(incident.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="incident-body">
                  <p className="incident-description">
                    {getDisplayDescription(incident.description)}
                  </p>

                  <div className="incident-details">
                    <div className="detail-item">
                      <span className="label">Session:</span>
                      <span className="value">#{incident.session}</span>
                    </div>
                    {incident.latitude && incident.longitude && (
                      <div className="detail-item location-item">
                        <span className="label">Location:</span>
                        <LocationName 
                          latitude={parseFloat(incident.latitude)} 
                          longitude={parseFloat(incident.longitude)} 
                        />
                        <a
                          href={`https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="map-link"
                        >
                          View on Map
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {incident.image && (
                  <div className="incident-image">
                    <img src={incident.image} alt="Incident" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
