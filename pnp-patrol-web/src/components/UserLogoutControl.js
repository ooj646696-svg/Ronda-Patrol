import React, { useState } from 'react';
import api from '../api/client';

const UserLogoutControl = ({ user, onLogoutSuccess, onLogoutError }) => {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleForceLogout = async () => {
    setLoading(true);
    try {
      console.log('🔄 Attempting to logout user:', user);
      const response = await api.post(`/users/${user.id}/force_logout/`);
      console.log('✅ Logout successful:', response.data);
      onLogoutSuccess(response.data);
      setShowConfirm(false);
    } catch (error) {
      console.error('❌ Logout failed:', error);
      console.error('Error response:', error.response);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to logout user';
      console.error('Error message to show:', errorMessage);
      onLogoutError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="user-logout-control">
      {showConfirm ? (
        <div className="confirm-logout">
          <div className="confirm-message">
            <svg className="warning-icon" fill="currentColor" viewBox="0 0 20 20" width="20" height="20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p>Force logout {user.username}?</p>
            <small>This will stop their active sessions and require them to login again.</small>
          </div>
          <div className="confirm-actions">
            <button
              className="btn btn-danger"
              onClick={handleForceLogout}
              disabled={loading}
            >
              {loading ? 'Logging out...' : 'Yes, Logout'}
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
          className="btn btn-outline-danger btn-sm"
          onClick={() => setShowConfirm(true)}
          title={`Force logout ${user.username}`}
        >
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20" style={{ marginRight: '4px' }}>
            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
          </svg>
          Logout
        </button>
      )}
    </div>
  );
};

export default UserLogoutControl;
