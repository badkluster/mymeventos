export const UPDATE_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000;
export const UPDATE_REQUEST_TIMEOUT_MS = 8 * 1000;
export const STORE_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;

export const UPDATE_COPY = {
  availableTitle: 'Actualización disponible',
  androidAvailableMessage:
    'Hay una nueva versión de M&M Eventos disponible con mejoras y correcciones.',
  androidRequiredTitle: 'Actualización requerida',
  androidRequiredMessage:
    'Hay una actualización importante de M&M Eventos. Actualizá la app para continuar con la versión más reciente.',
  iosAvailableTitle: 'Nueva versión disponible',
  iosAvailableMessage:
    'Actualizá M&M Eventos para obtener las últimas mejoras y correcciones.',
  readyMessage:
    'La actualización está lista. Reiniciá M&M Eventos para completar la instalación.',
  update: 'Actualizar',
  later: 'Más tarde',
  updateNow: 'Actualizar ahora',
  remindLater: 'Recordar más tarde',
  restartAndUpdate: 'Reiniciar y actualizar'
} as const;

export const UPDATE_STORAGE_KEYS = {
  lastCheckAt: 'mym.appUpdates.lastCheckAt.v1',
  lastOtaAppliedId: 'mym.appUpdates.lastOtaAppliedId.v1',
  lastOtaDownloadId: 'mym.appUpdates.lastOtaDownloadId.v1',
  lastOtaFailureAt: 'mym.appUpdates.lastOtaFailureAt.v1',
  dismissedStoreVersion: 'mym.appUpdates.dismissedStoreVersion.v1',
  dismissedStoreAt: 'mym.appUpdates.dismissedStoreAt.v1'
} as const;
