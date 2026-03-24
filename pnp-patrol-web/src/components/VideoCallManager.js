import React, { useState, useEffect, createContext, useContext } from 'react';
import VideoCall from './VideoCall';
import IncomingCall from './IncomingCall';

const VideoCallContext = createContext();

export const useVideoCall = () => {
  const context = useContext(VideoCallContext);
  if (!context) {
    throw new Error('useVideoCall must be used within VideoCallProvider');
  }
  return context;
};

export const VideoCallProvider = ({ children, currentUser }) => {
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [websocket, setWebsocket] = useState(null);

  useEffect(() => {
    if (!currentUser) return;

    // Initialize WebSocket connection
    const token = localStorage.getItem('access_token');
    const wsUrl = `ws://192.168.1.10:8000/ws/call/?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Video call WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('Video call WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWebsocket(ws);

    return () => {
      ws.close();
    };
  }, [currentUser]);

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'incoming_call':
        setIncomingCall(data);
        break;
      case 'call_accepted':
        // Move from incoming to active call
        setActiveCall({
          ...data,
          status: 'ACTIVE'
        });
        setIncomingCall(null);
        break;
      case 'call_rejected':
        setIncomingCall(null);
        break;
      case 'call_ended':
        setActiveCall(null);
        setIncomingCall(null);
        break;
      case 'user_status':
        console.log(`User ${data.user_id} is ${data.status}`);
        break;
    }
  };

  const handleAcceptCall = (call) => {
    setActiveCall({
      ...call,
      status: 'ACTIVE'
    });
    setIncomingCall(null);
  };

  const handleRejectCall = (call) => {
    setIncomingCall(null);
  };

  const handleEndCall = () => {
    setActiveCall(null);
  };

  const value = {
    activeCall,
    incomingCall,
    websocket,
    setActiveCall,
    setIncomingCall
  };

  return (
    <VideoCallContext.Provider value={value}>
      {children}
      
      {/* Incoming Call Modal */}
      {incomingCall && (
        <IncomingCall
          call={incomingCall}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
          currentUser={currentUser}
        />
      )}
      
      {/* Active Call */}
      {activeCall && (
        <VideoCall
          call={activeCall}
          onEndCall={handleEndCall}
          currentUser={currentUser}
        />
      )}
    </VideoCallContext.Provider>
  );
};

export default VideoCallProvider;
