import React, { useEffect, useState } from 'react';
import * as ronda from '../api/ronda';
import { Pagination } from '../components/Pagination';
import './UsersPage.css';

const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'BRANCH_ADMIN', label: 'Branch Admin' },
  { value: 'DRIVER', label: 'Driver' },
];

export function UsersPage() {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'DRIVER',
    branch: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  
  // Filter states
  const [filters, setFilters] = useState({
    role: 'all',
    branch: 'all',
    status: 'all'
  });

  useEffect(() => {
    async function load() {
      try {
        const [u, b] = await Promise.all([ronda.users.list(), ronda.branches.list()]);
        setUsers(u);
        setBranches(b);
      } catch (e) {
        setError(e.message || 'Failed to load users');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setForm({
      username: user.username,
      email: user.email || '',
      password: '',
      confirmPassword: '',
      role: user.role,
      branch: user.branch?.id || '',
    });
    setError('');
    setFieldErrors({});
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    
    try {
      await ronda.users.remove(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to delete user');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    
    if (!form.username || !form.role) {
      setError('Username and role are required.');
      return;
    }
    if (form.password && form.password.length < 6) {
      setFieldErrors({ password: 'Password must be at least 6 characters long.' });
      return;
    }
    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        username: form.username,
        email: form.email || undefined,
        password: form.password || undefined,
        role: form.role,
        branch: form.branch || null,
      };
      
      if (editingUser) {
        await ronda.users.update(editingUser.id, payload);
        setUsers((prev) => prev.map((u) => u.id === editingUser.id ? { ...u, ...payload } : u));
      } else {
        const created = await ronda.users.create(payload);
        setUsers((prev) => [...prev, created]);
      }
      
      setForm({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'DRIVER',
        branch: '',
      });
      setEditingUser(null);
    } catch (e) {
      // Handle field-specific validation errors
      if (e?.response?.data?.error && e?.response?.data?.details) {
        const errorData = e.response.data;
        if (typeof errorData.details === 'object') {
          setFieldErrors(errorData.details);
        } else {
          setError(errorData.details || errorData.error);
        }
      } else if (e?.response?.data && typeof e.response.data === 'object') {
        // Handle any other object errors
        setFieldErrors(e.response.data);
      } else {
        setError(e.message || 'Failed to save user');
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (filters.role !== 'all' && u.role !== filters.role) return false;
    if (filters.branch !== 'all' && u.branch?.id !== parseInt(filters.branch)) return false;
    if (filters.status !== 'all') {
      const isActive = u.is_active;
      if (filters.status === 'active' && !isActive) return false;
      if (filters.status === 'inactive' && isActive) return false;
    }
    return true;
  });

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  if (loading) return <div className="users-loading">Loading users…</div>;
  if (error) return <div className="users-error">{error}</div>;

  return (
    <div className="users-page">
      <h2>User Management</h2>
      <p className="users-desc">
        Super Admin can manage all users. Branch Admin can manage drivers in their branch.
      </p>

      <div className="users-layout">
        <div className="users-list">
          {/* Filters */}
          <div className="users-filters">
            <div className="filter-group">
              <label>Role:</label>
              <select 
                value={filters.role} 
                onChange={(e) => handleFilterChange('role', e.target.value)}
                className="filter-select"
              >
                <option value="all">All Roles</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="BRANCH_ADMIN">Branch Admin</option>
                <option value="DRIVER">Driver</option>
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
          
          <Pagination data={filteredUsers} itemsPerPage={10}>
            {(currentUsers) => (
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Branch</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentUsers.map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>{u.role}</td>
                      <td>{u.branch_name || '—'}</td>
                      <td>{u.email || '—'}</td>
                      <td>{u.is_active ? 'Active' : 'Inactive'}</td>
                      <td>
                        <button 
                          onClick={() => handleEdit(u)} 
                          className="btn btn-small btn-secondary"
                          style={{ marginRight: '5px' }}
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(u.id)} 
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

        <div className="users-form-card">
          <h3>{editingUser ? 'Edit user' : 'Create user'}</h3>
          <form onSubmit={handleUpdate} className="users-form">
            <label>
              Username
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                required
                className={fieldErrors.username ? 'field-error' : ''}
              />
              {fieldErrors.username && (
                <span className="field-error-message">{fieldErrors.username}</span>
              )}
            </label>
            <label>
              Email
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className={fieldErrors.email ? 'field-error' : ''}
              />
              {fieldErrors.email && (
                <span className="field-error-message">{fieldErrors.email}</span>
              )}
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required={!editingUser}
                minLength="6"
                className={fieldErrors.password ? 'field-error' : ''}
              />
              {fieldErrors.password && (
                <span className="field-error-message">{fieldErrors.password}</span>
              )}
            </label>
            <label>
              Confirm Password
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                required={!editingUser}
                minLength="6"
                className={fieldErrors.confirmPassword || (form.confirmPassword && form.password !== form.confirmPassword) ? 'field-error' : ''}
              />
              {(fieldErrors.confirmPassword || (form.confirmPassword && form.password !== form.confirmPassword)) && (
                <span className="field-error-message">
                  {fieldErrors.confirmPassword || 'Passwords do not match'}
                </span>
              )}
            </label>
            <label>
              Role
              <select name="role" value={form.role} onChange={handleChange} className={fieldErrors.role ? 'field-error' : ''}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {fieldErrors.role && (
                <span className="field-error-message">{fieldErrors.role}</span>
              )}
            </label>
            <label>
              Branch
              <select name="branch" value={form.branch} onChange={handleChange}>
                <option value="">(None / Main)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </label>
            {error && <p className="users-error-inline">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : (editingUser ? 'Update user' : 'Create user')}
            </button>
            {editingUser && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setEditingUser(null);
                  setForm({
                    username: '',
                    email: '',
                    password: '',
                    confirmPassword: '',
                    role: 'DRIVER',
                    branch: '',
                  });
                  setError('');
                  setFieldErrors({});
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

