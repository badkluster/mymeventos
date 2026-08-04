import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { api, ApiClientError } from '../lib/api';
import { captureLocation, type LocationPermissionStatus } from '../lib/geo';
import { getDeviceInfo } from '../lib/device';
import { isOnline } from '../lib/network';
import { getQueue, removeFromQueue, type QueuedPunch } from '../lib/offlineQueue';
import { hideActiveSessionNotification, showActiveSessionNotification } from '../lib/activeSessionNotification';
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
  const deviceInfo = await getDeviceInfo();
  const { network, ...device } = deviceInfo;
  const { location, permissionStatus } = await captureLocation();
  const online = await isOnline();
  const clientOccurredAt = new Date().toISOString();
  const payload: Record<string, unknown> = {
    requestId,
    clientOccurredAt,
    networkStatus: online ? 'online' : 'offline_sync',
    device,
    network,
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
      void (response.activeSession ? showActiveSessionNotification(response.activeSession) : hideActiveSessionNotification());
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
        set({ acting: false });
        throw new ApiClientError('ATTENDANCE_ONLINE_REQUIRED', 'Necesitás conexión a internet para iniciar la jornada. La fecha y hora se toman del servidor.');
      }
      const result = await api.post<ClockResult>('/mobile/attendance/check-in', payload);
      set({ activeSession: result.session, acting: false, elapsedMinutes: 0 });
      void showActiveSessionNotification(result.session);
      return { requiresReview: result.session.requiresReview };
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'NETWORK_ERROR') {
        set({ acting: false });
        throw new ApiClientError('ATTENDANCE_ONLINE_REQUIRED', 'Se perdió la conexión. Volvé a intentar para que el servidor registre la hora oficial.');
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
        set({ acting: false });
        throw new ApiClientError('ATTENDANCE_ONLINE_REQUIRED', 'Necesitás conexión a internet para finalizar la jornada. La fecha y hora se toman del servidor.');
      }
      const result = await api.post<ClockResult>('/mobile/attendance/check-out', payload);
      // The server returns the completed (or under-review) session for audit
      // purposes. It is no longer an active shift, so keeping it in this field
      // would leave the home timer running after a successful check-out.
      set({ activeSession: null, acting: false, elapsedMinutes: 0 });
      void hideActiveSessionNotification();
      return { requiresReview: result.session.requiresReview };
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'NETWORK_ERROR') {
        set({ acting: false });
        throw new ApiClientError('ATTENDANCE_ONLINE_REQUIRED', 'Se perdió la conexión. Volvé a intentar para que el servidor registre la hora oficial.');
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
        set(item.kind === 'check-out'
          ? { activeSession: null, elapsedMinutes: 0 }
          : { activeSession: result.session, elapsedMinutes: 0 });
        void (item.kind === 'check-out' ? hideActiveSessionNotification() : showActiveSessionNotification(result.session));
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
