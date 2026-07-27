# App móvil de personal — M&M Eventos

> Estado: **implementado end-to-end** (backend real + app Expo real), verificado con Mongo local y curl/E2E manual. `apps/mobile` dejó de ser un scaffold vacío. Este documento describe qué existe, cómo se integra con el resto del sistema y qué queda deliberadamente fuera de esta primera versión.

## 1. Qué es y qué no es

Canal principal de acceso para personal operativo (`Role.STAFF`, y cualquier otro rol al que un admin le otorgue el permiso `mobile.access`): fichaje de entrada/salida con geolocalización, historial, incidencias, correcciones, perfil y seguridad. Turnos y Avisos se conservan implementados pero no se exponen en esta versión, a la espera de un acuerdo comercial. **No** es un panel administrativo — el backoffice web sigue siendo el único canal para gestión (`/admin/attendance`, `/admin/users`, `/admin/salons`).

No duplica ningún sistema existente:
- **No hay `EmployeeProfile` nuevo.** El "perfil laboral" es `User.staffProfile` + `User.attendanceConfig` (ya existían en el modelo `User`, ver `apps/api/src/modules/users/user.model.ts`), editables desde `/admin/users/[id]` (pestañas "Empleado"/"Asistencia", ya existentes antes de esta tarea).
- **No hay un segundo sistema de turnos.** Si se reactiva el alcance, los turnos se leerán de `EventStaffAssignment` (`apps/api/src/modules/crm/crm.models.ts`), el join Event↔Staff que ya existía.
- **No hay un segundo sistema de notificaciones.** Si se reactiva el alcance, la bandeja de avisos usará directamente `GET/PATCH /api/notifications` (el mismo módulo que usa el backoffice web), habilitado por el soporte Bearer agregado a `requireAuth`.
- **No hay un segundo sistema de subida de archivos.** El avatar se sube por el endpoint genérico `POST /api/uploads` (contexto `users`, ya abierto a cualquier usuario autenticado) y solo se persiste la URL vía `POST /api/mobile/me/avatar`.

## 2. Arquitectura

```
apps/mobile/
  App.tsx                     — entry point (providers + RootNavigator)
  app.json                    — config Expo (icono, splash, permisos, scheme "mymeventos")
  src/
    theme/tokens.ts           — sistema de diseño (colores, spacing, tipografía)
    components/               — AppButton, AppTextInput, PasswordInput, AppCard, StatusBadge,
                                 Avatar, ScreenHeader, EmptyState, ErrorState, LoadingState,
                                 ConfirmationSheet, LocationStatus, WorkStatusCard, HistoryItem,
                                 MetricCard, Toast (+provider), OfflineBanner
    lib/
      api.ts                  — cliente HTTP con Bearer token, mutex de refresh, sin exponer errores crudos
      secureStorage.ts         — tokens en expo-secure-store (Keychain/EncryptedSharedPreferences), nunca AsyncStorage
      offlineQueue.ts          — cola de marcaciones pendientes (AsyncStorage, sin datos sensibles)
      geo.ts                   — permisos y captura de ubicación (expo-location)
      biometrics.ts            — expo-local-authentication (sin enviar/guardar nada biométrico)
      device.ts                — installationId + info de dispositivo (expo-application/device)
      network.ts                — detección de conectividad puntual (expo-network)
      attendanceLabels.ts       — labels es-AR de los enums de asistencia
    state/
      authStore.ts             — zustand: sesión, login, biometría, logout(-all)
      attendanceStore.ts       — zustand: estado de jornada, check-in/out, cola offline
    navigation/                — Auth stack + 3 tabs activas (Home/Historial/Perfil); stacks de Turnos/Avisos preservados, sin entrada de runtime
    screens/                  — ver §3
```

Backend nuevo, sin tocar el auth/permite web existente (ver `docs/MOBILE_AUTHENTICATION.md`):
- `apps/api/src/modules/mobile/` — auth móvil, perfil propio, dispositivos.
- `apps/api/src/modules/attendance/` — modelos (`WorkSession`, `TimePunch`, `AttendanceIncident`, `AttendanceAdjustmentRequest`), servicio de negocio, rutas propias (`/api/mobile/attendance/*`, `/api/mobile/schedule`) y rutas admin (`/api/attendance/*`).

## 3. Pantallas activas y flujos diferidos

