import { ronda } from './api';
import { getOfflineSession, markOfflineSessionSynced } from './offlineSession';
import { remapSessionId, flushQueue } from './gps-queue';
import { photoService } from '@/services/photoService';

export async function trySyncOfflineSession(): Promise<{
  synced: boolean;
  serverSessionId?: number;
  remappedGps?: number;
  gpsFlush?: { sent: number; failed: number };
  photoFlush?: { uploaded: number; failed: number };
}> {
  const offline = await getOfflineSession();
  if (!offline || offline.status !== 'PENDING') {
    return { synced: false };
  }

  const serverSession = await ronda.sessions.start(offline.vehicle_id ?? undefined, offline.start_time);
  const serverSessionId = Number(serverSession?.id);
  if (!Number.isFinite(serverSessionId)) {
    throw new Error('Failed to create server session during offline sync');
  }

  const remappedGps = await remapSessionId(offline.local_numeric_id, serverSessionId);
  const gpsFlush = await flushQueue();
  const photoFlush = await photoService.uploadQueuedPhotos();

  await markOfflineSessionSynced(serverSessionId);

  return {
    synced: true,
    serverSessionId,
    remappedGps,
    gpsFlush,
    photoFlush,
  };
}
