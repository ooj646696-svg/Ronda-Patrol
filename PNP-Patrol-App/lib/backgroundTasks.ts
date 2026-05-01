/**
 * R.O.N.D.A. Driver App — Background Task Manager
 * Keeps app aware of session state even when backgrounded
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus, AppStateStatic } from 'react-native';
import { ronda } from './api';

let backgroundInterval: any = null;
let isAppInForeground = true;

export async function initializeBackgroundTracking(): Promise<void> {
  try {
    // Start monitoring app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Store subscription for cleanup
    (global as any).appStateSubscription = subscription;
    
    // Start periodic session check
    startSessionCheck();
    
    console.log(' Background tracking initialized');
  } catch (error) {
    console.error('❌ Failed to initialize background tracking:', error);
  }
}

export async function cleanupBackgroundTracking(): Promise<void> {
  try {
    // Clear interval
    if (backgroundInterval) {
      clearInterval(backgroundInterval);
      backgroundInterval = null;
    }
    
    // Remove app state listener
    const subscription = (global as any).appStateSubscription;
    if (subscription && subscription.remove) {
      subscription.remove();
    }
    
    console.log(' Background tracking cleaned up');
  } catch (error) {
    console.error('❌ Failed to cleanup background tracking:', error);
  }
}

function handleAppStateChange(nextAppState: AppStateStatus): void {
  const wasInForeground = isAppInForeground;
  isAppInForeground = nextAppState === 'active';
  
  console.log(`📱 App state: ${wasInForeground ? 'background' : 'foreground'} → ${isAppInForeground ? 'foreground' : 'background'}`);
  
  // When app comes to foreground, check session status
  if (!wasInForeground && isAppInForeground) {
    checkActiveSession();
  }
}

function startSessionCheck(): void {
  // Check session status every 30 seconds
  backgroundInterval = setInterval(() => {
    if (isAppInForeground) {
      checkActiveSession();
    }
  }, 30000);
}

async function checkActiveSession(): Promise<void> {
  try {
    const userId = await AsyncStorage.getItem('currentUserId');
    if (!userId) return;
    
    const sessions = await ronda.sessions.list();
    const activeSession = sessions.find((s: any) => s.driver_id === parseInt(userId) && s.is_active);
    
    if (activeSession) {
      console.log(' Active session confirmed for user:', userId);
    } else {
      console.log('⚠️ No active session found for user:', userId);
    }
  } catch (error) {
    console.error('❌ Error checking active session:', error);
  }
}

export async function startBackgroundSessionTracking(userId: number): Promise<void> {
  try {
    await AsyncStorage.setItem('currentUserId', userId.toString());
    console.log('📍 Background session tracking started for user:', userId);
  } catch (error) {
    console.error('❌ Failed to start background session tracking:', error);
  }
}

export async function stopBackgroundSessionTracking(): Promise<void> {
  try {
    await AsyncStorage.removeItem('currentUserId');
    console.log('⏹️ Background session tracking stopped');
  } catch (error) {
    console.error('❌ Failed to stop background session tracking:', error);
  }
}
