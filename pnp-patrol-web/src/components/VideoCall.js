import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import SimplePeer from 'simple-peer';

const VideoCall = ({ call, onEndCall, currentUser }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peer, setPeer] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const websocketRef = useRef();
  const durationIntervalRef = useRef();

  useEffect(() => {
    if (call && call.status === 'ACTIVE') {
      initializeCall();
    }

    return () => {
      cleanup();
    };
  }, [call]);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (isConnected) {
      startCallTimer();
    } else {
      stopCallTimer();
    }
  }, [isConnected]);

  const initializeCall = async () => {
    try {
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setLocalStream(stream);

      // Initialize WebSocket connection
      const wsUrl = `ws://192.168.1.18:8000/ws/call/?token=${localStorage.getItem('access_token')}`;
      const ws = new WebSocket(wsUrl);
      websocketRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = handleWebSocketMessage;

      // Create WebRTC peer connection
      const isInitiator = call.initiator.id === currentUser.id;
      const newPeer = new SimplePeer({
        initiator: isInitiator,
        trickle: false,
        stream: stream
      });

      newPeer.on('signal', (data) => {
        ws.send(JSON.stringify({
          type: isInitiator ? 'webrtc_offer' : 'webrtc_answer',
          call_id: call.id,
          [isInitiator ? 'offer' : 'answer']: data
        }));
      });

      newPeer.on('stream', (stream) => {
        setRemoteStream(stream);
        setIsConnected(true);
      });

      newPeer.on('connect', () => {
        setIsConnected(true);
      });

      newPeer.on('close', () => {
        setIsConnected(false);
      });

      setPeer(newPeer);

      // If initiator, send offer
      if (isInitiator) {
        // Wait a bit for peer to be ready
        setTimeout(() => {
          newPeer.emit('signal', newPeer._pc.localDescription);
        }, 1000);
      }

    } catch (error) {
      console.error('Error initializing call:', error);
    }
  };

  const handleWebSocketMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'webrtc_offer':
          if (peer && !peer.initiator) {
            peer.signal(data.offer);
          }
          break;
        case 'webrtc_answer':
          if (peer && peer.initiator) {
            peer.signal(data.answer);
          }
          break;
        case 'ice_candidate':
          if (peer) {
            peer.signal(data.candidate);
          }
          break;
        case 'call_ended':
          handleCallEnded();
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  };

  const startCallTimer = () => {
    durationIntervalRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const stopCallTimer = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  const handleEndCall = async () => {
    try {
      // End call via API
      await axios.post(`/api/video-calls/${call.id}/end/`);
      
      // Notify via WebSocket
      if (websocketRef.current) {
        websocketRef.current.send(JSON.stringify({
          type: 'end_call',
          call_id: call.id
        }));
      }
      
      handleCallEnded();
    } catch (error) {
      console.error('Error ending call:', error);
    }
  };

  const handleCallEnded = () => {
    cleanup();
    onEndCall();
  };

  const cleanup = () => {
    stopCallTimer();
    
    if (peer) {
      peer.destroy();
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    if (websocketRef.current) {
      websocketRef.current.close();
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!call) {
    return <div>No active call</div>;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'black',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div>Call with {call.recipient_name}</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>
            {isConnected ? 'Connected' : 'Connecting...'} • {formatDuration(callDuration)}
          </div>
        </div>
        <button
          onClick={handleEndCall}
          style={{
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          End Call
        </button>
      </div>

      {/* Video Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        position: 'relative'
      }}>
        {/* Remote Video */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            backgroundColor: '#333'
          }}
        />

        {/* Local Video */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            width: '200px',
            height: '150px',
            objectFit: 'cover',
            border: '2px solid white',
            borderRadius: '8px'
          }}
        />

        {/* Connection Status */}
        {!isConnected && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>🔄</div>
            <div>Connecting...</div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: '20px',
        display: 'flex',
        justifyContent: 'center',
        gap: '20px'
      }}>
        <button
          onClick={toggleMute}
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: isMuted ? '#dc3545' : '#28a745',
            color: 'white',
            cursor: 'pointer',
            fontSize: '24px'
          }}
        >
          {isMuted ? '🎤' : '🔇'}
        </button>

        <button
          onClick={toggleVideo}
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: isVideoOff ? '#dc3545' : '#28a745',
            color: 'white',
            cursor: 'pointer',
            fontSize: '24px'
          }}
        >
          {isVideoOff ? '📹' : '📷'}
        </button>
      </div>
    </div>
  );
};

export default VideoCall;
