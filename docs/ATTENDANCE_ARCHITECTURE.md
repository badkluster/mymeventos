# Arquitectura de asistencia (fichaje móvil)

## 1. Decisión de modelado: por qué no hay `EmployeeProfile`

La tarea original sugería un modelo `EmployeeProfile` separado. Se descartó deliberadamente: el modelo `User` (`apps/api/src/modules/users/user.model.ts`) ya tiene `staffProfile` (código de legajo, subroles, estado laboral) y `attendanceConfig` (habilitación de fichaje, geolocalización requerida, geocercas por usuario, salón por defecto) — ambos ya usados por `/admin/staff` y `/admin/users/[id]`. Crear un segundo modelo hubiera duplicado un sistema existente (prohibido explícitamente en `CLAUDE.md`). Este documento reemplaza esa sugerencia por la arquitectura real.

`packages/shared/src/constants/statuses.ts` ya declaraba un enum `AttendanceStatus` (`PRESENT/ABSENT/LATE/EXCUSED`) que nunca se usó en el código. Se dejó intacto (no se borra código sin confirmar) pero queda **superado** por `AttendanceClassification` (`packages/shared/src/constants/attendance.ts`), que es el que realmente calcula el backend.

## 2. Modelos (`apps/api/src/modules/attendance/attendance.models.ts`)

### `TimePunch` — inmutable
Nunca se expone un `PATCH`/`PUT` para este modelo. Toda corrección pasa por `AttendanceAdjustmentRequest` (auditado). Campos clave: `type` (`check_in`/`check_out`; `break_start`/`break_end` ya están en el enum compartido pero no se usan en la UX principal, tal como pedía la tarea), `clientOccurredAt` vs `serverReceivedAt` vs `effectiveAt` (ver §4), `location`, `locationValidationStatus`, `salonDistanceMeters`, `requestId` (único), `rejected`/`rejectionReason` (para dejar rastro de intentos rechazados sin borrar nada).

### `WorkSession` — derivado, corregible solo vía flujo auditado
Único índice parcial `{userId:1}` con `partialFilterExpression: {status:'active'}` → a nivel de base de datos es imposible tener dos jornadas activas para el mismo usuario, sin necesitar una transacción multi-documento (Mongo standalone no siempre tiene replica set disponible; ver §6). `assignmentId` referencia opcionalmente un `EventStaffAssignment` (el "turno"); `eventId`/`salonId` se copian para consultas rápidas, igual que otros documentos del dominio (`Payment`, etc.) ya hacen.

### `AttendanceIncident` / `AttendanceAdjustmentRequest`
Adjuntos se guardan como referencias directas a Cloudinary (`{url, secureUrl, publicId, resourceType, format, bytes}`), igual que `Salon.mediaGallery` — no existe un modelo `Upload`/`File` genérico en este código base, así que no se inventa uno nuevo.

## 3. Geocercas

`Salon.attendanceLocationRule` (nuevo sub-documento en `apps/api/src/modules/salons/salon.model.ts`): `{ latitude, longitude, allowedRadiusMeters, requireLocation, outsideAreaPolicy }`. `outsideAreaPolicy` reemplaza el booleano `allowOutsideWithIncident` sugerido por la tarea con un enum más expresivo, ya que cubre exactamente las 4 combinaciones que pedía la sección 10 del prompt original:

| `outsideAreaPolicy` | Comportamiento |
|---|---|
| `allow` | Se acepta como válida, sin marcar. |
| `flag` (default) | Se acepta pero la jornada queda `requiresReview: true`. |
| `block` | Se rechaza (`403 ATTENDANCE_OUTSIDE_GEOFENCE`). |
| `require_reason` | Solo se acepta si la marcación trae `notes` (motivo). |

`User.attendanceConfig.allowedGeoLocations` (el campo per-usuario que ya existía, dormant) se deja intacto pero **no se usa** en el flujo real — la fuente de verdad pasa a ser la geocerca por salón. Documentado como decisión, no como bug.

Editable desde el backoffice: `GET/PATCH /api/salons/:id/attendance-location-rule` (pestaña "Asistencia" en `/admin/salons/[id]`).

## 4. Reloj: cliente vs. servidor

