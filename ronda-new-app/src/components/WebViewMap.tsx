import React, { useRef, useEffect, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { LocationData } from '../services/location';

interface WebViewMapProps {
  currentLocation: LocationData | null;
  onMapReady?: () => void;
}

const WebViewMap = forwardRef<WebView, WebViewMapProps>(({ currentLocation, onMapReady }, ref) => {

  // HTML content with Leaflet map
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html {
          margin: 0;
          padding: 0;
          height: 100%;
          width: 100%;
          overflow: hidden;
        }
        #map {
          height: 100vh;
          width: 100vw;
        }
        .leaflet-control-zoom {
          position: absolute !important;
          bottom: 180px !important;
          right: 16px !important;
          top: auto !important;
          left: auto !important;
        }
        .leaflet-control-zoom a {
          background: rgba(255, 255, 255, 0.9) !important;
          color: #333 !important;
          width: 36px !important;
          height: 36px !important;
          line-height: 34px !important;
          font-size: 18px !important;
          border-radius: 8px !important;
          margin-bottom: 8px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        // Initialize map centered on Lucena, Quezon with zoom controls
        let map = L.map('map', {
          zoomControl: true
        }).setView([13.9333, 121.6167], 16);
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18,
          minZoom: 8
        }).addTo(map);
        
        // Current location marker
        let currentMarker = null;
        let accuracyCircle = null;
        
        // Function to create directional marker
        function createDirectionalMarker(latitude, longitude, heading) {
          const iconHtml = heading !== null && heading !== undefined ? 
            \`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
              <circle cx="20" cy="24" r="18" fill="#2ECC40" stroke="#27AE60" stroke-width="3"/>
              <line x1="20" y1="24" x2="\${20 + Math.cos((heading - 90) * Math.PI / 180) * 14}" 
                    y2="\${24 + Math.sin((heading - 90) * Math.PI / 180) * 14}" 
                    stroke="white" stroke-width="2.5" stroke-linecap="round"/>
              <polygon points="\${20 + Math.cos((heading - 90) * Math.PI / 180) * 14},\${24 + Math.sin((heading - 90) * Math.PI / 180) * 14} 
                           \${20 + Math.cos((heading - 90) * Math.PI / 180) * 14 - Math.cos((heading - 90 + 45) * Math.PI / 180) * 4},\${24 + Math.sin((heading - 90) * Math.PI / 180) * 14 - Math.sin((heading - 90 + 45) * Math.PI / 180) * 4}
                           \${20 + Math.cos((heading - 90) * Math.PI / 180) * 14 - Math.cos((heading - 90 - 45) * Math.PI / 180) * 4},\${24 + Math.sin((heading - 90) * Math.PI / 180) * 14 - Math.sin((heading - 90 - 45) * Math.PI / 180) * 4}" 
                       fill="white"/>
              <text x="20" y="28" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="Arial, sans-serif">YOU</text>
            </svg>\` :
            \`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
              <circle cx="20" cy="24" r="18" fill="#2ECC40" stroke="#27AE60" stroke-width="3"/>
              <text x="20" y="28" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="Arial, sans-serif">YOU</text>
            </svg>\`;
          
          return L.divIcon({
            html: iconHtml,
            className: 'custom-directional-marker',
            iconSize: [40, 48],
            iconAnchor: [20, 48],
            popupAnchor: [0, -48]
          });
        }
        
        // Function to update location
        function updateLocation(latitude, longitude, accuracy, heading) {
          // Remove existing marker and circle
          if (currentMarker) {
            map.removeLayer(currentMarker);
          }
          if (accuracyCircle) {
            map.removeLayer(accuracyCircle);
          }
          
          // Add new marker with direction
          currentMarker = L.marker([latitude, longitude], {
            icon: createDirectionalMarker(latitude, longitude, heading)
          })
            .addTo(map)
            .bindPopup('Your Location<br>Accuracy: ' + accuracy + 'm<br>Heading: ' + (heading !== null ? heading + '°' : 'N/A'));
          
          // Add accuracy circle
          if (accuracy) {
            accuracyCircle = L.circle([latitude, longitude], {
              radius: accuracy,
              fillColor: '#2ECC40',
              fillOpacity: 0.2,
              strokeColor: '#2ECC40',
              strokeOpacity: 0.5,
              strokeWidth: 2
            }).addTo(map);
          }
          
          // Center map on new location
          map.setView([latitude, longitude], 12);
        }
        
        // Notify React Native that map is ready
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'mapReady'
        }));
        
        // Listen for messages from React Native
        document.addEventListener('message', function(event) {
          const data = JSON.parse(event.data);
          if (data.type === 'locationUpdate' && data.location) {
            updateLocation(data.location.latitude, data.location.longitude, data.location.accuracy, data.location.heading);
          }
          if (data.type === 'centerLocation' && data.location) {
            console.log('Centering map to:', data.location);
            map.setView([data.location.latitude, data.location.longitude], 16, { animate: true });
          }
        });
        
        // Set bounds to Quezon province
        map.setMaxBounds([[13.2, 121.0], [14.5, 122.2]]);
      </script>
    </body>
    </html>
  `;

  // Send location updates to WebView
  useEffect(() => {
    if (currentLocation && ref) {
      (ref as any).current?.postMessage(JSON.stringify({
        type: 'locationUpdate',
        location: currentLocation
      }));
    }
  }, [currentLocation, ref]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapReady' && onMapReady) {
        onMapReady();
      }
    } catch (error) {
      console.error('WebView message error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={ref}
        source={{ html: htmlContent }}
        style={styles.webView}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={false}
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
});

export default WebViewMap;
