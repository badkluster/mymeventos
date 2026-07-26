import AsyncStorage from '@react-native-async-storage/async-storage';

// Punches captured while offline are queued here (plain AsyncStorage — nothing sensitive:
// no credentials, just clock-event payloads) and drained the next time the app confirms
// connectivity. A queued punch is NEVER treated as a confirmed clock-in/out in the UI
// until the server actually accepts it — see docs/ATTENDANCE_ARCHITECTURE.md §Offline.
const QUEUE_KEY = 'mym.offlinePunchQueue';

export interface QueuedPunch {
  requestId: string;
  kind: 'check-in' | 'check-out';
  payload: Record<string, unknown>;
  queuedAt: string;
}

export async function getQueue(): Promise<QueuedPunch[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedPunch[];
  } catch {
    return [];
  }
}

async function setQueue(queue: QueuedPunch[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueuePunch(entry: Omit<QueuedPunch, 'queuedAt'>): Promise<void> {
  const queue = await getQueue();
  queue.push({ ...entry, queuedAt: new Date().toISOString() });
  await setQueue(queue);
}

export async function removeFromQueue(requestId: string): Promise<void> {
  const queue = await getQueue();
  await setQueue(queue.filter((item) => item.requestId !== requestId));
}
