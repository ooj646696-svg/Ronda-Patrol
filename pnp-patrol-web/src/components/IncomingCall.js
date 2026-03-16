import React, { useState, useEffect } from 'react';
import axios from 'axios';

const IncomingCall = ({ call, onAccept, onReject, currentUser }) => {
  const [isRinging, setIsRinging] = useState(true);

  useEffect(() => {
    // Simulate ringing sound
    const ringInterval = setInterval(() => {
      setIsRinging(prev => !prev);
    }, 1000);

    return () => clearInterval(ringInterval);
  }, []);

  const handleAccept = async () => {
    try {
      await axios.post(`/api/video-calls/${call.id}/accept/`);
      onAccept(call);
    } catch (error) {
      console.error('Error accepting call:', error);
    }
  };

  const handleReject = async () => {
    try {
      await axios.post(`/api/video-calls/${call.id}/reject/`);
      onReject(call);
    } catch (error) {
      console.error('Error rejecting call:', error);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      zIndex: 2000,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '30px',
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%'
      }}>
        {/* Caller Info */}
        <div style={{ marginBottom: '30px' }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: '#007bff',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 15px',
            fontSize: '32px'
          }}>
            👤
          </div>
          <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>
            Incoming Video Call
          </h3>
          <div style={{ fontSize: '18px', color: '#666', marginBottom: '10px' }}>
            {call.initiator_name}
          </div>
          <div style={{ fontSize: '14px', color: '#999' }}>
            {call.session_info ? `From ${call.session_info.branch_name}` : 'Admin calling'}
          </div>
          {isRinging && (
            <div style={{
              color: '#28a745',
              fontSize: '14px',
              marginTop: '10px',
              fontWeight: 'bold'
            }}>
              🔔 Ringing...
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '20px',
          justifyContent: 'center'
        }}>
          <button
            onClick={handleReject}
            style={{
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '15px 30px',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              minWidth: '120px'
            }}
          >
            📞 Decline
          </button>
          
          <button
            onClick={handleAccept}
            style={{
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              padding: '15px 30px',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              minWidth: '120px'
            }}
          >
            📹 Accept
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCall;
