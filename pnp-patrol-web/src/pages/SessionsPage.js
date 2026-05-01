import React, { useState, useEffect } from 'react';
import * as ronda from '../api/ronda';
import { Pagination } from '../components/Pagination';
import './SessionsPage.css';

function formatDuration(start, end) {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const ms = e - s;
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

export function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    status: 'all',
    branch: 'all',
    dateFrom: '',
    dateTo: ''
  });

  useEffect(() => {
    ronda.sessions
      .list()
      .then(setSessions)
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const filteredSessions = sessions.filter((s) => {
    if (filters.status !== 'all') {
      if (filters.status === 'active' && !s.is_active) return false;
      if (filters.status === 'inactive' && s.is_active) return false;
    }
    if (filters.branch !== 'all' && s.branch_id !== parseInt(filters.branch)) return false;
    if (filters.dateFrom && s.start_time) {
      const sessionDate = new Date(s.start_time);
      const fromDate = new Date(filters.dateFrom);
      if (sessionDate < fromDate) return false;
    }
    if (filters.dateTo && s.start_time) {
      const sessionDate = new Date(s.start_time);
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      if (sessionDate > toDate) return false;
    }
    return true;
  });

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  if (loading) return <div className="sessions-loading">Loading…</div>;
  if (error) return <div className="sessions-error">{error}</div>;

  return (
    <div className="sessions-page">
      <h2>Session Logs</h2>
      <p className="sessions-desc">Driver sessions with start, end, and duration.</p>
      {/* Filters */}
      <div className="sessions-filters">
        <div className="filter-group">
          <label>Status:</label>
          <select 
            value={filters.status} 
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Branch:</label>
          <select 
            value={filters.branch} 
            onChange={(e) => handleFilterChange('branch', e.target.value)}
            className="filter-select"
          >
            <option value="all">All Branches</option>
            {/* Extract unique branches from sessions */}
            {[...new Set(sessions.map(s => s.branch_id).filter(Boolean))].map(branchId => {
              const branch = sessions.find(s => s.branch_id === branchId);
              return (
                <option key={branchId} value={branchId}>
                  {branch.branch_name || branch.branch || `Branch ${branchId}`}
                </option>
              );
            })}
          </select>
        </div>
        <div className="filter-group">
          <label>From Date:</label>
          <input 
            type="date" 
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label>To Date:</label>
          <input 
            type="date" 
            value={filters.dateTo}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            className="filter-input"
          />
        </div>
      </div>
      
      <Pagination data={filteredSessions} itemsPerPage={10}>
        {(currentSessions) => (
          <div className="table-wrap">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Branch</th>
                  <th>Start time</th>
                  <th>End time</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentSessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.driver_username || s.driver}</td>
                    <td>{s.branch_name || s.branch}</td>
                    <td>{s.start_time ? new Date(s.start_time).toLocaleString() : '—'}</td>
                    <td>{s.end_time ? new Date(s.end_time).toLocaleString() : '—'}</td>
                    <td>{formatDuration(s.start_time, s.end_time)}</td>
                    <td>
                      <span className={`badge ${s.is_active ? 'active' : 'inactive'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Pagination>
    </div>
  );
}
