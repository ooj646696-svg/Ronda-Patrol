# Video Call Setup Guide

## 🎯 Overview
This guide will help you set up the complete video calling system for RONDA Patrol monitoring.

## 📋 Prerequisites Checklist

### ✅ Backend Dependencies
- [x] Django Channels installed
- [x] Redis configured in settings
- [x] WebSocket consumers created
- [x] ASGI application configured
- [ ] Redis server running

### ✅ Frontend Dependencies  
- [x] WebRTC dependencies installed (simple-peer, socket.io-client)
- [x] Video call components created
- [ ] Mobile app dependencies installed

## 🚀 Quick Start Commands

### 1. Start Redis Server
```bash
# Option 1: If you have Redis installed
redis-server

# Option 2: Using Docker (recommended)
docker run -d -p 6379:6379 redis:alpine

# Option 3: Download Redis for Windows
# https://github.com/microsoftarchive/redis/releases
```

### 2. Run Django Backend with ASGI
```bash
cd backend
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### 3. Install Mobile Dependencies
```bash
cd "c:\Patrol\RONDA-Patrol-monitoring-web-app\PNP-Patrol-App"
npm install expo
npx expo install react-native-webrtc @react-native-async-storage/async-storage
```

### 4. Start Mobile App
```bash
cd "c:\Patrol\RONDA-Patrol-monitoring-web-app\PNP-Patrol-App"
npx expo start --tunnel
```

### 5. Start Web Frontend
```bash
cd "c:\Patrol\RONDA-Patrol-monitoring-web-app\pnp-patrol-web"
npm start
```

## 🔧 Configuration Files Created

### Backend Settings Added
```python
# backend/backend/settings.py
INSTALLED_APPS = [
    # ... existing apps ...
    'channels',  # ← Added
    # ... rest of apps
]

ASGI_APPLICATION = 'patrol_api.asgi.application'  # ← Changed from WSGI

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [{'host': 'localhost', 'port': 6379}],
        },
    },
}
```

### Backend Files Created
- `backend/patrol_api/asgi.py` - ASGI application
- `backend/patrol_api/routing.py` - WebSocket routing
- `backend/patrol_api/consumers.py` - WebSocket consumers

### Frontend Components Created
- `pnp-patrol-web/src/components/VideoCall.js` - Main video call interface
- `pnp-patrol-web/src/components/VideoCallButton.js` - Call initiation button
- `pnp-patrol-web/src/components/IncomingCall.js` - Incoming call modal
- `pnp-patrol-web/src/components/VideoCallManager.js` - WebSocket management

### Mobile Components Created
- `PNP-Patrol-App/app/VideoCallScreen.js` - Mobile video call interface
- `PNP-Patrol-App/app/IncomingCallScreen.js` - Mobile incoming call
- `PNP-Patrol-App/app/VideoCallManager.js` - Mobile WebSocket management

## 📱 How to Use Video Calls

### For Admins (Web Dashboard)
1. Go to Live Map page
2. Click on any driver marker
3. In the popup, click "📹 Video Call"
4. Wait for driver to accept
5. Start video conversation

### For Drivers (Mobile App)
1. Keep app open and connected
2. Receive incoming call notification
3. Tap "📹 Accept" to join call
4. Use controls to mute/unmute, toggle video
5. Tap "📞 End Call" when finished

## 🐛 Troubleshooting

### Redis Connection Issues
```bash
# Test Redis connection
redis-cli ping

# Check if Redis is running on port 6379
netstat -an | findstr 6379
```

### WebSocket Connection Issues
1. Ensure Redis server is running
2. Check ALLOWED_HOSTS includes your IP
3. Verify Django ASGI application is working
4. Check browser console for WebSocket errors

### Mobile App Issues
1. Ensure all dependencies installed: `npx expo install`
2. Check camera/microphone permissions
3. Use Expo tunnel for network testing
4. Verify API URLs are accessible

## 🎯 Next Steps

Once everything is running:
1. **Test the complete flow**: Admin calls driver → Driver accepts → Video connects
2. **Verify WebRTC signaling**: Check browser DevTools for WebSocket messages
3. **Test call controls**: Mute, video toggle, end call
4. **Check call history**: Verify calls are logged in database

## 📞 Support

If you encounter issues:
1. Check Redis is running on port 6379
2. Verify Django is running with ASGI (not WSGI)
3. Ensure all dependencies are installed
4. Check browser/network console for error messages

The video calling system is now fully implemented and ready for testing! 🚀
