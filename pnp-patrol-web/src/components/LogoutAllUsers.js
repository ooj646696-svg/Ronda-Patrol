import React, { useState } from 'react';
import api from '../api/client';

const LogoutAllUsers = ({ onLogoutSuccess, onLogoutError }) => {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleLogoutAll = async () => {
    setLoading(true);
    try {
      console.log('🔄 Attempting to logout all users');
      const response = await api.post('/users/logout_all_users/');
      console.log(' Logout all successful:', response.data);
      onLogoutSuccess(response.data);
      setShowConfirm(false);
    } catch (error) {
      console.error('❌ Logout all failed:', error);
      console.error('Error response:', error.response);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to logout all users';
      console.error('Error message to show:', errorMessage);
      onLogoutError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="logout-all-users">
      {showConfirm ? (
        <div className="confirm-logout-all">
          <div className="confirm-message">
            <svg className="warning-icon" fill="currentColor" viewBox="0 0 20 20" width="20" height="20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p>Logout ALL users?</p>
            <small>This will force logout all users except you and stop all active sessions.</small>
          </div>
          <div className="confirm-actions">
            <button
              className="btn btn-danger"
              onClick={handleLogoutAll}
              disabled={loading}
            >
              {loading ? 'Logging out all...' : 'Yes, Logout All'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowConfirm(false)}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-danger"
          onClick={() => setShowConfirm(true)}
          title="Force logout all users except you"
        >
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" style={{ marginRight: '6px' }}>
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
          </svg>
          Logout All Users
        </button>
      )}
    </div>
  );
};

export default LogoutAllUsers;