`resolvePunchTiming()` (`attendance.service.ts`):
- **Siempre:** `effectiveAt = serverReceivedAt`. La fecha y hora oficial nunca dependen del reloj del teléfono. `clientOccurredAt` se conserva sólo como evidencia técnica junto con `clockSkewMs`; una diferencia de más de 5 minutos deja la jornada marcada para revisión.
- **Sin conexión:** no se aceptan marcaciones diferidas (`offline_sync`). Para iniciar o finalizar una jornada se requiere conexión con el servidor; así no se puede retrofechar ni diferir una ficha para alterar las horas trabajadas.

## 5. Máquina de estados de `WorkSession`

```
        check-in
(none) ────────────► active ───check-out (sin problemas)──► completed
                        │                                       
                        ├──check-out (requiresReview)─────► under_review
                        │
                        ├──cierre administrativo──────────► incomplete
                        │
                        └──corrección aprobada────────────► adjusted
```
`cancelled` está en el enum compartido para uso futuro (p. ej. anular una jornada creada por error) pero **ningún endpoint la asigna todavía** — documentado, no fingido como implementado.

`AttendanceClassification` (`on_time`/`late`/`absent`/`incomplete`/`justified`/`not_scheduled`/`under_review`) se calcula en `classifySession()`: si la jornada no tiene `assignmentId` (sin turno asignado) → `not_scheduled`; si el turno tiene `shiftStart` y el check-in llegó después de la tolerancia (`lateToleranceMinutes`, configurable) → `late`; si no → `on_time`. Deliberadamente simple — la tarea pide explícitamente **no** inventar reglas de presentismo/liquidación (sección 24/25 del prompt original); esto deja los datos listos para que un motor de liquidación futuro los consuma (`workedMinutes`, `payableMinutes`, `attendanceClassification`, `hasIncident`, ajustes aprobados), sin calcular nada económico.

## 6. Idempotencia y concurrencia — sin transacciones Mongo

Se decidió **no** usar transacciones multi-documento porque no se puede asumir que el Mongo del entorno (local o el Atlas que use el equipo) corra como replica set. En su lugar:

1. **`TimePunch.requestId` único.** Un reintento (doble tap o timeout+retry) con el mismo `requestId` nunca crea un segundo documento — se detecta el existente y, si ya está vinculado a una `WorkSession`, se devuelve el mismo resultado (respuesta idempotente, no error).
2. **`WorkSession` con índice único parcial sobre jornada activa.** El check-in intenta crear el `TimePunch` primero (protegido por su propio índice único) y luego el `WorkSession`; si el índice parcial rechaza la creación (ya hay una activa), se marca el punch como `rejected: true` (queda como evidencia de auditoría, no se borra) y se responde `409 ATTENDANCE_ALREADY_ACTIVE`.
3. El check-out usa `findOneAndUpdate({_id, status:'active'}, ...)` — si dos check-out concurrentes llegan, solo uno encuentra el documento en estado `active` y lo cierra; el otro recibe `409 ATTENDANCE_NO_ACTIVE_SESSION` de forma segura.

Verificado en vivo (no solo con mocks): doble check-in consecutivo → primer `201`, segundo `409 ATTENDANCE_ALREADY_ACTIVE`; geocerca con política `block` → `403 ATTENDANCE_OUTSIDE_GEOFENCE` antes de crear ningún registro; dentro del radio → `201` con `locationValidationStatus: 'inside_allowed_area'`.

## 7. Configuración global

`apps/api/src/modules/attendance/attendance-settings.service.ts` guarda la configuración (zona horaria, tolerancias, radio de geocerca por defecto, etc.) como una fila más de `SystemSetting` (`key: 'attendance.config'`) — se reutiliza el módulo de configuración clave/valor ya existente (`apps/api/src/modules/settings/`) en vez de crear una colección nueva. Editable en `/admin/attendance` → pestaña "Configuración" (requiere `Permission.ATTENDANCE_SETTINGS_MANAGE`).

## 8. Integración futura con liquidaciones (contrato, no implementación)

Cada `WorkSession` completada/ajustada expone: `workedMinutes`, `payableMinutes` (hoy igual a `workedMinutes` menos `breakMinutes`, sin descuentos), `attendanceClassification`, `hasIncident`, `requiresReview`, y — si fue corregida — el `AttendanceAdjustmentRequest` aprobado con `originalSnapshot` (los valores previos a la corrección, para auditoría). Un futuro módulo de liquidaciones puede leer estas jornadas filtrando por `status IN (completed, adjusted)` y `requiresReview: false`. No se implementa ningún cálculo salarial — coherente con la instrucción explícita de no improvisar reglas económicas.
