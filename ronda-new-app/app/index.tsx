/**
 * Index Screen
 * Redirects to login or tabs based on authentication
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';

export default function IndexScreen() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        router.replace('/(tabs)' as any);
      } else {
        router.replace('/login' as any);
      }
    }
  }, [isAuthenticated, loading, router]);

  return null;
}
