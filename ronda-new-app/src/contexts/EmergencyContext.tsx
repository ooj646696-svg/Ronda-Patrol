/**
 * Emergency Context
 * Manages global emergency state across the app
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Alert, Vibration } from 'react-native';

interface EmergencyState {
  isActive: boolean;
  type: 'EMERGENCY' | 'ASSISTANCE' | null;
  timestamp: Date | null;
  sessionId: number | null;
  description: string;
}

interface EmergencyContextType {
  emergency: EmergencyState;
  triggerEmergency: (type: 'EMERGENCY' | 'ASSISTANCE', sessionId: number, description?: string) => void;
  clearEmergency: () => void;
}

const EmergencyContext = createContext<EmergencyContextType | undefined>(undefined);

export function EmergencyProvider({ children }: { children: ReactNode }) {
  const [emergency, setEmergency] = useState<EmergencyState>({
    isActive: false,
    type: null,
    timestamp: null,
    sessionId: null,
    description: '',
  });

  const triggerEmergency = (type: 'EMERGENCY' | 'ASSISTANCE', sessionId: number, description = '') => {
    setEmergency({
      isActive: true,
      type,
      timestamp: new Date(),
      sessionId,
      description,
    });

    // Vibrate for emergency
    if (type === 'EMERGENCY') {
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    } else {
      Vibration.vibrate([0, 300]);
    }
  };

  const clearEmergency = () => {
    setEmergency({
      isActive: false,
      type: null,
      timestamp: null,
      sessionId: null,
      description: '',
    });
  };

  return (
    <EmergencyContext.Provider value={{ emergency, triggerEmergency, clearEmergency }}>
      {children}
    </EmergencyContext.Provider>
  );
}

export function useEmergency() {
  const context = useContext(EmergencyContext);
  if (context === undefined) {
    throw new Error('useEmergency must be used within an EmergencyProvider');
  }
  return context;
}
