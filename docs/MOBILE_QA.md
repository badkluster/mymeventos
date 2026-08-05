# QA — app móvil de personal y asistencia

## 1. Backend (`apps/api`, Vitest)

Todos corridos contra el suite completo del repo (no solo los archivos nuevos) — **39 archivos, 202 tests, todos en verde** al cierre de esta tarea (incluye tests de otros módulos que se desarrollaron en paralelo por otra sesión durante esta misma tarea).

Archivos nuevos de esta tarea:

| Archivo | Cubre |
|---|---|
| `apps/api/tests/attendance-models.test.ts` | Validación de esquema de `TimePunch`/`WorkSession`/`AttendanceIncident`/`AttendanceAdjustmentRequest` (campos requeridos, defaults, enums inválidos) |
| `apps/api/tests/attendance-service.test.ts` | Check-in feliz; **idempotencia** (mismo `requestId` → mismo resultado, sin duplicar); **jornada duplicada** (segundo check-in → `409 ATTENDANCE_ALREADY_ACTIVE`, y el punch huérfano queda marcado `rejected`, no se pierde); geocerca `block` (rechaza antes de crear nada) y `flag` (acepta y marca `requiresReview`); check-out sin jornada activa (`409`); cálculo de `workedMinutes` en el servidor; hora de cliente anterior al check-in nunca produce duración negativa (se ajusta y se marca para revisión) |
| `apps/api/tests/mobile-auth-routes.test.ts` | Login denegado por rol sin `mobile.access`; login exitoso con emisión de tokens Bearer + alta de dispositivo; contraseña incorrecta; cuenta inactiva; **regresión del bug real encontrado en QA manual** (`canUseMobileApp: false` debe bloquear el login aunque el rol tenga el permiso) |
| `packages/shared/tests/mobileAttendancePermissions.test.ts` | Presets de permisos: `STAFF` trae todo lo de autogestión móvil pero nada de administración; `MANAGER`/`SALON_MANAGER` traen `ATTENDANCE_READ/MANAGE`; `mobile.access` es otorgable a cualquier rol vía override (no depende solo de `STAFF`); un `permissionDeniedOverride` bloquea incluso a `STAFF` |

## 2. Mobile (`apps/mobile`, Jest)

`apps/mobile/src/lib/__tests__/` — **2 archivos, 9 tests, verde**. Desde la migración a Expo SDK 57 (2026-07-26) se usa el preset `jest-expo/node`: el problema original que motivó evitarlo en SDK 50 (`jest-expo` + el layout de `.pnpm` de pnpm rompiendo la transformación de sintaxis Flow de `react-native`) se verificó resuelto en `jest-expo@57.0.2` (su `transformIgnorePatterns` generado ya incluye `.pnpm` explícitamente) — ver `docs/MOBILE_BUILDS.md` §4.1. Los tests actuales siguen ejercitando solo módulos TypeScript puros, no renders de componentes:

- `offlineQueue.test.ts`: encolar, leer, orden FIFO, eliminar por `requestId`, eliminar un id inexistente es no-op.
- `api.test.ts`: adjunta el Bearer token correcto; ante un `401 UNAUTHENTICATED` refresca una vez y reintenta la request original; **mutex de refresh** (dos requests concurrentes que fallan al mismo tiempo comparten un único refresh, no dos); si el refresh también falla, limpia tokens y dispara el handler de "sesión expirada".

**No cubierto con tests automatizados en esta tarea** (verificado solo manualmente, ver §3): biometría (requiere hardware real), permisos de ubicación (requiere runtime nativo), render de pantallas (requeriría `@testing-library/react-native` + mocks nativos completos — quedó fuera por tiempo). Se deja como recomendación priorizada en §5.

## 3. E2E manual — ejecutado de verdad contra Mongo local (no solo mocks)

Se levantó la API contra una base MongoDB local descartable (nunca contra la base compartida del equipo — ver nota de seguridad abajo) y se ejecutó el flujo completo por `curl`:

1. `POST /api/mobile/auth/login` con un usuario `STAFF` recién creado con `attendanceConfig.enabled/canUseMobileApp = true` → tokens emitidos, dispositivo registrado.
2. `GET /api/mobile/attendance/status` → `activeSession: null`.
3. `POST /api/mobile/attendance/check-in` (con ubicación) → `201`, jornada activa creada.
4. Repetir el check-in (nuevo `requestId`) → `409 ATTENDANCE_ALREADY_ACTIVE`.
5. `POST /api/mobile/attendance/check-out` → `200`, `workedMinutes` calculado por el servidor.
6. `GET /api/mobile/attendance/history` → la jornada aparece completada.
7. Geocerca: configurada la del salón (`PATCH /api/salons/:id/attendance-location-rule`, política `block`); check-in con coordenadas lejanas → `403 ATTENDANCE_OUTSIDE_GEOFENCE`; check-in con coordenadas dentro del radio → `201`, `locationValidationStatus: inside_allowed_area`.
8. `POST /api/mobile/attendance/incidents` → incidencia creada.
9. Login del backoffice como admin → `GET /api/attendance/sessions/active`, `GET /api/attendance/sessions`, `GET/PATCH /api/attendance/settings`, `POST /api/attendance/sessions/:id/close` (cierre administrativo) — todos funcionando contra los mismos datos.
10. `GET/POST /api/users/:id/devices` — listado y revocación de dispositivo.

