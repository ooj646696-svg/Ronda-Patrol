import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as ronda from '../api/ronda';
import { Pagination } from '../components/Pagination';
import 'leaflet/dist/leaflet.css';
import './BranchesPage.css';

function FixLeafletIcons() {
  React.useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });
  }, []);
  return null;
}

function ClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng);
    },
  });
  return null;
}

const DEFAULT_CENTER = [14.5995, 120.9842];
const DEFAULT_ZOOM = 12;

export function BranchesPage() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    address: '',
    latitude: '',
    longitude: '',
    is_main: false,
  });
  
  // Filter states
  const [filters, setFilters] = useState({
    type: 'all',
    hasLocation: 'all'
  });

  useEffect(() => {
    ronda.branches
      .list()
      .then(setBranches)
      .catch((e) => setError(e.message || 'Failed to load branches'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleMapSelect = ({ lat, lng }) => {
    setForm((prev) => ({
      ...prev,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }));
  };

  const handleEdit = (branch) => {
    setEditingBranch(branch);
    setForm({
      name: branch.name,
      code: branch.code,
      address: branch.address || '',
      latitude: branch.latitude || '',
      longitude: branch.longitude || '',
      is_main: branch.is_main,
    });
    setError('');
  };

  const handleDelete = async (branchId) => {
    if (!window.confirm('Are you sure you want to delete this branch?')) return;
    
    try {
      await ronda.branches.remove(branchId);
      setBranches((prev) => prev.filter((b) => b.id !== branchId));
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to delete branch');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.code) {
      setError('Name and code are required.');
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        code: form.code,
        address: form.address || '',
        is_main: form.is_main,
        latitude: form.latitude || null,
        longitude: form.longitude || null,
      };
      
      if (editingBranch) {
        await ronda.branches.update(editingBranch.id, payload);
        setBranches((prev) => prev.map((b) => b.id === editingBranch.id ? { ...b, ...payload } : b));
      } else {
        const created = await ronda.branches.create(payload);
        setBranches((prev) => [...prev, created]);
      }
      
      setForm({
        name: '',
        code: '',
        address: '',
        latitude: '',
        longitude: '',
        is_main: false,
      });
      setEditingBranch(null);
    } catch (e) {
      const msg = e?.response?.data && typeof e.response.data === 'object'
        ? JSON.stringify(e.response.data)
        : e.message || 'Failed to save branch';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const markerPosition =
    form.latitude && form.longitude
      ? [parseFloat(form.latitude), parseFloat(form.longitude)]
      : null;

  const filteredBranches = branches.filter((b) => {
    if (filters.type !== 'all') {
      if (filters.type === 'main' && !b.is_main) return false;
      if (filters.type === 'regular' && b.is_main) return false;
    }
    if (filters.hasLocation !== 'all') {
      const hasCoords = b.latitude && b.longitude;
      if (filters.hasLocation === 'with' && !hasCoords) return false;
      if (filters.hasLocation === 'without' && hasCoords) return false;
    }
    return true;
  });

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  if (loading) return <div className="branches-loading">Loading branches…</div>;
  if (error) return <div className="branches-error">{error}</div>;

  return (
    <div className="branches-page">
      <h2>Branches</h2>
      <p className="branches-desc">
        Super Admin can create branches and pin their location on the map. Branch Admins are limited
        to their own branch.
      </p>

      <div className="branches-layout">
        <div className="branches-list">
          {/* Filters */}
          <div className="branches-filters">
            <div className="filter-group">
              <label>Type:</label>
              <select 
                value={filters.type} 
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="filter-select"
              >
                <option value="all">All Types</option>
                <option value="main">Main Branch</option>
                <option value="regular">Regular Branch</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Location:</label>
              <select 
                value={filters.hasLocation} 
                onChange={(e) => handleFilterChange('hasLocation', e.target.value)}
                className="filter-select"
              >
                <option value="all">All Locations</option>
                <option value="with">With GPS</option>
                <option value="without">Without GPS</option>
              </select>
            </div>
          </div>
          
          <Pagination data={filteredBranches} itemsPerPage={10}>
            {(currentBranches) => (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Address</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBranches.map((b) => (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td>{b.code}</td>
                      <td>{b.address || '—'}</td>
                      <td>{b.latitude || '—'}</td>
                      <td>{b.longitude || '—'}</td>
                      <td>
                        <button 
                          onClick={() => handleEdit(b)} 
                          className="btn btn-small btn-secondary"
                          style={{ marginRight: '5px' }}
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(b.id)} 
                          className="btn btn-small btn-danger"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Pagination>
        </div>

        <div className="branches-form-card">
          <h3>{editingBranch ? 'Edit branch' : 'Create branch'}</h3>
          <form onSubmit={handleUpdate} className="branches-form">
            <label>
              Name
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Code
              <input
                type="text"
                name="code"
                value={form.code}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Address
              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                rows={2}
              />
            </label>
            <label className="branches-checkbox">
              <input
                type="checkbox"
                name="is_main"
                checked={form.is_main}
                onChange={handleChange}
              />
              Main branch
            </label>

            <div className="branches-map-wrapper">
              <div className="branches-map-header">
                <span>Location (click on map to pin)</span>
                <span className="branches-coords">
                  {markerPosition
                    ? `Lat: ${form.latitude}, Lng: ${form.longitude}`
                    : 'No location selected'}
                </span>
              </div>
              <MapContainer
                center={markerPosition || DEFAULT_CENTER}
                zoom={DEFAULT_ZOOM}
                className="branches-map"
                scrollWheelZoom
              >
                <FixLeafletIcons />
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <ClickHandler onSelect={handleMapSelect} />
                {markerPosition && <Marker position={markerPosition} />}
              </MapContainer>
            </div>

            {error && <p className="branches-error-inline">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : (editingBranch ? 'Update branch' : 'Create branch')}
            </button>
            {editingBranch && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setEditingBranch(null);
                  setForm({
                    name: '',
                    code: '',
                    address: '',
                    latitude: '',
                    longitude: '',
                    is_main: false,
                  });
                  setError('');
                }}
              >
                Cancel
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

