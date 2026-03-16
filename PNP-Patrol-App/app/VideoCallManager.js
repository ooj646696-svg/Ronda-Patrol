import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAccessToken, getWsBaseUrl } from '../lib/endpoints';

const VideoCallContext = createContext();

export const useVideoCall = () => {
  const context = useContext(VideoCallContext);
  if (!context) {
    throw new Error('useVideoCall must be used within VideoCallProvider');
  }
  return context;
};

export const VideoCallProvider = ({ children }) => {
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [websocket, setWebsocket] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    initializeVideoCallManager();
    
    return () => {
      if (websocket) {
        websocket.close();
      }
    };
  }, []);

  const initializeVideoCallManager = async () => {
    try {
      // Get current user info
      const token = await getAccessToken();
      
      if (!token) return;

      // Initialize WebSocket connection
      const wsUrl = `${getWsBaseUrl()}/ws/call/?token=${token}`;
      const ws = new WebSocket(wsUrl);
      setWebsocket(ws);

      ws.onopen = () => {
        console.log('Mobile video call WebSocket connected');
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
        console.log('Mobile video call WebSocket disconnected');
      };

      ws.onerror = (error) => {
        console.error('Mobile WebSocket error:', error);
      };

    } catch (error) {
      console.error('Error initializing video call manager:', error);
    }
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'incoming_call':
        // Check if we're not already in a call
        if (!activeCall && !incomingCall) {
          setIncomingCall(data);
        }
        break;
      case 'call_accepted':
        // Move from incoming to active call
        if (incomingCall && incomingCall.id === data.call_id) {
          setActiveCall({
            ...data,
            status: 'ACTIVE'
          });
          setIncomingCall(null);
        }
        break;
      case 'call_rejected':
        // Clear incoming call if it matches
        if (incomingCall && incomingCall.id === data.call_id) {
          setIncomingCall(null);
        }
        break;
      case 'call_ended':
        // Clear both active and incoming calls
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
    setIncomingCall(null);
  };

  const value = {
    activeCall,
    incomingCall,
    websocket,
    currentUser,
    setActiveCall,
    setIncomingCall,
    handleAcceptCall,
    handleRejectCall,
    handleEndCall
  };

  return (
    <VideoCallContext.Provider value={value}>
      {children}
    </VideoCallContext.Provider>
  );
};

export default VideoCallProvider;
