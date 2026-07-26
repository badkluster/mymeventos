import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { api, ApiClientError } from '../lib/api';
import { captureLocation, type LocationPermissionStatus } from '../lib/geo';
import { getDeviceInfo } from '../lib/device';
import { isOnline } from '../lib/network';
import { enqueuePunch, getQueue, removeFromQueue, type QueuedPunch } from '../lib/offlineQueue';
import type { AttendanceStatusResponse, WorkSession } from '../types/attendance';

interface ClockResult { session: WorkSession; }

interface AttendanceState {
  activeSession: WorkSession | null;
  todayAssignment: AttendanceStatusResponse['todayAssignment'];
  elapsedMinutes: number;
  pendingQueue: QueuedPunch[];
  loading: boolean;
  acting: boolean;
  lastLocationPermission: LocationPermissionStatus | null;
  error: string | null;
  refresh: () => Promise<void>;
  checkIn: (input: { salonId?: string; eventId?: string; notes?: string }) => Promise<{ requiresReview?: boolean; queued?: boolean }>;
  checkOut: (input?: { notes?: string }) => Promise<{ requiresReview?: boolean; queued?: boolean }>;
  syncPendingQueue: () => Promise<void>;
  clearError: () => void;
}

async function loadPendingQueue(): Promise<QueuedPunch[]> {
  return getQueue();
}

async function submitClockAction(kind: 'check-in' | 'check-out', requestId: string, notes: string | undefined, salonId: string | undefined, eventId: string | undefined) {
  const device = await getDeviceInfo();
  const { location, permissionStatus } = await captureLocation();
  const online = await isOnline();
  const clientOccurredAt = new Date().toISOString();
  const payload: Record<string, unknown> = {
    requestId,
    clientOccurredAt,
    networkStatus: online ? 'online' : 'offline_sync',
    device,
    notes,
    ...(location ? { location, locationPermissionStatus: permissionStatus } : { locationPermissionStatus: permissionStatus }),
    ...(kind === 'check-in' ? { salonId, eventId } : {})
  };
  return { payload, online, permissionStatus };
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  activeSession: null,
  todayAssignment: null,
  elapsedMinutes: 0,
  pendingQueue: [],
  loading: false,
  acting: false,
  lastLocationPermission: null,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      await get().syncPendingQueue();
      const response = await api.get<AttendanceStatusResponse>('/mobile/attendance/status');
      set({ activeSession: response.activeSession, todayAssignment: response.todayAssignment, elapsedMinutes: response.elapsedMinutes, loading: false });
    } catch (error) {
      const pendingQueue = await loadPendingQueue();
      set({ loading: false, pendingQueue, error: error instanceof ApiClientError ? error.message : 'No se pudo actualizar tu estado. Mostramos la última información disponible.' });
    }
  },

  checkIn: async ({ salonId, eventId, notes }) => {
    set({ acting: true, error: null });
    const requestId = Crypto.randomUUID();
    try {
      const { payload, online } = await submitClockAction('check-in', requestId, notes, salonId, eventId);
      if (!online) {
        await enqueuePunch({ requestId, kind: 'check-in', payload });
        set({ acting: false, pendingQueue: await loadPendingQueue() });
        return { queued: true };
      }
      const result = await api.post<ClockResult>('/mobile/attendance/check-in', payload);
      set({ activeSession: result.session, acting: false, elapsedMinutes: 0 });
      return { requiresReview: result.session.requiresReview };
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'NETWORK_ERROR') {
        const { payload } = await submitClockAction('check-in', requestId, notes, salonId, eventId);
        await enqueuePunch({ requestId, kind: 'check-in', payload: { ...payload, networkStatus: 'offline_sync' } });
        set({ acting: false, pendingQueue: await loadPendingQueue() });
        return { queued: true };
      }
      set({ acting: false, error: error instanceof ApiClientError ? error.message : 'No se pudo registrar la entrada.' });
      throw error;
    }
  },

  checkOut: async (input) => {
    set({ acting: true, error: null });
    const requestId = Crypto.randomUUID();
    try {
      const { payload, online } = await submitClockAction('check-out', requestId, input?.notes, undefined, undefined);
      if (!online) {
        await enqueuePunch({ requestId, kind: 'check-out', payload });
        set({ acting: false, pendingQueue: await loadPendingQueue() });
        return { queued: true };
      }
      const result = await api.post<ClockResult>('/mobile/attendance/check-out', payload);
      set({ activeSession: result.session, acting: false });
      return { requiresReview: result.session.requiresReview };
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'NETWORK_ERROR') {
        const { payload } = await submitClockAction('check-out', requestId, input?.notes, undefined, undefined);
        await enqueuePunch({ requestId, kind: 'check-out', payload: { ...payload, networkStatus: 'offline_sync' } });
        set({ acting: false, pendingQueue: await loadPendingQueue() });
        return { queued: true };
      }
      set({ acting: false, error: error instanceof ApiClientError ? error.message : 'No se pudo registrar la salida.' });
      throw error;
    }
  },

  syncPendingQueue: async () => {
    const online = await isOnline();
    if (!online) {
      set({ pendingQueue: await loadPendingQueue() });
      return;
    }
    let queue = await loadPendingQueue();
    for (const item of queue) {
      try {
        const path = item.kind === 'check-in' ? '/mobile/attendance/check-in' : '/mobile/attendance/check-out';
        const result = await api.post<ClockResult>(path, item.payload);
        await removeFromQueue(item.requestId);
        set({ activeSession: result.session });
      } catch (error) {
        // A definitive rejection (not a network error) means retrying is pointless — drop it,
        // but a plain network error means we're still offline: stop draining and try again later.
        if (error instanceof ApiClientError && error.code !== 'NETWORK_ERROR') {
          await removeFromQueue(item.requestId);
        } else {
          break;
        }
      }
    }
    queue = await loadPendingQueue();
    set({ pendingQueue: queue });
  },

  clearError: () => set({ error: null })
}));