| Pantalla | Ruta de navegación | Conecta con |
|---|---|---|
| Splash | raíz (estado `booting`) | — |
| Login | `Auth > Login` | `POST /mobile/auth/login` |
| Activación biométrica | interstitial post-login | local (expo-local-authentication) |
| Desbloqueo biométrico | raíz (estado `locked`) | `GET /mobile/auth/session` |
| Recuperar/Restablecer contraseña | `Auth > ForgotPassword/ResetPassword` | `POST /mobile/auth/forgot-password` / `/reset-password` |
| Inicio (fichaje) | `HomeTab > Home` | `GET /mobile/attendance/status`, `POST /check-in`, `POST /check-out`, `GET /mobile/attendance/summary` |
| Historial | `HistoryTab > History` | `GET /mobile/attendance/history` (paginado) |
| Detalle de jornada | `HistoryTab > WorkSessionDetail` | `GET /mobile/attendance/sessions/:id` |
| Incidencias (lista + alta) | `HistoryTab > Incidents/NewIncident` | `GET/POST /mobile/attendance/incidents` |
| Correcciones (lista + alta) | `HistoryTab > Adjustments/NewAdjustment` | `GET/POST /mobile/attendance/adjustments` |
| Turnos (diferido) | Sin ruta activa; `ScheduleNavigator` preservado | `GET /mobile/schedule` (lee `EventStaffAssignment`) |
| Notificaciones (diferido) | Sin ruta activa; `NotificationsNavigator` preservado | `GET/PATCH /notifications` (módulo existente, reutilizado) |
| Perfil | `ProfileTab > Profile` | `GET /mobile/me`, avatar vía `/uploads` + `POST /mobile/me/avatar` |
| Editar perfil | `ProfileTab > EditProfile` | `PATCH /mobile/me` |
| Cambiar contraseña | `ProfileTab > ChangePassword` | `POST /mobile/auth/change-password` |
| Seguridad/biometría | `ProfileTab > BiometricSettings` | local + `expo-local-authentication` |
| Dispositivos/sesiones | `ProfileTab > ActiveSessions` | `GET /mobile/me/devices`, `DELETE /mobile/me/devices/:id` |

## 4. Fichaje: qué pasa realmente al tocar "Iniciar/Finalizar jornada"

1. Se abre un `ConfirmationSheet` que solicita permiso de ubicación en el momento (nunca antes, nunca en segundo plano) y muestra el estado (`LocationStatus`) de forma amigable (nunca coordenadas crudas como dato principal).
2. Al confirmar: se genera un `requestId` único (`expo-crypto` `randomUUID`), se captura ubicación (si hay permiso) e info de dispositivo, y se detecta conectividad (`expo-network`).
3. **Online:** se llama a `POST /mobile/attendance/check-in|check-out` directamente. La hora oficial la define el servidor (`serverReceivedAt`), no el reloj del teléfono.
4. **Offline (o error de red):** la marcación se guarda en `offlineQueue` (AsyncStorage) con `networkStatus: 'offline_sync'` y se muestra un `OfflineBanner` — **nunca se pinta como confirmada** hasta que el servidor la acepta.
5. Al recuperar conexión (siguiente `refresh()`, p. ej. al volver a la pantalla o hacer pull-to-refresh), `attendanceStore.syncPendingQueue()` drena la cola en orden FIFO contra los mismos endpoints, usando el mismo `requestId` (idempotencia real del backend — ver `docs/ATTENDANCE_ARCHITECTURE.md`).
6. Un rechazo definitivo del servidor (por ejemplo `ATTENDANCE_ALREADY_ACTIVE`) elimina el ítem de la cola (reintentar no serviría); un error de red mantiene el ítem en cola para el próximo intento.

## 5. Decisiones y simplificaciones explícitas de esta v1

- **Sin listener de conectividad en segundo plano.** Se chequea conectividad en los puntos de interacción explícitos (fichar, refrescar pantallas) con `expo-network`, no con un listener persistente tipo NetInfo. Documentado, no oculto.
- **Sin selector nativo de fecha/hora** en "Solicitar corrección": se usan campos de texto con formato guiado (`AAAA-MM-DD`, `HH:MM`) para no sumar una dependencia nativa adicional (`@react-native-community/datetimepicker`) en esta primera versión. Fácil de reemplazar después.
- **Notificaciones push:** no implementadas (no hay infraestructura de push tokens/Expo Notifications configurada). El endpoint `POST /api/mobile/devices/push-token` existe y persiste el token en `MobileDevice.pushToken`, pero **nada lo envía todavía** — ver `docs/MOBILE_BUILDS.md`. La bandeja in-app queda preservada, pero no está expuesta en la navegación actual.
- **Validación de entradas por QR:** explícitamente fuera de esta app (permiso y módulo aparte, ver `docs/MOBILE_AUTHENTICATION.md`), tal como pide la tarea.
- **Turnos y Avisos:** sus pantallas y llamadas API quedan preservadas sin exponer hasta que se acuerde favorablemente el alcance con el cliente. Si se reactiva Turnos, su estado vacío usa `EventStaffAssignment` real, sin datos inventados.
- **Íconos:** la UI usa emoji/Unicode en vez de una librería de iconos (`lucide-react-native` + `react-native-svg`) para no sumar dependencias nativas extra en esta primera versión.

## 6. Cómo correrla en desarrollo

```bash
pnpm install
pnpm --filter @mym/api dev            # backend en :3001
pnpm --filter @mym/api seed            # datos base (salones, paquetes, admin)
pnpm --filter @mym/api seed:mobile-attendance   # usuarios y jornadas demo (ver docs/MOBILE_QA.md)
cp apps/mobile/.env.example apps/mobile/.env    # ajustar EXPO_PUBLIC_API_URL a tu IP de LAN si usás un dispositivo físico
pnpm --filter @mym/mobile start
```

Credenciales demo (ver `apps/api/src/scripts/seedMobileAttendance.ts`): `mesero.demo` / `MymDemo123!` (acceso móvil habilitado, con jornada activa y jornada completada con incidencia y corrección pendientes).
