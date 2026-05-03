import React, { useState, useEffect } from 'react';
import api, { getMediaUrl } from '../api/client';
import { Pagination } from '../components/Pagination';
import './SnapshotsPage.css';

export function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [error, setError] = useState(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    driver: '',
    branch: '',
    date: '',
    status: ''
  });

  useEffect(() => {
    loadSnapshots();
  }, []);

  const loadSnapshots = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('📸 Loading snapshots from API...');
      
      const response = await api.get('/vehicle-photos/submissions/snapshots/');
      console.log('📸 Snapshots loaded:', response.data);
      
      // Handle both paginated and direct responses
      const snapshotsData = response.data.results || response.data;
      setSnapshots(snapshotsData);
      
    } catch (error) {
      console.error('❌ Error loading snapshots:', error);
      setError('Failed to load snapshots. Please try again.');
      
      // Fallback to mock data if API fails
      const mockSnapshots = [
        {
          id: 1,
          driver_name: 'Alexar Del Rosario',
          branch_name: 'Main Branch',
          vehicle_plate: 'ABC-123',
          photo_type: 'pre_shift',
          submitted_at: '2026-04-06T08:30:00Z',
          captured_at: '2026-04-06T08:30:00Z',
          photo_count: 6,
          status: 'uploaded',
          photos: [
            { id: 1, shot_type: 'front', image_url: null, image: '/api/placeholder/300/200' },
            { id: 2, shot_type: 'rear', image_url: null, image: '/api/placeholder/300/200' },
            { id: 3, shot_type: 'left_side', image_url: null, image: '/api/placeholder/300/200' },
            { id: 4, shot_type: 'right_side', image_url: null, image: '/api/placeholder/300/200' },
            { id: 5, shot_type: 'dashboard', image_url: null, image: '/api/placeholder/300/200' },
            { id: 6, shot_type: 'interior', image_url: null, image: '/api/placeholder/300/200' },
          ]
        }
      ];
      setSnapshots(mockSnapshots);
    } finally {
      setLoading(false);
    }
  };

  const handleViewPhotos = (snapshot) => {
    setSelectedSnapshot(snapshot);
  };

  const handleCloseModal = () => {
    setSelectedSnapshot(null);
  };

  const getStatusBadge = (status) => {
    const statusClass = status === 'uploaded' ? 'status-completed' : 'status-pending';
    const statusText = status === 'uploaded' ? 'Completed' : 'Pending Upload';
    return <span className={`status-badge ${statusClass}`}>{statusText}</span>;
  };

  const formatDateTime = (dateTimeStr) => {
    const date = new Date(dateTimeStr);
    return {
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      date: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    };
  };

  const filteredSnapshots = snapshots.filter((snapshot) => {
    // Driver filter
    if (filters.driver && !snapshot.driver_name.toLowerCase().includes(filters.driver.toLowerCase())) {
      return false;
    }
    
    // Branch filter
    if (filters.branch && snapshot.branch_name !== filters.branch) {
      return false;
    }
    
    // Date filter
    if (filters.date) {
      const snapshotDate = new Date(snapshot.submitted_at).toISOString().split('T')[0];
      if (snapshotDate !== filters.date) {
        return false;
      }
    }
    
    // Status filter
    if (filters.status && snapshot.status !== filters.status) {
      return false;
    }
    
    return true;
  });

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  // Extract unique branches for filter dropdown
  const uniqueBranches = [...new Set(snapshots.map(s => s.branch_name).filter(Boolean))];

  if (loading) {
    return (
      <div className="snapshots-loading">
        <div className="loading-spinner"></div>
        <p>Loading snapshots...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="snapshots-error">
        <div className="error-icon">⚠️</div>
        <h3>Error Loading Snapshots</h3>
        <p>{error}</p>
        <button className="retry-button" onClick={loadSnapshots}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="snapshots-page">
      <div className="snapshots-header">
        <h2>Vehicle Snapshots</h2>
        <p>View and manage driver-submitted vehicle photos</p>
      </div>

      {/* Filters and Search */}
      <div className="snapshots-filters">
        <div className="filter-group">
          <label>Search Driver:</label>
          <input 
            type="text" 
            placeholder="Enter driver name..." 
            className="filter-input"
            value={filters.driver}
            onChange={(e) => handleFilterChange('driver', e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Branch:</label>
          <select 
            className="filter-select"
            value={filters.branch}
            onChange={(e) => handleFilterChange('branch', e.target.value)}
          >
            <option value="">All Branches</option>
            {uniqueBranches.map(branch => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Date:</label>
          <input 
            type="date" 
            className="filter-input"
            value={filters.date}
            onChange={(e) => handleFilterChange('date', e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Status:</label>
          <select 
            className="filter-select"
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All Status</option>
            <option value="uploaded">Completed</option>
            <option value="pending">Pending Upload</option>
          </select>
        </div>
      </div>

      {/* Snapshots Table */}
      <Pagination data={filteredSnapshots} itemsPerPage={8}>
        {(currentSnapshots) => (
          <div className="snapshots-table-container">
            <table className="snapshots-table">
              <thead>
                <tr>
                  <th>Driver Name</th>
                  <th>Branch</th>
                  <th>Vehicle</th>
                  <th>Type</th>
                  <th>Time</th>
                  <th>Date</th>
                  <th>Photos</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentSnapshots.map((snapshot) => {
                  const dateTime = formatDateTime(snapshot.submitted_at);
                  return (
                    <tr key={snapshot.id} className="snapshot-row">
                      <td className="driver-cell">
                        <div className="driver-info">
                          <div className="driver-avatar">👤</div>
                          <span>{snapshot.driver_name}</span>
                        </div>
                      </td>
                      <td>{snapshot.branch_name}</td>
                      <td>{snapshot.vehicle_plate}</td>
                      <td>
                        <span className={`photo-type-badge ${snapshot.photo_type.replace('_', '')}`}>
                          {snapshot.photo_type === 'pre_shift' ? 'Pre-Shift' : 'Post-Shift'}
                        </span>
                      </td>
                      <td>{dateTime.time}</td>
                      <td>{dateTime.date}</td>
                      <td>
                        <div className="photo-count">
                          📷 {snapshot.photo_count} photos
                        </div>
                      </td>
                      <td>{getStatusBadge(snapshot.status)}</td>
                      <td>
                        <button 
                          className="action-button view-button"
                          onClick={() => handleViewPhotos(snapshot)}
                        >
                          View Photos
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Pagination>

      {/* Photos Modal */}
      {selectedSnapshot && (
        <div className="photos-modal-overlay" onClick={handleCloseModal}>
          <div className="photos-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📸 Vehicle Photos</h3>
              <button className="close-button" onClick={handleCloseModal}>×</button>
            </div>
            <div className="modal-content">
              <div className="snapshot-details">
                <p><strong>Driver:</strong> {selectedSnapshot.driver_name}</p>
                <p><strong>Branch:</strong> {selectedSnapshot.branch_name}</p>
                <p><strong>Vehicle:</strong> {selectedSnapshot.vehicle_plate}</p>
                <p><strong>Type:</strong> {selectedSnapshot.photo_type === 'pre_shift' ? 'Pre-Shift' : 'Post-Shift'}</p>
                <p><strong>Submitted:</strong> {formatDateTime(selectedSnapshot.submitted_at).date} at {formatDateTime(selectedSnapshot.submitted_at).time}</p>
              </div>
              <div className="photos-grid">
                {selectedSnapshot.photos && selectedSnapshot.photos.length > 0 ? (
                  selectedSnapshot.photos.map((photo) => (
                    <div key={photo.id} className="photo-item">
                      {photo.image_url || photo.image ? (
                        <img 
                          src={photo.image_url || getMediaUrl(photo.image)} 
                          alt={photo.shot_type}
                          className="photo-image"
                          onError={(e) => {
                            e.target.src = '/api/placeholder/300/200';
                          }}
                        />
                      ) : (
                        <div className="photo-placeholder">
                          <span className="photo-icon">📷</span>
                          <p>{photo.shot_type.replace('_', ' ').toUpperCase()}</p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="no-photos">
                    <p>No photos available for this submission</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {snapshots.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📸</div>
          <h3>No Snapshots Found</h3>
          <p>No vehicle photos have been submitted yet.</p>
        </div>
      )}
    </div>
  );
}
