/**
 * R.O.N.D.A. — Offline GPS queue: store when offline, sync when online.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ronda } from './api';

const QUEUE_KEY = '@ronda_gps_queue';

export interface QueuedGps {
  sessionId: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number | null;
  speed?: number | null;
  altitude?: number | null;
  isValid?: boolean;
  rejectionReason?: string;
  accuracyScore?: number;
}

export async function getQueue(): Promise<QueuedGps[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function pushToQueue(item: QueuedGps): Promise<void> {
  const queue = await getQueue();
  queue.push(item);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function setQueue(queue: QueuedGps[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  const queue = await getQueue();
  let sent = 0;
  let failed = 0;
  const remaining: QueuedGps[] = [];
  for (const item of queue) {
    try {
      await ronda.gpsLogs.create(
        item.sessionId,
        item.latitude,
        item.longitude,
        item.timestamp,
        item.accuracy,
        item.speed,
        item.altitude
      );
      sent++;
    } catch (error: any) {
      // If session doesn't exist, clear the entire queue
      if (error.response?.data?.session?.includes('Invalid pk') || 
          error.response?.data?.session?.includes('object does not exist')) {
        console.warn('🗑️ Clearing GPS queue due to invalid session');
        // Clear all remaining items since they likely have the same invalid session
        remaining.length = 0;
      } else {
        failed++;
        remaining.push(item);
      }
    }
  }
  await setQueue(remaining);
  return { sent, failed };
}
