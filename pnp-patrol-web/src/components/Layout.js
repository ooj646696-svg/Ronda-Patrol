import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  return (
    <div className="layout">
      <header className="layout-header">
        <h1 className="layout-title">R.O.N.D.A. Patrol</h1>
        <div className="layout-user">
          <span className="layout-role">{user?.role?.replace('_', ' ')}</span>
          <span className="layout-name">{user?.username}</span>
          <button type="button" className="btn btn-outline" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>
      <nav className="layout-nav">
        <Link to="/" className={`layout-nav-link ${location.pathname === '/' ? 'active' : ''}`}>Dashboard</Link>
        <Link to="/map" className={`layout-nav-link ${location.pathname === '/map' ? 'active' : ''}`}>Live Map</Link>
        <Link to="/incidents" className={`layout-nav-link ${location.pathname === '/incidents' ? 'active' : ''}`}>Incidents</Link>
        <Link to="/sessions" className={`layout-nav-link ${location.pathname === '/sessions' ? 'active' : ''}`}>Session Logs</Link>
        <Link to="/route-history" className={`layout-nav-link ${location.pathname === '/route-history' ? 'active' : ''}`}>Route History</Link>
        <Link to="/snapshots" className={`layout-nav-link ${location.pathname === '/snapshots' ? 'active' : ''}`}>Snapshots</Link>
        {isSuperAdmin && (
          <Link
            to="/users"
            className={`layout-nav-link ${location.pathname === '/users' ? 'active' : ''}`}
          >
            Users
          </Link>
        )}
        {isSuperAdmin && (
          <Link
            to="/branches"
            className={`layout-nav-link ${location.pathname === '/branches' ? 'active' : ''}`}
          >
            Branches
          </Link>
        )}
        <Link
          to="/vehicles"
          className={`layout-nav-link ${location.pathname === '/vehicles' ? 'active' : ''}`}
        >
          Vehicles
        </Link>
      </nav>
      <main className="layout-main">{children}</main>
    </div>
  );
}
