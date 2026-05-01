/**
 * Notification Context
 * Manages push notification initialization and state
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { notificationService } from '../services/notifications';

interface NotificationContextType {
  isInitialized: boolean;
  hasPermission: boolean;
  error: string | null;
}

const NotificationContext = createContext<NotificationContextType>({
  isInitialized: false,
  hasPermission: false,
  error: null,
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        console.log('Initializing notification service...');
        
        // Request permissions first
        const permission = await notificationService.requestPermissions();
        setHasPermission(permission);
        
        if (!permission) {
          setError('Notification permission denied');
          return;
        }

        // Initialize the service (registers token, sets up listeners)
        await notificationService.initialize();
        setIsInitialized(true);
        setError(null);
        
        console.log('Notification service initialized successfully');
      } catch (err: any) {
        console.error('Failed to initialize notifications:', err);
        setError(err.message || 'Failed to initialize notifications');
      }
    };

    initializeNotifications();
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        isInitialized,
        hasPermission,
        error,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
