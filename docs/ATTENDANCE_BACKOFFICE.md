# Backoffice: gestión de asistencia y personal móvil

## 1. Cómo habilitar la app a un empleado

1. `/admin/users/[id]` → pestaña **"Asistencia"**: activar "Habilitado" y **"App móvil"** (`attendanceConfig.enabled` / `canUseMobileApp`). Este segundo toggle es el que efectivamente decide si el login móvil funciona (ver `docs/MOBILE_AUTHENTICATION.md` §2) — antes de esta tarea existía en la UI pero no tenía ningún consumidor.
2. `/admin/users/[id]` → pestaña **"Roles y permisos"**: si el usuario no es `STAFF` (que ya trae `mobile.access` y los permisos de autogestión por defecto), se le puede otorgar el área **"App móvil de personal"** manualmente — esto es exactamente lo que permite que un `MANAGER`/`SALON_MANAGER` puntual use la app sin depender solo del rol `STAFF`.
3. `/admin/salons/[id]` → pestaña **"Asistencia"**: configurar la geocerca del salón (latitud/longitud/radio/política fuera de zona) si se quiere validar ubicación. Si no se configura, el fichaje en ese salón simplemente no valida ubicación (`locationValidationStatus: 'not_configured'`).

## 2. Nueva sección `/admin/attendance`

Módulo nuevo en el menú (submenú "Configuración", junto a Staff — ver §4), gateado por `Permission.ATTENDANCE_READ`.

| Pestaña | Qué muestra | Acciones | Permiso de acción |
|---|---|---|---|
| **Activos** | Jornadas en curso ahora mismo (empleado, salón, tiempo transcurrido, si está marcada para revisión) | Ver detalle; **cerrar administrativamente** (motivo obligatorio, auditado) | `Permission.ATTENDANCE_MANAGE` |
| **Historial** | Todas las jornadas, filtrables por estado/salón/rango de fechas/"solo para revisión" | Ver detalle; resolver una jornada marcada para revisión como completada, incompleta o cancelada, con nota opcional | `Permission.ATTENDANCE_READ` / `Permission.ATTENDANCE_MANAGE` para revisar |
| **Incidencias** | Reportadas por el personal, filtrables por estado | Marcar resuelta/en revisión/rechazada + notas | `Permission.ATTENDANCE_MANAGE` |
| **Correcciones** | Solicitudes de ajuste de horario, filtrables por estado | Aprobar (ajusta la jornada y la marca `adjusted`, conservando el registro original) o rechazar, con notas | `Permission.ATTENDANCE_MANAGE` |
| **Configuración** | Zona horaria, tolerancias de llegada/salida, radio de geocerca por defecto, antigüedad máxima de marcaciones offline, jornada máxima, si se permiten incidencias | Editar | `Permission.ATTENDANCE_SETTINGS_MANAGE` (pestaña oculta sin este permiso) |

Todas las acciones administrativas quedan en `AuditLog` (`ATTENDANCE_SESSION_ADMIN_CLOSE`, `ATTENDANCE_SESSION_REVIEW`, `ATTENDANCE_INCIDENT_RESOLVE`, `ATTENDANCE_ADJUSTMENT_REVIEW`, `ATTENDANCE_SETTINGS_UPDATE`) con el actor, la fecha y el motivo cuando corresponde — no hay ninguna modificación silenciosa.

## 3. Gestión de dispositivos de un usuario

`/admin/users/[id]` no tiene todavía una pestaña visual de dispositivos (se priorizó el resto del alcance), pero la API ya existe y está probada: `GET/DELETE /api/users/:id/devices[/:deviceId]` (permiso `Permission.MOBILE_DEVICES_MANAGE`, incluido en el preset de `MANAGER`). Revocar un dispositivo revoca también sus refresh tokens activos. Agregar la pestaña visual es una mejora de UI menor pendiente (la funcionalidad de backend está completa y verificada).

## 4. Navegación: se corrigió la brecha de Staff

Antes de esta tarea, `/admin/staff` tenía módulo definido pero **cero entrada de navegación** (`docs/MYM_EVENTOS_PROJECT_CONTEXT.md` §8/§12 lo documentaba como brecha conocida). Como esta tarea depende directamente de que el personal esté bien gestionado desde el backoffice, se corrigió: `apps/web/src/components/admin-shell.tsx` ahora muestra **Staff** y **Asistencia** dentro del submenú "Configuración". No se tocó ninguna otra parte de la navegación.

## 5. Qué NO se construyó en el backoffice (documentado, no fingido)

- **Exportación de registros** (sección 22 del prompt original: "Exportar registros"). No se implementó un endpoint de exportación CSV/Excel de jornadas — la lista paginada (`GET /api/attendance/sessions`) cubre la consulta, pero no hay botón de exportar. Recomendado como siguiente paso si se necesita para liquidaciones.
- **Vista previa de liquidaciones** ("preparar información para liquidaciones"): los datos están disponibles (`workedMinutes`, `payableMinutes`, `attendanceClassification`) pero no hay una pantalla que los agregue por período/empleado — ver `docs/ATTENDANCE_ARCHITECTURE.md` §8 para el contrato de integración.
