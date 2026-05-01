/**
 * Ping Polling Context
 * Manages polling for pending pings from backend (alternative to push notifications)
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { pingPollingService, type PendingPing } from '../services/pingPolling';
import { router } from 'expo-router';

interface PingPollingContextType {
  isPolling: boolean;
  error: string | null;
}

const PingPollingContext = createContext<PingPollingContextType>({
  isPolling: false,
  error: null,
});

export function PingPollingProvider({ children }: { children: React.ReactNode }) {
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializePingPolling = () => {
      try {
        console.log('Initializing ping polling service...');
        
        // Track which pings we've already shown alerts for to prevent duplicates
        const handledPingIds = new Set<number>();
        
        // Set up callback for when a ping is received
        pingPollingService.onPingReceived((ping: PendingPing) => {
          console.log('Ping received via polling:', ping);
          
          // Skip if we already handled this ping
          if (handledPingIds.has(ping.id)) {
            console.log('Ping already handled, skipping:', ping.id);
            return;
          }
          
          handledPingIds.add(ping.id);
          
          // Show alert to notify driver
          Alert.alert(
            'Ping Received',
            ping.message || 'Please respond to confirm your status',
            [
              { 
                text: 'Ignore', 
                style: 'cancel',
                onPress: () => {
                  // Remove from handled set so it can trigger again if needed
                  handledPingIds.delete(ping.id);
                }
              },
              { 
                text: 'Respond', 
                onPress: () => {
                  router.push(`/ping-response/${ping.id}` as any);
                }
              }
            ]
          );
        });
        
        // Start polling
        pingPollingService.startPolling();
        setIsPolling(true);
        setError(null);
        
        console.log('Ping polling service started successfully');
      } catch (err: any) {
        console.error('Failed to initialize ping polling:', err);
        setError(err.message || 'Failed to initialize ping polling');
      }
    };

    initializePingPolling();

    // Cleanup on unmount
    return () => {
      pingPollingService.stopPolling();
    };
  }, []);

  return (
    <PingPollingContext.Provider
      value={{
        isPolling,
        error,
      }}
    >
      {children}
    </PingPollingContext.Provider>
  );
}

export function usePingPolling() {
  const context = useContext(PingPollingContext);
  if (!context) {
    throw new Error('usePingPolling must be used within PingPollingProvider');
  }
  return context;
}
