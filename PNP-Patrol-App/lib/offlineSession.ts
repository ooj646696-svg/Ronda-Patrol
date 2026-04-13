import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_SESSION_KEY = '@ronda_offline_session';

type OfflineSessionStatus = 'PENDING' | 'SYNCED';

export type OfflineSession = {
  local_id: string;
  local_numeric_id: number;
  vehicle_id?: number | null;
  start_time: string;
  end_time?: string | null;
  status: OfflineSessionStatus;
  server_session_id?: number | null;
};

function generateLocalId() {
  return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function generateLocalNumericId() {
  return -1 * Date.now();
}

export async function startOfflineSession(vehicleId?: number | null, startTimeIso?: string) {
  const offlineSession: OfflineSession = {
    local_id: generateLocalId(),
    local_numeric_id: generateLocalNumericId(),
    vehicle_id: vehicleId ?? null,
    start_time: startTimeIso || new Date().toISOString(),
    end_time: null,
    status: 'PENDING',
    server_session_id: null,
  };
  await AsyncStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(offlineSession));
  return offlineSession;
}

export async function getOfflineSession(): Promise<OfflineSession | null> {
  const raw = await AsyncStorage.getItem(OFFLINE_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OfflineSession;
  } catch {
    return null;
  }
}

export async function setOfflineSession(session: OfflineSession | null) {
  if (!session) {
    await AsyncStorage.removeItem(OFFLINE_SESSION_KEY);
    return;
  }
  await AsyncStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(session));
}

export async function stopOfflineSession(endTimeIso?: string) {
  const s = await getOfflineSession();
  if (!s) return null;
  const updated: OfflineSession = { ...s, end_time: endTimeIso || new Date().toISOString() };
  await setOfflineSession(updated);
  return updated;
}

export async function markOfflineSessionSynced(serverSessionId: number) {
  const s = await getOfflineSession();
  if (!s) return null;
  const updated: OfflineSession = {
    ...s,
    status: 'SYNCED',
    server_session_id: serverSessionId,
  };
  await setOfflineSession(updated);
  return updated;
}

export async function hasPendingOfflineSession(): Promise<boolean> {
  const s = await getOfflineSession();
  return Boolean(s && s.status === 'PENDING');
}
