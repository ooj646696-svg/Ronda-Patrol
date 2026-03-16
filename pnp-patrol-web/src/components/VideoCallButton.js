import React, { useState } from 'react';
import axios from 'axios';

const VideoCallButton = ({ driverId, driverName, sessionId, disabled }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const initiateCall = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/video-calls/initiate/', {
        recipient_id: driverId,
        session_id: sessionId
      });

      // You could emit a WebSocket event here or handle the call UI
      console.log('Call initiated:', response.data);
      
      // For now, just show an alert
      alert(`Call initiated to ${driverName}. The driver will receive a notification.`);
      
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to initiate call';
      setError(errorMessage);
      console.error('Call initiation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={initiateCall}
        disabled={disabled || isLoading}
        style={{
          backgroundColor: disabled || isLoading ? '#6c757d' : '#28a745',
          color: 'white',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '4px',
          cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        {isLoading ? (
          <>
            <span>🔄</span>
            <span>Calling...</span>
          </>
        ) : (
          <>
            <span>📹</span>
            <span>Video Call</span>
          </>
        )}
      </button>

      {error && (
        <div style={{
          color: '#dc3545',
          fontSize: '12px',
          marginTop: '4px'
        }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default VideoCallButton;
