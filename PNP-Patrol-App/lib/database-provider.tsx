/**
 * Database Provider for RONDA App
 * Initializes SQLite database when app starts
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { databaseService } from '@/services/database';

interface DatabaseContextType {
  isInitialized: boolean;
  isInitializing: boolean;
  error: string | null;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        console.log('🗄️ Initializing SQLite database...');
        await databaseService.init();
        setIsInitialized(true);
        setError(null);
        console.log(' SQLite database initialized successfully');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown database error';
        setError(errorMessage);
        console.error('❌ Failed to initialize database:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeDatabase();
  }, []);

  return (
    <DatabaseContext.Provider value={{
      isInitialized,
      isInitializing,
      error
    }}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within DatabaseProvider');
  }
  return context;
}
