/**
 * useSession Hook
 * Custom hook for session management
 */
import { useState, useEffect, useCallback } from 'react';
import { sessionsApi } from '../api/sessions';
import { DriverSession, SessionStartRequest } from '../types';

export function useSession() {
  const [session, setSession] = useState<DriverSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await sessionsApi.list();
      // Handle both array and paginated response
      const sessions = Array.isArray(response) ? response : (response.results || []);
      const activeSession = sessions.find((s) => s.is_active) || null;
      console.log('Active session:', activeSession ? `ID ${activeSession.id}` : 'None');
      setSession(activeSession);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  const startSession = useCallback(async (data: SessionStartRequest) => {
    setLoading(true);
    setError(null);
    try {
      const newSession = await sessionsApi.start(data);
      console.log('New session created:', newSession);
      console.log('Session is_active:', newSession.is_active);
      setSession(newSession);
      return newSession;
    } catch (err: any) {
      setError(err.message || 'Failed to start session');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const stopSession = useCallback(async (sessionId: number) => {
    setLoading(true);
    setError(null);
    try {
      const stoppedSession = await sessionsApi.stop(sessionId);
      setSession(null);
      return stoppedSession;
    } catch (err: any) {
      setError(err.message || 'Failed to stop session');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    session,
    loading,
    error,
    hasActiveSession: !!session?.is_active,
    fetchSessions,
    startSession,
    stopSession,
    refreshSession,
  };
}