### Bug real encontrado y corregido durante este QA manual

El primer intento de login con un `STAFF` cuyo `attendanceConfig.canUseMobileApp` era `false` **se aceptó** (debía rechazarse). Causa: el gate de login solo chequeaba el permiso `mobile.access` (que `STAFF` trae por defecto vía rol), sin chequear el toggle per-usuario. Corregido en `isMobileEligible()` (`apps/api/src/modules/mobile/mobile-auth.routes.ts`) para exigir **ambas** condiciones — ver `docs/MOBILE_AUTHENTICATION.md` §2. Se agregó un test de regresión (`mobile-auth-routes.test.ts`) para que no vuelva a pasar desapercibido.

### Nota de seguridad sobre el entorno de este QA

No usar seeds, fixtures ni una base persistente/remota para QA. Las pruebas deben usar mocks o recursos aislados sin datos de usuarios, conforme a [`AGENTS.md`](../AGENTS.md).

## 4. No verificado en esta tarea (limitaciones reales)

- **Dispositivo físico / Expo Go real.** Todo el frontend móvil se verificó por typecheck + tests unitarios + lectura de código; no se instaló en un teléfono real ni se probó en un simulador (el entorno de esta tarea no tiene acceso a uno). Biometría, cámara/selector de fotos y GPS real **no se probaron en hardware**.
- **Frontend web (`/admin/attendance`, pestañas nuevas de `/admin/salons` y `/admin/users`).** Se verificó con `tsc --noEmit` y, indirectamente, verificando en vivo *todos* los endpoints que esas pantallas consumen (§3, puntos 7 y 9). No se hizo clic-a-clic en un navegador real porque ya había un servidor de desarrollo del usuario corriendo y no se quiso interferir con él.
- **Notificaciones push, EAS build, tienda.** Explícitamente fuera de alcance — ver `docs/MOBILE_BUILDS.md`.

## 5. Recomendaciones antes de producción

1. Reemplazar el rate limit local en memoria de `/api/mobile/auth/login` por un almacén compartido (Redis u otro) si la API se despliega en más de una instancia. El límite actual es de 10 intentos por IP cada 15 minutos.
2. Agregar tests de render con `@testing-library/react-native` para las pantallas críticas (Login, Home/fichaje).
3. Definir `bundleIdentifier`/`package` definitivos y correr `eas build:configure` con la cuenta real de la organización.
4. Decidir si se conecta push real (Expo Notifications) antes o después del primer rollout; entonces habrá que implementar el registro seguro de tokens y el servicio de envío.
5. Probar en al menos un dispositivo Android y uno iOS reales antes de distribuir (geolocalización, biometría y selector de fotos dependen de hardware/SO real).

## 6. Migración a Expo SDK 57 (2026-07-26) — verificación automática hecha, QA manual pendiente

Motivo y detalle completo de la migración en `docs/MOBILE_BUILDS.md` §4.1 (resumen: Expo Go de SDK ~50 no arrancaba en el emulador local, que solo tiene imagen Android 16/API 36 disponible).

**Verificado automáticamente** (por esta sesión): `npx expo-doctor@latest` (20/20 checks en verde), `pnpm --filter @mym/mobile typecheck` (limpio), `pnpm --filter @mym/mobile test` (9/9 tests verdes con el nuevo preset `jest-expo/node`), `pnpm --filter @mym/shared build/typecheck`, `pnpm --filter @mym/api typecheck` y `pnpm --filter @mym/web typecheck` (sin regresiones en el resto del monorepo). Se corrió `expo start` en Windows sin el patch de `@expo/cli` que antes hacía falta, sin que reaparezca el bug que motivó ese patch.

**Pendiente — solo lo puede hacer quien tenga el emulador/dispositivo a mano** (misma limitación que §4: no hay acceso a hardware/emulador desde este entorno de trabajo). Checklist a correr contra `Medium_Phone_2` (o un dispositivo físico) vía Expo Go:

1. `pnpm --filter @mym/mobile start` → abrir en el emulador. **Criterio principal**: la app arranca, sin el crash `DETECT_SCREEN_CAPTURE` que tenía en SDK 50.
2. Login con credenciales de staff.
3. Bloqueo/desbloqueo biométrico.
4. Fichaje de entrada geolocalizado dentro de la geocerca de un salón configurado.
5. Fichaje de salida; confirmar que se ve en el historial.
6. Cola offline: modo avión → fichar → desactivar modo avión → confirmar que drena.
7. Cambiar avatar (permiso de fotos + selección) — valida el cambio de `MediaTypeOptions` → `mediaTypes: ['images']`.
8. Recorrer historial/incidencias/correcciones/perfil — atención a los insets de safe-area por el edge-to-edge obligatorio en Android desde SDK 53+. Turnos y Avisos no se prueban en esta etapa: están conservados pero fuera de navegación hasta que se apruebe ese alcance.

Actualizar esta sección con el resultado una vez ejecutado.
