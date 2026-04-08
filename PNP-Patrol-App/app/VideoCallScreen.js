// VideoCallScreen temporarily disabled due to WebRTC compatibility issues
/*
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
// import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { getAccessToken, getApiBaseUrl, getWsBaseUrl } from '../lib/endpoints';

const VideoCallScreen = ({ route, navigation }) => {
  const { call } = route.params;
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [peerConnection, setPeerConnection] = useState(null);
  const [websocket, setWebsocket] = useState(null);
  
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const durationIntervalRef = useRef();

  useEffect(() => {
    if (call) {
      initializeCall();
    }

    return () => {
      cleanup();
    };
  }, [call]);

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
      const stream = await mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setLocalStream(stream);

      // Initialize WebSocket connection
      const token = await getAccessToken();
      const wsUrl = `${getWsBaseUrl()}/ws/call/?token=${token}`;
      const ws = new WebSocket(wsUrl);
      setWebsocket(ws);

      ws.onopen = () => {
        console.log('Mobile WebSocket connected');
      };

      ws.onmessage = handleWebSocketMessage;

      // Create WebRTC peer connection
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      };

      const pc = new RTCPeerConnection(configuration);
      setPeerConnection(pc);

      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          ws.send(JSON.stringify({
            type: 'ice_candidate',
            call_id: call.id,
            candidate: event.candidate
          }));
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          setIsConnected(true);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setIsConnected(true);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setIsConnected(false);
        }
      };

      // Determine if we're the initiator
      const isInitiator = call.initiator_id !== (await AsyncStorage.getItem('user_id'));

      if (isInitiator) {
        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({
          type: 'webrtc_offer',
          call_id: call.id,
          offer: offer
        }));
      }

    } catch (error) {
      console.error('Error initializing mobile call:', error);
      Alert.alert('Error', 'Failed to initialize video call');
    }
  };

  const handleWebSocketMessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'webrtc_offer':
          if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            websocket.send(JSON.stringify({
              type: 'webrtc_answer',
              call_id: call.id,
              answer: answer
            }));
          }
          break;
        case 'webrtc_answer':
          if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
          break;
        case 'ice_candidate':
          if (peerConnection && data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
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
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const handleEndCall = async () => {
    try {
      await axios.post(`${getApiBaseUrl()}/video-calls/${call.id}/end/`);
      
      if (websocket) {
        websocket.send(JSON.stringify({
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
    navigation.goBack();
  };

  const cleanup = () => {
    stopCallTimer();
    
    if (peerConnection) {
      peerConnection.close();
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    if (websocket) {
      websocket.close();
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!call) {
    return (
      <View style={styles.container}>
        <Text>No active call</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
//       {/* Header */
//       <View style={styles.header}>
//         <View>
//           <Text style={styles.headerText}>Call with {call.initiator_name}</Text>
//           <Text style={styles.subHeaderText}>
//             {isConnected ? 'Connected' : 'Connecting...'} • {formatDuration(callDuration)}
//           </Text>
//         </View>
//         <TouchableOpacity style={styles.endButton} onPress={handleEndCall}>
//           <Text style={styles.endButtonText}>End Call</Text>
//         </TouchableOpacity>
//       </View>

//       {/* Video Area */}
//       <View style={styles.videoContainer}>
//         {/* Remote Video */}
//         {remoteStream ? (
//           <RTCView
//             streamURL={remoteStream.toURL()}
//             style={styles.remoteVideo}
//             objectFit="cover"
//           />
//         ) : (
//           <View style={styles.placeholder}>
//             <Text style={styles.placeholderText}>Connecting...</Text>
//           </View>
//         )}

//         {/* Local Video */}
//         {localStream && (
//           <RTCView
//             streamURL={localStream.toURL()}
//             style={styles.localVideo}
//             objectFit="cover"
//             mirror={true}
//           />
//         )}
//       </View>

//       {/* Controls */}
//       <View style={styles.controls}>
//         <TouchableOpacity 
//           style={[styles.controlButton, isMuted && styles.controlButtonActive]} 
//           onPress={toggleMute}
//         >
//           <Text style={styles.controlButtonText}>
//             {isMuted ? '🎤' : '🔇'}
//           </Text>
//         </TouchableOpacity>

//         <TouchableOpacity 
//           style={[styles.controlButton, isVideoOff && styles.controlButtonActive]} 
//           onPress={toggleVideo}
//         >
//           <Text style={styles.controlButtonText}>
//             {isVideoOff ? '📷' : '📹'}
//           </Text>
//         </TouchableOpacity>
//       </View>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: 'black',
//   },
//   header: {
//     backgroundColor: 'rgba(0,0,0,0.8)',
//     paddingVertical: 15,
//     paddingHorizontal: 20,
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//   },
//   headerText: {
//     color: 'white',
//     fontSize: 18,
//     fontWeight: 'bold',
//   },
//   subHeaderText: {
//     color: 'white',
//     fontSize: 12,
//     opacity: 0.8,
//     marginTop: 4,
//   },
//   endButton: {
//     backgroundColor: '#dc3545',
//     paddingHorizontal: 16,
//     paddingVertical: 8,
//     borderRadius: 4,
//   },
//   endButtonText: {
//     color: 'white',
//     fontWeight: 'bold',
//   },
//   videoContainer: {
//     flex: 1,
//     position: 'relative',
//   },
//   remoteVideo: {
//     width: '100%',
//     height: '100%',
//   },
//   localVideo: {
//     position: 'absolute',
//     bottom: 20,
//     right: 20,
//     width: 120,
//     height: 90,
//     borderRadius: 8,
//     borderWidth: 2,
//     borderColor: 'white',
//   },
//   placeholder: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     backgroundColor: '#333',
//   },
//   placeholderText: {
//     color: 'white',
//     fontSize: 18,
//   },
//   controls: {
//     backgroundColor: 'rgba(0,0,0,0.8)',
//     paddingVertical: 20,
//     flexDirection: 'row',
//     justifyContent: 'center',
//     gap: 20,
//   },
//   controlButton: {
//     width: 60,
//     height: 60,
//     borderRadius: 30,
//     backgroundColor: '#28a745',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   controlButtonActive: {
//     backgroundColor: '#dc3545',
//   },
//   controlButtonText: {
//     fontSize: 24,
//   },
// });

// export default VideoCallScreen;
// */

// // Dummy export to prevent import errors
// const VideoCallScreen = () => null;
// export default VideoCallScreen;
