import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as ronda from '../api/ronda';
import { Pagination } from '../components/Pagination';
import './VehiclesPage.css';

export function VehiclesPage() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [form, setForm] = useState({
    branch: '',
    plate_number: '',
    name: '',
  });
  
  // Filter states
  const [filters, setFilters] = useState({
    branch: 'all',
    status: 'all'
  });

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    async function load() {
      try {
        const [v, b] = await Promise.all([ronda.vehicles.list(), ronda.branches.list()]);
        setVehicles(Array.isArray(v) ? v : v.results || []);
        setBranches(b);
        if (!isSuperAdmin && user?.branchId) setForm((prev) => ({ ...prev, branch: String(user.branchId) }));
      } catch (e) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isSuperAdmin, user?.branchId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setForm({
      branch: vehicle.branch?.id || '',
      plate_number: vehicle.plate_number,
      name: vehicle.name || '',
    });
    setError('');
  };

  const handleDelete = async (vehicleId) => {
    if (!window.confirm('Are you sure you want to delete this vehicle?')) return;
    
    try {
      await ronda.vehicles.remove(vehicleId);
      setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to delete vehicle');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.plate_number.trim()) {
      setError('Plate number is required.');
      return;
    }
    
    const branchId = isSuperAdmin ? form.branch : user?.branchId;
    if (!branchId) {
      setError('Branch is required.');
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        branch: Number(branchId),
        plate_number: form.plate_number.trim(),
        name: form.name.trim() || undefined,
      };
      
      if (editingVehicle) {
        await ronda.vehicles.update(editingVehicle.id, payload);
        setVehicles((prev) => prev.map((v) => v.id === editingVehicle.id ? { ...v, ...payload } : v));
      } else {
        const created = await ronda.vehicles.create(payload);
        setVehicles((prev) => [...prev, created]);
      }
      
      setForm({
        branch: '',
        plate_number: '',
        name: '',
      });
      setEditingVehicle(null);
    } catch (e) {
      const msg = e?.response?.data && typeof e.response.data === 'object'
        ? JSON.stringify(e.response.data)
        : e.message || 'Failed to save vehicle';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredVehicles = vehicles.filter((v) => {
    if (filters.branch !== 'all' && v.branch?.id !== parseInt(filters.branch)) return false;
    if (filters.status !== 'all') {
      const isActive = v.is_active !== false; // Assuming vehicles have is_active field
      if (filters.status === 'active' && !isActive) return false;
      if (filters.status === 'inactive' && isActive) return false;
    }
    return true;
  });

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  if (loading) return <div className="vehicles-loading">Loading vehicles…</div>;

  return (
    <div className="vehicles-page">
      <h2>Vehicles</h2>
      <p className="vehicles-desc">
        Register patrol vehicles to a branch. Drivers choose a vehicle when starting a session.
      </p>

      <div className="vehicles-layout">
        <div className="vehicles-list">
          {/* Filters */}
          <div className="vehicles-filters">
            <div className="filter-group">
              <label>Branch:</label>
              <select 
                value={filters.branch} 
                onChange={(e) => handleFilterChange('branch', e.target.value)}
                className="filter-select"
              >
                <option value="all">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
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
          </div>
          
          <Pagination data={filteredVehicles} itemsPerPage={10}>
            {(currentVehicles) => (
              <table>
                <thead>
                  <tr>
                    <th>Plate number</th>
                    <th>Name</th>
                    <th>Branch</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentVehicles.map((v) => (
                    <tr key={v.id}>
                      <td>{v.plate_number}</td>
                      <td>{v.name || '—'}</td>
                      <td>{v.branch_name || v.branch?.name || '—'}</td>
                      <td>
                        <button 
                          onClick={() => handleEdit(v)} 
                          className="btn btn-small btn-secondary"
                          style={{ marginRight: '5px' }}
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(v.id)} 
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

        <div className="vehicles-form-card">
          <h3>{editingVehicle ? 'Edit vehicle' : 'Register vehicle'}</h3>
          <form onSubmit={handleUpdate} className="vehicles-form">
            {isSuperAdmin && (
              <label>
                Branch
                <select name="branch" value={form.branch} onChange={handleChange} required>
                  <option value="">— Select branch —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Plate number
              <input
                type="text"
                name="plate_number"
                value={form.plate_number}
                onChange={handleChange}
                required
                placeholder="e.g. PNP-B001-01"
              />
            </label>
            <label>
              Name (optional)
              <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Patrol Vehicle 1" />
            </label>
            {error && <p className="vehicles-error-inline">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : (editingVehicle ? 'Update vehicle' : 'Register vehicle')}
            </button>
            {editingVehicle && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setEditingVehicle(null);
                  setForm({
                    branch: '',
                    plate_number: '',
                    name: '',
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
