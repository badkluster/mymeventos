# M&M Eventos — Contexto persistente del proyecto

> Este documento es la fuente de referencia detallada y permanente del proyecto. Es importado desde `CLAUDE.md` (`@docs/MYM_EVENTOS_PROJECT_CONTEXT.md`). Fue generado inspeccionando el repositorio real el 2026-07-21 y debe actualizarse cada vez que cambie una regla de negocio, arquitectura, integración o comando principal.
>
> Origen: este documento consolida el contexto funcional entregado en `PROMPT_MAESTRO_CLAUDE_MYM_EVENTOS.md` (raíz del repo), corregido y ajustado contra el estado real del código. Donde el prompt maestro describe algo que el código todavía no implementa, se indica explícitamente como pendiente. Donde la documentación previa en `docs/*.md` contradice el código actual, se documenta la contradicción y la decisión tomada (ver §10).

---

## 1. Identidad y propósito

**M&M Eventos** es una plataforma integral para una empresa de eventos con salones propios (San Carlos, Villa Elisa, La Plata según `docs/PROJECT_CONTEXT.md`), que centraliza:

- captación comercial (leads, solicitudes de presupuesto, presupuestos, clientes, contratos, eventos);
- operación de salones, paquetes, inventario y personal;
- comunicación (email; WhatsApp vía enlaces `wa.me`, sin API oficial);
- dos productos digitales **independientes** del ciclo comercial de eventos privados: invitaciones digitales y venta de entradas con QR;
- un ecosistema de tres superficies: backoffice web, landing/páginas públicas y (a futuro, hoy sin construir) app móvil de personal.

El objetivo final (visión, no estado actual) es operar todo el negocio — desde la consulta hasta el cierre administrativo del evento — desde este ecosistema, con datos persistentes, auditoría, permisos reales y sin integraciones simuladas presentadas como definitivas.

---

## 2. Arquitectura real detectada

Monorepo pnpm confirmado en `pnpm-workspace.yaml` (`packages: apps/*, packages/*`), gestionado con `pnpm@10.24.0` (fijado en `package.json#packageManager`).

```
mymeventos/
├── api/                     # Adaptador serverless de Vercel (Express -> función)
│   ├── handler.ts           # conecta Mongo y delega en app de apps/api
│   ├── index.ts             # re-export de handler
│   └── [...path].ts         # catch-all Vercel -> handler
├── apps/
│   ├── api/                 # Backend Express + Mongoose + TypeScript  (@mym/api)
│   ├── web/                 # Frontend Next.js 16 App Router          (@mym/web)
│   └── mobile/              # App Expo/React Native — SOLO SCAFFOLD  (@mym/mobile)
├── packages/
│   └── shared/               # Enums, permisos, esquemas zod compartidos (@mym/shared)
├── docs/                    # Documentación funcional/técnica granular (ver §11)
├── vercel.json               # Config de despliegue (proyecto único)
├── pnpm-workspace.yaml
└── package.json               # scripts raíz (orquestación pnpm -r)
```

Principios verificados en el código (no solo aspiracionales):

- Autorización y reglas de negocio viven en el backend (`apps/api`), no solo ocultando botones en el frontend.
- Modelos preparados para multisalón (`salonIds`/`managedSalonIds` en `User`, alcance por salón en middlewares).
- Soft delete y auditoría presentes en la mayoría de entidades críticas (`deletedAt/deletedBy`, colección `AuditLog`).
- Snapshots congelados (no referencias vivas) en presupuestos, eventos y contratos — evita que cambios de catálogo alteren documentos ya emitidos.
- Idempotencia aplicada de forma puntual por dominio (no hay middleware genérico de idempotencia): conversión de presupuesto a evento, `TicketOrder.idempotencyKey`, `TicketRefund.idempotencyKey`, dedupe de webhooks de Mercado Pago por `(provider, providerEventId)`.

### 2.1 Backend — `apps/api`

- Stack: Express 4 + Mongoose 8 + TypeScript, validación con Zod.
- Estructura **por módulo de dominio** (no por capa técnica): `src/modules/<dominio>/{*.model.ts, *.routes.ts, *.service.ts}`. Módulos reales: `auth`, `audit`, `crm` (el más grande: leads, quote-requests, customers, quotes, events, calendar-items, contracts, payments, tableware), `email`, `invitations`, `landing`, `notifications`, `operations` (suppliers, catalog, inventory, consumption-rules, `Expense`/`ExpenseCategory`), `salons`, `settings`, `tickets`, `uploads`, `users`, y — **montados y en uso, no reflejados hasta esta actualización** — `production` (planes de producción por evento, `/production`), `expenses` (rutas sobre `Expense`, `/expenses`, incl. rentabilidad), `payroll` (liquidaciones de personal, `/payroll` + `/mobile/payroll`), `reporting` (dashboard + reportes agregados, `/reports`), `event-closure` (cierre operativo/financiero/administrativo de eventos). Esta lista no incluye todavía una revisión exhaustiva de `attendance`/`marketing`/`mobile` (ya documentados como reales en otras secciones de este documento) — se limitó a los módulos auditados en la tarea del 2026-07-29 (ver §8, §10.12).
- `src/routes/index.ts` monta todos los routers bajo `/api`.
- `src/middlewares/auth.ts`: `requireAuth`, `requirePermission`/`requireAnyPermission`, `requireRole`, `requireSalonScope` — RBAC real con alcance por salón, no solo por rol.
- `src/middlewares/publicRateLimit.ts`: rate limiting en memoria (por proceso) para endpoints públicos — **no apto para múltiples instancias**; requiere Redis o gateway antes de escalar horizontalmente (limitación auto-documentada en el propio código).
- `src/db/connection.ts`: conexión Mongoose con promesa cacheada a nivel de módulo (reutilización de conexión en entornos serverless/Vercel) + limpieza de índices legacy al conectar.
- Sin ESLint configurado: el script `lint` es un alias de `tsc --noEmit`.
- Tests: Vitest + Supertest, 23 archivos en `apps/api/tests/`, requieren una instancia MongoDB real (no se mockea la capa de datos).

### 2.2 Frontend web — `apps/web`

- Next.js 16.2.9 (App Router), React 19. **Nota:** existe `apps/web/AGENTS.md` advirtiendo que esta versión de Next.js tiene cambios que rompen compatibilidad con el conocimiento de entrenamiento habitual — consultar `node_modules/next/dist/docs/` antes de escribir código nuevo sobre routing/convenciones de Next.
- UI propia sobre Tailwind CSS v4 + primitivas Radix envueltas a mano (`src/components/ui/*`) — **no es shadcn/ui** pese a que `docs/ARCHITECTURE_DECISIONS.md` y `docs/CODING_RULES.md` lo indican como decisión tomada. Esto es una contradicción documentada (ver §10).
- Sin librería de formularios/validación (no `react-hook-form`, no `zod` en el cliente), sin capa de datos (no React Query/SWR — `fetch` directo por página), sin librería de tablas ni de fechas.
- Cliente HTTP propio en `src/lib/api.ts`: `fetch` con `credentials: 'include'`, refresco automático de sesión ante `401 UNAUTHENTICATED` (reintenta una vez tras `POST /auth/refresh`), envoltorio de respuesta `{ success, data, error }`.
- **No existe `middleware.ts`**: toda la protección de rutas `/admin/*` es del lado del cliente (`Protected` en `src/app/admin/layout.tsx`, redirección con `router.replace`). La seguridad real depende exclusivamente de que el backend rechace solicitudes no autorizadas — el frontend es solo UX, nunca una barrera de seguridad.
- Sin suite de tests (no hay script `test` en `apps/web/package.json`).
- Estructura: `app/` (rutas), `components/` (shell admin, primitivas UI, proveedores de sesión/tema), `features/` (módulos de negocio grandes: `digital`, `events`, `quotes`, `salons`, `landing`, `notifications`), `lib/` (cliente API, auth, permisos de navegación, labels de enums), `pages/api/[...path].ts` (único remanente de Pages Router, probablemente proxy).

### 2.3 App móvil — `apps/mobile`

**Estado real (actualizado 2026-07-25): app real de personal/asistencia implementada**, dejó de ser scaffold. Stack: Expo SDK 57 + React Native 0.86 + React 19.2 + React Navigation (stack + bottom tabs, todavía v6) + zustand + `@mym/shared` (dependencia de workspace). Corre con **New Architecture obligatoria** (desde SDK 55 ya no se puede desactivar); no requirió cambios de código porque la app no tiene módulos nativos propios. Migrado desde SDK ~50.0.8 el 2026-07-26 para poder correr en Expo Go sobre emuladores/dispositivos Android 15+ (ver `docs/MOBILE_BUILDS.md` para el detalle de la migración). Ver `docs/MOBILE_STAFF_APP.md` (arquitectura y pantallas), `docs/MOBILE_AUTHENTICATION.md` (auth Bearer + gate de acceso), `docs/ATTENDANCE_ARCHITECTURE.md` (modelos/idempotencia/geocercas), `docs/MOBILE_BUILDS.md` (build/EAS, pendiente), `docs/MOBILE_QA.md` (cobertura de pruebas y QA manual real).

Cubre: login (con Bearer token, no cookie), biometría local, fichaje de entrada/salida con geolocalización + cola offline, historial y detalle de jornada, incidencias, solicitudes de corrección y perfil/avatar/contraseña/dispositivos. Las fuentes de Turnos (`EventStaffAssignment`) y Avisos (`/api/notifications`) se preservan, pero no están expuestas en la navegación actual hasta que se acuerde ese alcance.

**No implementado / fuera de alcance de esta iteración** (documentado, no oculto): Turnos y Avisos en navegación móvil (código preservado para una negociación futura), notificaciones push reales (no se registran tokens mientras no exista envío), listener de conectividad en segundo plano (se chequea en los puntos de interacción), build EAS/credenciales de tienda, validación de entradas QR (deliberadamente fuera — módulo y permiso separados de Entradas Digitales).

**Corregido 2026-08-03 — UX de formularios**: (1) el teclado tapaba los últimos campos/el botón de enviar en las pantallas con formularios (`LoginScreen`, `ResetPasswordScreen`, `ForgotPasswordScreen`, `EditProfileScreen`, `ChangePasswordScreen`, `NewAdjustmentScreen`, `NewIncidentScreen`) porque solo `LoginScreen` envolvía su `ScrollView` en `KeyboardAvoidingView`, y en Android ese comportamiento dependía de `windowSoftInputMode=adjustResize`, que no resuelve bien con edge-to-edge forzado desde RN 0.76+/SDK 54+. Las 7 pantallas ahora usan `KeyboardAvoidingView` con `behavior: 'padding'` en iOS y `'height'` en Android. (2) "Solicitar corrección" (`NewAdjustmentScreen`) ya no usa campos de texto libre para fecha/hora (`AAAA-MM-DD`/`HH:MM`): reutiliza `DatePickerField` (ya existía, usado en "Fecha de nacimiento" de Editar perfil) y suma un `TimePickerField` nuevo (mismo patrón: modal propio con listas de horas/minutos, sin agregar `@react-native-community/datetimepicker` ni otra dependencia nativa), agrupados en dos secciones "Entrada"/"Salida" que muestran el horario ya registrado como referencia (nuevos parámetros opcionales `currentStartedAt`/`currentEndedAt` en la ruta `NewAdjustment`, provistos por `WorkSessionDetailScreen`).

**Corregido 2026-08-04:** (1) los íconos de `DatePickerField`/`TimePickerField` (calendario/reloj) usaban un carácter Unicode (`□`/`○`) como pseudo-ícono, que no se veía en algunos dispositivos/fuentes — no se veía ni en "Solicitar corrección" ni en "Fecha de nacimiento" de Editar perfil (ambos reutilizan estos mismos componentes). Se reemplazaron por formas dibujadas con `View` (bordes/posicionamiento), el mismo patrón ya usado por los íconos de la barra de tabs inferior — sin sumar ninguna librería de iconos. (2) `adaptive-icon.png` (ícono de Android al instalar la app) se regeneró: el arte ocupaba casi el 100% del lienzo de 512×512, así que la máscara de "zona segura" (66% de diámetro) que aplica el launcher de Android recortaba las puntas del wordmark — se reescaló a un recorte con transparencia real, centrado al ~68%, sin costura visible. `icon.png` (iOS) no se tocó, esa máscara es mucho menos agresiva. (3) Nueva notificación local **no push** ("Jornada en curso", `apps/mobile/src/lib/activeSessionNotification.ts`, dependencia nueva `expo-notifications`) que queda fija en la barra de notificaciones de Android mientras haya un `WorkSession` `ACTIVE` — se dispara al fichar entrada, se cancela al fichar salida o al cerrar sesión, y `attendanceStore.refresh()` la reconcilia contra el servidor en cada `GET /mobile/attendance/status` (por eso sobrevive a cerrar la app: Android conserva la notificación ya publicada aunque el proceso muera, y al reabrir la app se vuelve a sincronizar). No es un foreground service ni una tarea en segundo plano real — no hay código corriendo mientras la app está cerrada, solo una notificación local ya publicada. Ver `docs/MOBILE_STAFF_APP.md` §4.7. (4) `open-session-alerts.service.ts` (automatización P20, §14.2): el umbral de "jornada abierta sin fichaje de salida" bajó de 14 a 8 horas.

### 2.4 Paquete compartido — `packages/shared`

Único paquete realmente compartido; construido (`dist/`) y con tests propios (Vitest).

- `constants/roles.ts`: `Role` (`ADMIN`, `MANAGER`, `SALON_MANAGER`, `STAFF`), `StaffSubrole`, `StaffEmploymentStatus`.
- `constants/statuses.ts`: `LeadStatus`, `EventStatus`, `QuoteStatus`, `PaymentStatus`, `PaymentMethod`, `TicketStatus`, `InvitationStatus`, `InventoryMovementType`, `AttendanceStatus` (dormant/superado, ver §2.3 y `docs/ATTENDANCE_ARCHITECTURE.md` §1), `PromotionType`.
- `constants/attendance.ts` (nuevo): `WorkSessionStatus`, `TimePunchType`, `TimePunchSource`, `LocationValidationStatus`, `AttendanceAdjustmentStatus`, `AttendanceIncidentType`, `AttendanceIncidentStatus`, `AttendanceClassification` — el enum realmente usado por el fichaje móvil.
- `constants/operations.ts`: enums de catálogo/inventario/consumo (`CatalogItemType`, `BeverageType`, `InventoryItemType`, `ConsumptionRuleTarget`, `RoundingMode`, `PricingMode`, `QuoteMode`, `SupplierCategory`, etc.).
- `constants/permissions.ts`: enum `Permission` (claves punteadas, ej. `digitalTickets.publish`) + `RolePresets: Record<Role, Permission[]>` (ADMIN = todos los permisos; STAFF ahora incluye además autogestión móvil/asistencia: `mobile.access`, `attendance.clock`, `attendance.history.self`, `attendance.schedule.self`, `attendance.incident.create`, `attendance.adjustment.request`, `profile.*.self`, `security.password.change`; `MANAGER`/`SALON_MANAGER` suman `attendance.read`/`attendance.manage`).
- `schemas/common.ts`: esquemas zod comunes (`ObjectIdSchema`, `PaginationSchema`, `MoneySchema`, `ContactDataSchema`, etc.).
- `utils/permissionHelpers.ts`: `hasPermission`, `hasAnyPermission`, `hasAllPermissions`.
- Consumo real: **39+ archivos** en `apps/api`, **6+ archivos** en `apps/web`, y ahora **`apps/mobile` también lo consume** (dependencia de workspace agregada al construir la app de personal — ya no es cierto que móvil no tenga código funcional ni que no use `@mym/shared`).

---

## 3. Comandos reales (verificados en `package.json`)

### Raíz (orquesta con `pnpm -r`)

| Comando | Efecto |
|---|---|
| `pnpm dev` | `pnpm -r --parallel run dev` (todas las apps) |
| `pnpm dev:web` | `pnpm --filter @mym/web run dev` |
| `pnpm dev:api` | `pnpm --filter @mym/api run dev` |
| `pnpm dev:mobile` | `pnpm --filter @mym/mobile run start` |
| `pnpm build` | `pnpm -r run build` |
| `pnpm lint` | `pnpm -r run lint` |
| `pnpm typecheck` | `pnpm -r run typecheck` |
| `pnpm test` | `pnpm -r run test` (nota: `apps/web` no tiene script `test`, por lo que ese workspace no aporta nada al comando) |

### `apps/api` (usar `pnpm --filter @mym/api <script>`)

`start`, `dev` (nodemon + ts-node), `build` (`tsc`), `lint`/`typecheck` (ambos `tsc --noEmit`), `test` (`vitest run`), `reset:admin-password`, `migrate:package-template-names`, `migrate:invitation-event-index`, `migrate:ticket-type-sale-index`, `migrate:remove-ticket-payment-credentials` y `migrate:unique-user-email-index`. Toda operación que modifique datos exige autorización explícita según [`AGENTS.md`](../AGENTS.md).

`reset:admin-password` está pensado para uso local/manual (no expone endpoint HTTP) y se bloquea si `NODE_ENV=production`.

### `apps/web` (usar `pnpm --filter @mym/web <script>`)

`dev`, `build`, `start`, `lint`, `typecheck`. **Sin script `test`.**

### `apps/mobile` (usar `pnpm --filter @mym/mobile <script>`)

`start` (`expo start`), `android`, `ios`, `web`, `typecheck`, `test` (`jest`, entorno Node simple — ver `docs/MOBILE_QA.md` sobre por qué no se usa el preset `jest-expo`). Sin `lint` ni `build` (no hay build EAS configurado, ver `docs/MOBILE_BUILDS.md`).

### `packages/shared` (usar `pnpm --filter @mym/shared <script>`)

`build` (`tsc`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`).

> Nota de estilo detectada en `docs/VERCEL_DEPLOYMENT.md`: mezcla `pnpm --filter api` / `pnpm --filter web` (sin scope) con `pnpm --filter @mym/api` / `@mym/web` (con scope) en el mismo bloque de comandos. Los nombres reales de paquete son **con scope** (`@mym/api`, `@mym/web`, `@mym/mobile`, `@mym/shared`) — usar siempre esa forma.

---

## 4. Variables de entorno reales

Consolidado desde `.env.example`, `apps/api/src/config/env.ts` y usos directos de `process.env` en el código.

| Variable | Uso |
|---|---|
| `NODE_ENV`, `PORT` | Entorno/puerto del proceso API |
| `MONGODB_URI` | Conexión MongoDB |
| `CORS_ORIGIN` | Origen permitido (con fallback a `VERCEL_URL` en previews) |
| `VERCEL_URL` | Usado como fallback de `CORS_ORIGIN` en despliegues de Vercel |
| `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` | Firmas JWT (mínimo 32 caracteres) |
| `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN` | Expiración de tokens (`15m` / `7d` por defecto) |
| `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE` | Configuración de cookies de sesión |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envío de email vía Nodemailer |
| `EMAIL_NOTIFICATIONS_ENABLED` | Si es `false` o falta SMTP, el envío de email se omite sin fallar el flujo (no es un mock, es un apagado por configuración) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_URL` | Subida de archivos/PDFs a Cloudinary |
| `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `MERCADO_PAGO_ENVIRONMENT`, `TICKET_PAYMENT_PROVIDER` | Integración de pagos de entradas digitales (`TICKET_PAYMENT_PROVIDER=mock` por defecto si no hay credenciales) |
| `CRON_SECRET` | Autoriza el tick interno de recordatorios financieros y el respaldo diario de Vercel. Mientras Marketing conserve su fallback, debe coincidir también con `MARKETING_CRON_SECRET`. |
| `TICKET_AUTOMATION_CRON_SECRET` | Autoriza el endpoint interno de automatización de entradas invocado por GitHub Actions cada 5 minutos. |
| `RESET_ADMIN_USERNAME`, `RESET_ADMIN_PASSWORD` | Script `reset:admin-password` (mínimo 12 caracteres, bloqueado en producción) |
| `NEXT_PUBLIC_API_URL` | Base URL que usa `apps/web` para llamar a la API (`/api` en producción, `http://localhost:3001/api` en desarrollo) |
| `MOBILE_ACCESS_TOKEN_TTL`, `MOBILE_REFRESH_TOKEN_TTL` | TTL de los tokens Bearer de la app móvil (`30m`/`30d` por defecto — más largos que los de cookie web) |
| `MOBILE_DEEP_LINK_SCHEME` | Scheme usado para construir el link de recuperación de contraseña enviado por email (debe coincidir con `apps/mobile/app.json#scheme`) |
| `ATTENDANCE_DEFAULT_TIMEZONE`, `ATTENDANCE_DEFAULT_LOCATION_ACCURACY_METERS`, `ATTENDANCE_DEFAULT_GEOFENCE_RADIUS_METERS` | Defaults de la configuración global de asistencia (editable desde `/admin/attendance` → Configuración, persistida en `SystemSetting`) |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_DEEP_LINK_SCHEME` (en `apps/mobile/.env`) | Config del cliente Expo — sin secretos, se embeben en el bundle JS |

No se detectaron secretos versionados en el repositorio; `.env` existe localmente (ignorado por git) y `.env.example` documenta las claves sin valores sensibles.

---

## 5. Flujo comercial real (Lead → Presupuesto → Cliente → Contrato → Evento)

El flujo implementado es más granular que el descrito de forma resumida en el prompt maestro:

```
Consulta pública / alta manual
        │
        ▼
      Lead  ──────────────────────────────────────────► LeadActivity (timeline/auditoría)
        │
        ▼
 QuoteRequest  (solicitud pendiente, con dedupe de leads por email/teléfono/nombre)
        │  (un operador "toma" la solicitud y genera 1+ presupuestos)
        ▼
      Quote  (borrador → enviado → aceptado/rechazado/expirado → convertido)
        │        - Modo PACKAGE (paquete cerrado), CUSTOM (líneas de catálogo) o HYBRID
        │        - QuoteRevision guarda versiones
        ▼
    Customer  (creado/reutilizado de forma idempotente al convertir; evita duplicados
               por email/teléfono/nombre/Lead de origen)
        │
        ▼
      Event  (idempotente: no crea dos eventos por reintentos; snapshot comercial/menú/
              servicios/pagos; estados: draft, quoted, contract_draft, deposit_pending,
              reserved, confirmed, cancelled, lost)
        │
        ▼
    Contract  (editable antes de aprobar; versionado — contractFamilyId/supersedesContractId;
               ContractAddendum para cambios posteriores aprobados)
```

Puntos verificados en el código (no solo en documentación):

- `POST /api/quotes/:id/convert-to-event` es idempotente (devuelve el evento existente si ya se convirtió).
- La reutilización de `Customer` sigue un orden de prioridad: `quote.customerId` → `Customer.sourceLeadId` → email normalizado → teléfono normalizado.
- Los cálculos de presupuesto no dependen solo del frontend: existen endpoints de cálculo/recalculo en el backend (`POST /api/quotes/custom-calculate`, `POST /api/quotes/:id/recalculate`).
- Los ítems de catálogo/paquete que entran a un presupuesto quedan **congelados** (snapshot) en el presupuesto/evento/contrato — cambios posteriores en el catálogo no alteran documentos ya emitidos.
- **Pendiente explícito** (documentado en `docs/EVENTS_MODULE.md` y `docs/CUSTOM_QUOTING_MODULE.md`): no hay workflow de firma/aceptación formal de contrato, no hay bloqueo de disponibilidad de salón por fecha a nivel de reserva dura, no hay aprobación interna por margen bajo, no hay integración automática de compras/reservas de stock reales desde el presupuesto, no hay aceptación parcial de líneas opcionales por el cliente.

---

## 6. Separación obligatoria de dominios: Evento / Invitación digital / Entradas digitales

Esta es una regla crítica reforzada tanto en el prompt maestro como en la documentación previa, y **ya está implementada correctamente en el código actual**, tras una corrección de arquitectura registrada en `docs/INDEPENDENT_DIGITAL_MODULES_CORRECTION.md`.

Historial (relevante para no repetir el error):

1. **Diseño original** (`docs/DIGITAL_INVITATIONS_AND_TICKETS_PLAN.md`): planificó `DigitalInvitation` y `TicketSale` **obligatoriamente ligados a `Event`** (`eventId`, `salonId`, `customerId`), con rutas anidadas bajo `/admin/events/:id/{invitations,tickets,check-in}`.
2. **Implementación de ese diseño** (`docs/DIGITAL_INVITATIONS_AND_TICKETS.md`): confirma que se construyó tal cual el plan, acoplado a `Event`.
3. **Corrección** (`docs/INDEPENDENT_DIGITAL_MODULES_CORRECTION.md`, el mismo día, ~7 horas después): reconoce explícitamente que el acoplamiento a `Event` "contradice la autonomía requerida" y ordena eliminar `eventId`/`salonId`/`customerId` de ambos módulos, renombrar la entidad de venta a `TicketPublication`, y mover las rutas web a `/admin/digital-invitations/**` y `/admin/digital-tickets/**`.

**Estado real verificado en el código (2026-07-21): la corrección está aplicada.** El backend confirma:

- `DigitalInvitation` (módulo `invitations`) no tiene relación obligatoria con `Event`; tiene su propio `publicToken`, tema, contenido y RSVP.
- `TicketPublication` (módulo `tickets`) es la entidad de venta de entradas, con capacidad, ventanas de venta, visibilidad y configuración de pago propias — sin `eventId`/`salonId`/`customerId`.
- El frontend expone ambos módulos como rutas de nivel superior independientes: `/admin/digital-invitations/*` y `/admin/digital-tickets/*` — no existen ya páginas bajo `/admin/events/[id]/{invitations,tickets,check-in}`.

**Decisión documentada:** `docs/DOMAIN_MODEL_OVERVIEW.md` (línea que describe `DigitalInvitation` como "asociada a un Event") y la relación Event-acoplada de `docs/DIGITAL_INVITATIONS_AND_TICKETS_PLAN.md`/`docs/DIGITAL_INVITATIONS_AND_TICKETS.md` quedan **superadas** por `docs/INDEPENDENT_DIGITAL_MODULES_CORRECTION.md`, que es la arquitectura vigente. No se modificó ningún doc antiguo (se conservan como historial), pero cualquier trabajo futuro debe tomar la corrección como verdad y no reintroducir `eventId` en estos módulos. `docs/DIGITAL_INVITATIONS_AND_TICKETS_TESTING.md` describe pruebas manuales que navegan "dentro de un evento" — esas rutas ya no existen; la intención de las pruebas (concurrencia de cupos, unicidad de QR, idempotencia) sigue siendo válida pero las rutas mencionadas están desactualizadas.

Relación opcional permitida: ninguna de las dos entidades exige hoy un evento/salón/cliente; si en el futuro se agrega una vinculación opcional, debe seguir siendo no obligatoria y no debe reintroducir dependencias estructurales.

---

## 7. Usuarios, roles y permisos — estado real vs. documentado

**Código (`packages/shared/src/constants/roles.ts`, fuente de verdad):** solo 4 roles: `ADMIN`, `MANAGER`, `SALON_MANAGER`, `STAFF`. Coincide con el prompt maestro (§6).

**Contradicción detectada:** `docs/PROJECT_CONTEXT.md` y `docs/SECURITY_RULES.md` mencionan un set de 8 roles (`ADMIN, MANAGER, SALON_MANAGER, STAFF, ACCOUNTING, OPERATIONS, SALES, VALIDATOR`).

**Decisión documentada:** el código es la fuente de verdad operativa. Los 4 roles adicionales (`ACCOUNTING`, `OPERATIONS`, `SALES`, `VALIDATOR`) **no están implementados** — se tratan como una ampliación aspiracional no construida, no como un bug. No inventar su implementación; si se solicita, debe presupuestarse/planificarse como tarea explícita, evaluando si conviene modelarlos como roles nuevos o como combinaciones de permisos sobre los roles existentes (dado que `Permission`/`RolePresets` en `@mym/shared` ya permite otorgar permisos granulares por usuario vía overrides, sin necesariamente crear más roles).

Detalles reales de autorización:

- `User` (módulo `users`) es la entidad única de cuenta: roles + `permissionOverrides`/`permissionDeniedOverrides` + `salonIds`/`managedSalonIds` + perfil de staff/empleado/nómina/horario/asistencia. No existen colecciones separadas `Role`/`Permission` en MongoDB — son enums de `@mym/shared`.
- `hasAnyPermission(role, permissions, overrides, deniedOverrides)` decide acceso combinando el preset del rol con los overrides del usuario.
- Alcance por salón: `requireSalonScope` en el backend valida el salón contra `salonIds`/`managedSalonIds` del usuario — no es solo un filtro de UI.
- **Brecha de seguridad a tener presente:** el frontend no tiene `middleware.ts`; toda la protección de `/admin/*` es client-side (redirección tras cargar la sesión). Esto es aceptable como UX siempre que el backend siga siendo la única barrera real — cualquier tarea futura debe verificar que un endpoint nuevo valide permisos en el backend, no asumir que ocultar un botón alcanza.

---

## 8. Estado real por módulo de negocio

Tabla de estado (Implementado / Parcial / Pendiente) contrastando backend, frontend y navegación.

| Módulo | Backend | Frontend web | Navegación | Estado global |
|---|---|---|---|---|
| Auth (login/refresh/logout) | Implementado | Implementado | — | **Implementado** |
| Leads | Implementado, con `LeadActivity`, dedupe | Implementado (CRUD completo, 561 líneas) | En menú | **Implementado** |
| Solicitudes de presupuesto (QuoteRequest) | Implementado (dedupe, notificación, conversión) | Implementado (pestaña dentro de `/admin/quotes`) | En menú (con badge de no leídos) | **Implementado** |
| Presupuestos (Quote/PackageTemplate) | Implementado (PACKAGE/CUSTOM/HYBRID, revisiones, PDF) | Implementado | En menú | **Implementado** |
| Clientes (Customer) | Implementado, conversión idempotente | Implementado | En menú | **Implementado** |
| Contratos (Contract/ContractAddendum) | Implementado (versionado, PDF, aprobación) | Implementado (incl. vista de impresión) | En menú | **Implementado** (sin firma electrónica formal) |
| Eventos (Event) | Implementado (snapshot operativo completo); genera automáticamente PDF/Word de timeline, logística, invitados por mesa y (desde 2026-07-29) reserva de vajilla (`event-operational-document.service.ts`) con un clic (endpoints `.../operational-documents/{timeline,logistics,guest_list,tableware,full}/export`); el documento de vajilla lista por separado lo asignado del stock propio del salón (`EventTablewareAllocation.source: 'salon_stock'`) y lo adicional/externo (`source: 'external'`), independiente de `resourcePlanSnapshot.inventoryItems`; **agregado 2026-08-05: quinto tipo `full` ("Cronograma integral")** que agrega las 7 áreas del evento en un solo PDF/Word — momentos (+ notas de staff), invitados y mesas, logística, vajilla y stock (vajilla asignada + `resourcePlanSnapshot.inventoryItems`), productos (`resourcePlanSnapshot.productItems`, agrupados por rubro salado/dulce/bebidas/otros), proveedores (`resourcePlanSnapshot.supplierAssignments`) y staff asignado y roles (`EventStaffAssignment`, no incluido en los otros 4 tipos) — cada área en su propia página (salto de página forzado, tanto en PDF como en el HTML del Word vía `page-break-before`), omitiendo por completo cualquier área sin datos cargados; reutiliza los mismos renderers que los documentos individuales generalizados con un parámetro `type`, sin duplicar lógica. Nuevo endpoint de sólo lectura `GET .../operational-documents/:documentType/preview-pdf` (aplica a los 5 tipos) genera el PDF al vuelo para vista previa **sin subirlo a Cloudinary** — el botón "Generar" (`/export`, ya existía) sigue siendo el único que persiste, y sigue sobrescribiendo el mismo `public_id` por evento+tipo+formato (`overwrite:true`) en vez de acumular versiones; el cliente puede cargar su propia lista de invitados vía link público (`POST /events/:id/guest-list-link`); **cierre en 3 niveles implementado** (operativo/financiero/administrativo, `event-closure` module, con checklist propio por nivel) | Implementado (incl. calendario 988 líneas, workspace de invitados por mesa con tablero visual) | En menú | **Implementado** (sin bloqueo duro de disponibilidad por fecha; el checklist de vajilla ya tiene documento exportable propio — ver recomendación 5 del gap analysis, cerrada) |
| Calendario general (CalendarItem) | Implementado (CRUD propio en `calendar-items.routes.ts`); tipos soportados: `event`, `alert`, `reminder`, `note`, `task`, `payment_window`, `meeting` (este último agregado el 2026-07-25 para agendar reuniones con leads/clientes, sin acoplarse a `Event`/`Lead`/`Customer` — la vinculación es opcional vía `leadId`/`customerId`, igual que en el resto de los tipos); las alertas/recordatorios cargados en la pestaña "Tareas" del detalle de un evento (`resourcePlanSnapshot.alerts`) se sincronizan automáticamente como `CalendarItem` (`type: 'reminder'`, `source: 'event'`, `eventId` seteado) vía `apps/api/src/modules/crm/event-alert-calendar-sync.service.ts` (invocado desde `POST /events` y `PATCH /events/:id`). Desde 2026-07-28, cuotas/pagos pendientes y saldo contractual generan `payment_window` de sistema con locks, reintentos e idempotencia. | Implementado (`/admin/calendar`, filtros por tipo/estado/prioridad/notificación) | En menú | **Implementado**, sincronización automática para alertas de evento y recordatorios financieros; notas, tareas sueltas y reuniones siguen siendo manuales |
| Salones | Implementado; stock de salón (`SalonStockItem`) desde 2026-07-29 cubre 8 categorías: `PLATES`/`GLASSWARE`/`DRINKWARE`/`CUTLERY`/`MISCELLANEOUS` (con conteos reales sembrados, ver §10.12) más `LINENS`/`CLEANING`/`MINOR_EQUIPMENT` (categorías nuevas, sin sembrar — a cargar por el equipo) | Implementado (incluye gestión de paquetes embebida; pestaña "Stock" del salón, renombrada desde "Vajilla") | En menú | **Implementado** |
| Paquetes (PackageTemplate/VenuePackageRule) | Implementado | Implementado, pero **embebido en Salón**, no es módulo propio | Sin entrada propia | **Implementado**, sin ruta dedicada |
| Extras (ServiceExtra) | Implementado (modelo + rutas en `operations`) | No se identificó UI dedicada | No | **Parcial** |
| Catálogo de operaciones (CatalogItem, Supplier) | **Actualizado 2026-08-05**: `catalog.routes.ts` (rutas de `CatalogItem`, montadas en `/catalog`; también expone `ServiceExtra` en `/catalog/services`, sin frontend propio todavía) — ver `docs/PRODUCTION_MODULE.md` §7 | Pantalla propia en `/admin/production/catalog` (alta/edición/activar/eliminar producto — nombre, tipo, categoría, unidad); la carpeta histórica `admin/catalog` (pensada para un catálogo genérico con servicios/proveedores) sigue vacía, no se resucitó | En submenú "Producción" (pestaña "Catálogo") | **Implementado** para productos de Producción; el resto del módulo (servicios extra por catálogo, inventario, reglas de consumo) sigue igual que antes (ver §10) |
| Inventario | Modelo + rutas implementadas, **no montadas** | Carpeta `admin/inventory` vacía | No | **Parcial / inconsistente** |
| Reglas de consumo (ConsumptionRule) | Implementado, **no montado** | Carpeta `admin/consumption-rules` vacía | No | **Parcial / inconsistente** |
| Proveedores (Supplier) | Implementado y **sí montado** (`suppliers.routes.ts`) | Implementado (lista + detalle) | En menú | **Implementado** |
| Personal (Staff/Employee) | Implementado dentro de `User` (subrol, salones habilitados, asignación a eventos) | Implementado (CRUD) | **Actualizado 2026-07-25: ya tiene entrada en el submenú "Configuración"** (antes solo accesible por URL directa) | **Implementado** |
| Fichaje/asistencia (Attendance) | **Implementado 2026-07-25**: `WorkSession`/`TimePunch`/`AttendanceIncident`/`AttendanceAdjustmentRequest` (`apps/api/src/modules/attendance/`), geocercas por salón, idempotencia real, offline handling — ver `docs/ATTENDANCE_ARCHITECTURE.md` | Implementado: `/admin/attendance` (activos/historial/incidencias/correcciones/configuración) + pestaña "Asistencia" en `/admin/salons/[id]` (geocerca) | En submenú "Configuración" | **Implementado** (la vista de liquidaciones agregada **ya existe**, ver fila "Liquidaciones (Payroll)" más abajo — corrige `docs/ATTENDANCE_BACKOFFICE.md` §5; no se confirmó en esta tarea si la exportación de registros de asistencia en sí está implementada) |
| Producción (ProductionPlan) | **Implementado** (`apps/api/src/modules/production/`): un plan por evento, versionado, con secciones tipadas (salado/dulce/bebidas/torta/panadería/cocina/barra/varios) e ítems con cantidad planificada, listo/chequeado (con quién y cuándo) y observaciones — calca casi campo a campo la planilla mensual de Producción. Se genera automáticamente combinando `ProductionRule` (cantidad por invitado, configurable por salón/paquete) con los datos del evento; detecta cambios y permite regenerar. El endpoint de "consolidado" **sí desglosa por evento y por sección** (corrige una afirmación de una versión previa de este documento y del gap analysis — el código ya lo tenía). **Agregado 2026-08-05** (ver `docs/PRODUCTION_MODULE.md`): (a) cancelar/perder un evento cancela automáticamente su plan de producción vigente (`cancelCurrentProductionPlan`) — antes `ProductionPlan.status: 'cancelled'` era un valor de enum muerto que ningún código asignaba, dejando planes de eventos cancelados vivos para siempre en los listados; un plan ya `closed` no se toca; (b) generar/regenerar producción para un evento `cancelled`/`lost` ahora se bloquea explícitamente (`PRODUCTION_EVENT_CANCELLED`); (c) nuevo recordatorio automático D+1/D+3 (`production-close-reminders.service.ts`, mismo `/api/internal/calendar-tick`) cuando el evento ya pasó y el plan sigue sin cerrarse (`closed`) — simétrico del aviso ya existente de "falta generar producción" | Implementado (`/admin/production`, `/admin/production/[id]`, `/admin/production/rules`, `/admin/production/consolidated`) | En menú | **Implementado** |
| Gastos (Expense) / Rentabilidad | **Implementado** (`apps/api/src/modules/expenses/`, modelo en `operations/operations.models.ts`): gasto por evento con proveedor, categoría (sembrada con categorías reales: Panadería, Limpieza, Staff, DJ, Proyector, Ambientación, etc.), monto inicial estimado/final/adicional/impuestos. Reporte de **rentabilidad económica real por evento** (`GET /expenses/profitability/events`): ingreso contratado − gasto real = margen económico, con % de margen y resultado de caja, filtrable por período/salón. **Agregado 2026-07-29**: `GET /expenses/by-supplier` agrupa los gastos del período por proveedor con inicial/final/adicional/impuestos/total, desvío (final − inicial), pagado/pendiente y cantidad de gastos — reemplaza "Control de Gastos I/II/III" y "Relación de Gastos" de la planilla mensual (recomendación #3 de `docs/MYM_EVENTOS_ADMINISTRATIVE_GAP_ANALYSIS.html`). Sin vista agrupada por categoría equivalente (solo por proveedor) | Implementado (`/admin/expenses`, `/admin/expenses/by-supplier`, `/admin/expenses/profitability`) | En menú | **Implementado**, incluida la vista agrupada por proveedor; queda pendiente la agrupación por categoría si se pide |
| Reportes (dashboard + reportes agregados) | **Implementado** (`apps/api/src/modules/reporting/`): dashboard con métricas por período/salón (leads, presupuestos, eventos, contratos, pagos, gastos, producción) y módulo de reportes exportables a CSV/Excel: `leads`, `quotes`, `events`, `contracts`, `payments`, `expenses`, cada uno con resumen y desgloses por estado/salón/categoría, filtrables por fecha y salón. **Agregado 2026-07-29**: reporte `payment-control` ("Control de pagos mensual") agrega por contrato/cliente las cuotas pendientes cuyo vencimiento cae en el período, en una sola pantalla con cliente, evento, salón, total del evento, cobrado, saldo, cuotas restantes, valor de la próxima cuota, ventana de fecha de pago y observaciones — cierra la recomendación #4 de `docs/MYM_EVENTOS_ADMINISTRATIVE_GAP_ANALYSIS.html`, que la describía como reconstruible combinando a mano los reportes de Pagos y Contratos. **Corregido 2026-08-05**: la versión original cruzaba `Payment` (`status:'pending'`) para encontrar las cuotas, pero esa colección casi nunca tiene registros pendientes en la práctica (el único flujo real de cobro los crea directo como `'paid'`) — el reporte quedaba casi vacío. Ahora lee `Contract`/`Event.paymentPlanSnapshot` directo (mismo dato que ya usan los recordatorios de pago al cliente), ver detalle más abajo | Implementado (`/admin/dashboard`, `/admin/reports`, `/admin/reports/[key]` — el frontend es genérico por columnas/filas declaradas en el backend, no requirió cambios propios para sumar `payment-control`) | En menú | **Implementado** — corrige la nota de la fila "Marketing y Campañas" más abajo, que describía `Reports/*` como scaffolding sin páginas; eso ya no es así |
| Liquidaciones (Payroll) | **Implementado** (`apps/api/src/modules/payroll/`): calcula liquidaciones reales a partir de `WorkSession` (asistencia aprobada) — horas normales/extras, adicional nocturno/fin de semana/feriado, distintos tipos de compensación (por hora/día/mes/evento/mixto), adelantos y ajustes manuales. Al aprobar una liquidación se genera automáticamente un `Expense` de categoría personal vinculado al evento/salón, conectando con el reporte de rentabilidad | Implementado (`/admin/payroll`) | En submenú "Configuración" | **Implementado** — corrige la fila equivalente de una versión previa de este documento, que lo describía como "solo permisos, sin cálculo salarial" |
| Pagos (Payment) | Implementado (tipos, métodos incl. Mercado Pago, recibos PDF); desde 2026-07-24 el modelo `Payment` también acepta entradas de solo lectura con `source: 'ticket_order'` (`eventId`/`contractId`/`customerId`/`salonId` ahora opcionales, nuevo `ticketOrderId`) creadas automáticamente por `ticket.service.ts#markOrderPaid` al aprobarse una compra de entradas (webhook o marcado manual), y sincronizadas al estado `refunded`/`refundedAmount` desde `refundTicketOrder`. Las cuotas de `Event.paymentPlanSnapshot` y pagos manuales pendientes con vencimiento alimentan recordatorios financieros internos D-7, D-3, D0, D+1, D+3 y D+7; el saldo del contrato se controla a D-15 del evento. | Implementado; la lista/detalle de Pagos muestra ambos orígenes (badge "Entrada digital"), con filtro `source`; las filas de entradas digitales son de solo lectura (edición/cobro/cancelación/reembolso se rechazan con `PAYMENT_TICKET_ORDER_READONLY`, se gestionan desde la orden en Entradas digitales) | En menú | **Implementado** (pagos manuales de eventos/contratos + pagos automáticos de entradas digitales conviven en la misma colección para trazabilidad contable; Mercado Pago real sigue integrado solo en el módulo de entradas, no hay cobro online iniciado desde Pagos) |
| Landing / sitio público | Implementado como CMS (`LandingSettings` y afines) + página pública real con SEO/JSON-LD y formulario de consulta. **Actualizado 2026-07-29**: el hero admite video de fondo además de imagen (`LandingSettings.heroVideoUrl`, mismo pipeline de subida genérico de `/uploads` que ya soportaba video, sin cambios de backend de uploads); nueva colección/tab `LandingStoryStep` (`GET/POST/PATCH/DELETE /landing/story-steps`) para configurar título/descripción/imagen de los 4 pasos de la sección pública "Cómo trabajamos", con imágenes IA fotorrealistas locales en `apps/web/public/images/story/step-{1..4}.jpg` hasta que el equipo cargue fotos propias. Un rediseño visual completo del landing (paleta monocromática, tipografía serif itálica, secciones de salones/"cómo trabajamos" rediseñadas) quedó revertido a pedido explícito, conservando solo 4 piezas: el hero (con su tipografía original, más el nuevo soporte de video), la sección "Nuestros salones" (tarjetas con foto de fondo completo), "Cómo trabajamos" (diseño de scroll sticky a 2 columnas, ahora configurable) y una nueva sección de cierre "Tu evento merece un lugar así de memorable" antes del footer | Implementado | En menú (admin) | **Implementado** |
| Invitaciones digitales | Implementado, independiente de `Event` (ver §6) | Implementado (workspace visual, temas, envío) | En menú | **Implementado** |
| Entradas digitales (tickets) | Implementado, independiente de `Event` (ver §6); Mercado Pago real vía `fetch` + proveedor mock explícito; `GET /tickets/publications` oculta por defecto las publicaciones con `status: 'archived'` (excluidas salvo que se filtre explícitamente por `status=archived` o se use `search`). Las reservas vencidas se procesan de forma autónoma cada 5 minutos mediante GitHub Actions → `POST /api/tickets/process`. | Implementado (publicaciones, órdenes, check-in, ajustes de Mercado Pago) | En menú | **Implementado** — operación en `docs/TICKET_AUTOMATION.md` |
| Validación/escaneo QR | Implementado en backend y en frontend (API nativa `BarcodeDetector` + fallback manual). **Actualizado 2026-08-03**: la validación (`resolveCheckInResult`, `apps/api/src/modules/tickets/ticket.service.ts`) ahora es de "procedimiento completo" en vez de solo `valid`/`already_checked_in`/passthrough — detecta explícitamente entrada de **otra publicación** (`wrong_publication`, lookup global por token sin filtrar por `publicationId`, seguro porque `ticketCode`/`qrTokenHash`/`publicToken` son únicos en toda la colección), **vencida según `qrConfig.validUntil`** de la publicación (`expired`, calculado en el momento del escaneo, sin mutar el estado guardado del ticket) y **transferida** (`transferred` — antes faltaba en el enum de `TicketAccessAttempt.result` y una entrada transferida escaneada rompía la escritura con un error de validación de Mongoose; corregido). El mismo helper se reutiliza en `/check-in` (paso de escaneo) y `/check-in/confirm` (paso de confirmación), así que confirmar nunca cae en un estado sin reconocer. | Implementado (`TicketCheckIn`, `apps/web/src/features/digital/check-in.tsx`, con etiquetas propias para cada resultado — vencida, de otra publicación, cancelada, reembolsada, transferida) | **Nueva sección propia en el menú**: "Escanear Entradas" (`/admin/ticket-scanner`, permiso `TICKETS_VALIDATE`), independiente de tener que entrar primero a una publicación puntual de Entradas Digitales — lista publicaciones activas/próximas con buscador y lleva directo al escaneo (`apps/web/src/features/digital/scan-hub.tsx`); también accesible desde un botón en el panel de Entradas Digitales. La ruta original por publicación (`/admin/digital-tickets/[publicationId]/check-in`) se conserva sin cambios. | **Implementado** — nota: `Permission.TICKETS_VALIDATE` solo está en los presets de `MANAGER`/`SALON_MANAGER`/`ADMIN` (`packages/shared/src/constants/permissions.ts`), no en `STAFF`; si personal de puerta sin esos roles va a escanear, hay que otorgarles el permiso por override desde `/admin/users/[id]` |
| Usuarios / Roles / Permisos | Implementado | Implementado (incl. editor de permisos por usuario) | En menú | **Implementado** (solo 4 roles reales, ver §7) |
| Notificaciones | Implementado (modelo, servicio, rutas) | Implementado (página + campana en header) | En menú | **Implementado** |
| Auditoría (AuditLog) | Implementado y usado desde varias rutas mutantes | **Sin página de visualización** | No | **Parcial** (se registra, no se puede consultar desde la UI) |
| Configuración general | Implementado (`SystemSetting` clave/valor) | Implementado | Submenú "Configuración" | **Implementado** |
| Marketing y Campañas | Implementado desde 2026-07-25: `Promotion`, `MarketingTemplate`, `MarketingAudience`, `MarketingCampaign`, `MarketingRecipient`, `MarketingSendLog`, `MarketingWebhookEvent`, `MarketingSettings` (`apps/api/src/modules/marketing/`); segmentación de leads/clientes, envío por lotes con locks Mongo (primer motor de cron del proyecto, ver §12), proveedor Resend real vía `fetch` + mock explícito y webhooks firmados (Svix). `MarketingUnsubscribe` se conserva solo como historial y ya no interviene en envíos nuevos. | Implementado (Resumen, Campañas con wizard de 5 pasos + editor visual de bloques de email, Plantillas, Audiencias con estimación/muestra, Historial, Configuración institucional con adjuntos de logo/imagen). Promociones se retiró de la navegación, el resumen y el editor de campañas; se preserva el modelo y las referencias históricas para no alterar datos existentes. | En menú | **Implementado** (ver `docs/MARKETING_MODULE.md`, `docs/MARKETING_EMAIL_PROVIDER.md`, `docs/MARKETING_CAMPAIGNS_OPERATIONS.md`); reemplaza el scaffolding de permisos `CAMPAIGNS_*`/`PROMOTIONS_*` que antes no tenía backend/frontend detrás. `Reports/*` (reportes generales) **ya no es scaffolding** — ver fila "Reportes" más arriba; no confundir con este módulo, que es de marketing, no de negocio |
| App móvil de personal (`apps/mobile`) | Implementado 2026-07-25 (Expo real: login Bearer, fichaje geolocalizado, historial, incidencias, correcciones, perfil y biometría; fuentes de Turnos/Avisos preservadas pero diferidas) | — (es la app móvil; ver `/admin/attendance` para su contraparte de gestión) | — | **Implementado** para los flujos expuestos, ver §2.3 y `docs/MOBILE_STAFF_APP.md`. Turnos/Avisos, push notifications y build EAS quedan pendientes de alcance/infraestructura. |

---

Actualización 2026-07-28 — ante pagos o cuotas vencidos, el módulo de Pagos
permite preparar y editar un recordatorio cordial para el cliente. El email se
envía sólo al confirmar mediante el SMTP existente; WhatsApp abre un borrador
`wa.me` para revisión y envío manual. La acción valida nuevamente estado,
saldo y alcance de salón, requiere `PAYMENTS_CREATE` y deja auditoría sin
guardar el contenido del mensaje. Ver `PAYMENT_COLLECTION_CONTACT.md`.

Actualización 2026-08-05 — bug real encontrado y corregido: en la ficha de un
evento, la fecha mostrada en "Resumen" (18 de septiembre) no coincidía con la
del input de "Ficha" (19 de septiembre) para el mismo evento. Causa raíz: el
backend normaliza `eventDate`/`estimatedEventDate` (fechas sin hora real, ver
`civilDateInput` en `apps/api/src/utils/argentina-date.ts`) a medianoche UTC,
pero varias pantallas de `apps/web` la formateaban con
`Intl.DateTimeFormat(...).format(new Date(value))` sin fijar `timeZone`, lo
que aplica el huso horario local del navegador y puede correr la fecha un día
hacia atrás. El input de "Ficha" (`inputDate` en
`apps/web/src/features/events/event-operations.tsx`) ya tenía el criterio
correcto (si el valor es una fecha civil, usar el día UTC tal cual, sin
convertir huso horario); ese mismo criterio no estaba aplicado en el resto de
las pantallas. Se creó `apps/web/src/lib/dates.ts#formatCivilDate` (mismo
criterio, reutilizable) y se reemplazaron los formateadores locales
equivalentes en las páginas de detalle/listado de eventos, presupuestos,
contratos (incl. impresión), leads, producción y en la página pública de
armado de lista de invitados (`/invitados/[token]`) y su contraparte admin
(`guest-list-workspace.tsx`). `apps/web/src/app/admin/leads/page.tsx` y
`apps/web/src/components/admin/overdue-payment-contact.tsx` ya evitaban el bug
con otro método (parsean `T12:00:00` hora local, con margen suficiente para
Argentina) y no se tocaron. **Pendiente, no resuelto en esta tarea**:
`apps/web/src/app/admin/calendar/page.tsx` construye `Date` a partir de
`eventDate` de forma similar (`eventDate()`, línea ~207) y podría tener el
mismo problema al ubicar la tarjeta del evento en la celda de día correcta —
no se tocó porque ese archivo mezcla el formateo con cálculos de grilla/semana
más complejos y amerita una revisión propia antes de tocarlo. Si se toca
`eventDate`/cualquier otro campo de fecha-sin-hora nuevo en el frontend, usar
`formatCivilDate` en vez de un formateador ad hoc.

Actualización 2026-08-05 — cascada de cambio de fecha de un evento
(`PATCH /events/:id`, `apps/api/src/modules/crm/events.routes.ts`). Reportado
como un 422 con mensaje poco claro al mover la fecha de un evento. Las dos
causas reales de ese 422 ya existían y son intencionales — bloquear el cambio,
no un bug —, pero el mensaje no era suficientemente accionable: (1) el evento
tiene vajilla del stock del salón asignada (`EventTablewareAllocation`,
`source: 'salon_stock'`) y no hay disponibilidad de algún ítem para el nuevo
día; (2) el evento está `reserved`/`confirmed` y hay otro evento
`reserved`/`confirmed` en el mismo salón con un horario superpuesto ese día
(`assertVenueAvailable`). Ambos mensajes ahora nombran cantidades/ítem y
sugieren la acción a tomar (reducir la cantidad asignada, liberar el otro
evento, elegir otro horario/fecha) en vez de solo describir el síntoma.

Gap real encontrado (no un bug, una omisión): las alertas/recordatorios del
evento (`resourcePlanSnapshot.alerts`, pestaña "Tareas", incluidas las 6 que
`event-alert-defaults.ts` precarga como offsets fijos respecto de `eventDate`
— D-15/D-10/D-7/D-3/D-1/D+2) se guardan como `remindAt` absoluto y **no se
recalculaban** al cambiar sólo la fecha desde la pestaña "Ficha" (esa edición
no toca `resourcePlanSnapshot`, así que `event-alert-calendar-sync.service.ts`
nunca se volvía a ejecutar). Resultado: mover la fecha del evento dejaba las
alertas ancladas a la fecha vieja. Corregido: `PATCH /events/:id` ahora
detecta un cambio real de `eventDate` (día distinto al anterior, sólo si ya
había una fecha previa) y desplaza por la misma cantidad de días todas las
alertas que todavía no se enviaron (`status !== 'sent'`), preservando las ya
entregadas tal cual están. El desplazamiento se aplica tanto si la fecha se
cambia sola como si se cambia junto con el resto del plan operativo en la
misma request. `syncEventAlertCalendarItems` se sigue invocando con el mismo
criterio de antes (cuando el body termina teniendo `resourcePlanSnapshot`,
que ahora incluye este caso), sin cambiar su propia lógica de idempotencia.

Decisión explícita tomada y documentada acá para no repetir la pregunta: los
vencimientos de pago (`Payment.dueDate`, cuotas de
`Event.paymentPlanSnapshot`/`Contract.paymentPlanSnapshot`) **no se mueven
automáticamente** al cambiar la fecha del evento — son un compromiso ya
acordado con el cliente, correrlos solos sería alterar datos financieros sin
que nadie lo decida. El control de saldo a D-15 (`financial-reminders.service.ts`)
ya funcionaba bien porque lee `event.eventDate` en vivo en cada tick, no un
valor congelado. Lo que sí se agregó: `PATCH /events/:id` devuelve ahora un
array opcional `warnings` en la respuesta (`{ event, warnings? }`) cuando el
cambio de fecha deja alguna cuota (`paymentPlanSnapshot`, vía
`planFor`/`isOpenInstallment`/`installmentDueDateKey` de
`financial-reminders.service.ts`, reutilizados sin duplicar lógica) o algún
`Payment` pendiente con vencimiento posterior a la nueva fecha del evento —
para que un operador lo note y decida a mano si renegocia el plan de pagos.
`apps/web/src/app/admin/events/[id]/page.tsx#patchEvent` muestra cada string
de `warnings` como un toast `info` adicional tras el de éxito.

No incluido en esta tarea (fuera del alcance reportado): recalcular
`ProductionPlan`/reglas de producción al cambiar la fecha (ya se recalculan
por evento bajo demanda, no dependen de una fecha congelada); mover
`EventTablewareAllocation.eventDay` ya se hacía antes de esta tarea (línea que
actualiza `eventDay` tras un cambio de fecha exitoso, sin cambios). Si se pide
más automatización sobre el cambio de fecha (ej. reprogramar automáticamente
en vez de sólo avisar), tratarlo como una decisión de negocio nueva a
confirmar, no como una extensión obvia de este cambio.

Actualización 2026-08-05 (bis) — barrido sistémico del bug de huso horario en
fechas civiles, más allá de lo corregido en la actualización anterior (que
sólo tocó `apps/web`). Motivo: el usuario encontró un caso nuevo (el cumpleaños
de un evento cargado como 16/08 en "Ficha" figuraba como 15/08 en el preview
del cronograma) y pidió una revisión exhaustiva, no un parche puntual. Causa
raíz común a todos los casos: `eventDate`/`estimatedEventDate`/`validUntil`/
`dueDate`/`paymentWindowStart`/`paymentWindowEnd`/`Expense.date` son "fechas
civiles" (sin hora real, normalizadas a medianoche UTC por `civilDateInput` —
ver `apps/api/src/utils/argentina-date.ts`). Formatearlas con
`Intl.DateTimeFormat` sin fijar `timeZone: 'UTC'` (ya sea con el huso local
del proceso/navegador por defecto, o fijando explícitamente
`America/Argentina/Buenos_Aires`) corre esa medianoche al día anterior en
cualquier huso horario negativo — Argentina incluida. La actualización previa
(más arriba en esta sección) sólo había cubierto un subconjunto de páginas de
`apps/web`; este barrido encontró y corrigió instancias del mismo bug que
habían quedado fuera, tanto en `apps/api` (nunca tocado) como en partes de
`apps/web` no incluidas la vez anterior:

- **Backend, generadores de PDF/email (nunca corregidos hasta ahora)**:
  `event-operational-document.service.ts` (cronograma/logística/vajilla/"full",
  el caso reportado), `quote-pdf.service.ts`, `contract-pdf.service.ts`,
  `payment-receipt-pdf.service.ts` y `quote-request-notifications.service.ts`
  tenían cada uno su propio helper `date()`/formateador local sin `timeZone`
  (o mezclando fechas civiles con instantes reales — `paidAt`, `approvedAt`,
  "ahora" — bajo el mismo helper). Se separaron en dos helpers por archivo
  donde hacía falta: uno para fecha civil (`timeZone: 'UTC'`) y otro para
  instante real (`timeZone: 'America/Argentina/Buenos_Aires'` explícito, nunca
  el default del proceso). `ticket.service.ts` (email de entradas) y el
  formateador compartido de `apps/web/src/features/digital/types.ts#formatDateTime`
  (más `tickets-admin.tsx`, `scan-hub.tsx`) tenían el caso inverso: instantes
  reales (`startsAt`/`endsAt` de `TicketPublication`, con hora propia) sin
  `timeZone` fijado — dependían del huso del proceso/navegador; ahora fijan
  `America/Argentina/Buenos_Aires` explícito.
- **Backend, módulo de Reportes** (`apps/api/src/modules/reporting/reports.service.ts`
  + `apps/web/src/features/reports/report-workspace.tsx`): el tipo de columna
  `format: 'date'` mezclaba fechas civiles (`eventDate` en leads/quotes/events/
  contracts/payment-control, `nextDueDate`/`dueDate`, `Expense.date`) con
  instantes reales (`createdAt`, `sentAt`, `acceptedAt`, `approvedAt`) bajo un
  único formateador fijado en huso Argentina — las columnas de fecha civil
  salían un día corridas en cualquiera de los 6 reportes, tanto en pantalla
  como en la exportación CSV/Excel (`exportValue`, misma función para ambos
  formatos de descarga). Se agregó un segundo tipo de columna `'civilDate'`
  (`timeZone: 'UTC'`) y se reclasificaron las columnas correspondientes;
  `'date'` (Argentina) quedó sólo para instantes reales. La columna `date` del
  reporte de Pagos es ambigua a propósito (según el filtro de atribución
  puede ser `paidAt`/`createdAt` o `dueDate`) — se optó por `'civilDate'`
  porque el caso "siempre mal" (cuotas pendientes) pesaba más que el caso
  "ocasional" (un `paidAt` cerca de medianoche); documentado en el código, no
  resuelto con una solución perfecta. También se corrigió `formatPaymentWindow`
  (mismo archivo), que armaba el texto "Vence el DD/MM/AAAA" del control de
  pagos mensual en huso Argentina sobre `paymentWindowStart`/`paymentWindowEnd`.
- **Frontend, no cubierto por la corrección anterior**: `apps/web/src/app/admin/calendar/page.tsx#eventDate()`
  — el más significativo de este grupo: construía `new Date(event.eventDate)`
  a secas y lo comparaba con `sameDay()`/getters locales (`getFullYear/getMonth/getDate`)
  para ubicar la tarjeta del evento en la celda del día correcto del calendario
  — exactamente el riesgo que la actualización anterior había dejado marcado
  como "pendiente, no resuelto" en ese mismo archivo. Un evento del día 16
  podía aparecer visualmente en la celda del 15. Corregido reconstruyendo la
  fecha a partir de los componentes Y-M-D del string (sin conversión de huso)
  con el constructor local `new Date(y, m-1, d)`, coherente con el resto de
  esta página (que ya opera en getters/constructores locales de forma
  consistente). También: `production-list.tsx`, `production-consolidated.tsx`,
  `expenses-workspace.tsx`, `profitability-workspace.tsx`, listado y detalle
  de `admin/customers` (`eventDate` del próximo evento del cliente, mezclado
  con `createdAt` — se resolvió reutilizando `formatCivilDate`, que detecta
  fecha civil vs. instante real mirando la forma del valor en vez de exigir
  que el llamador lo sepa de antemano) e `invitation-list-workspace.tsx`
  (`DigitalInvitation.eventDate`, que a diferencia de `Event.eventDate` sí es
  un instante real con hora propia de Argentina — `civilDateTimeInput`, no
  `civilDateInput` —, así que el fix ahí fue fijar
  `America/Argentina/Buenos_Aires` explícito, no `'UTC'`).
- **Verificado sin cambios** (ya usaban el patrón seguro): `event-operations.tsx#inputDate`
  (implementación de referencia), `production-detail.tsx`, páginas de detalle/
  listado de eventos/contratos/presupuestos/leads (de la corrección anterior),
  `dashboard-workspace.tsx`/`dashboard-charts.tsx` (usan el truco de mediodía
  con offset explícito `-03:00`), `overdue-payment-contact.tsx` y
  `leads/page.tsx` (truco de mediodía local), `financial-reminders.service.ts#humanDate`
  y `payment-collection.service.ts` (reconstruyen la fecha a mediodía UTC antes
  de formatear).

**Regla general para evitar que este bug reaparezca**: cualquier campo que
provenga de `civilDateInput`/`civilDateSchema` en el backend (fecha sin hora
real: `eventDate`, `estimatedEventDate`, `validUntil`, `birthDate`,
`dueDate`/`paymentWindowStart`/`paymentWindowEnd` de cuotas, `Expense.date`)
debe formatearse **siempre** con `timeZone: 'UTC'` explícito (nunca el default
del proceso/navegador, nunca `America/Argentina/Buenos_Aires`) — en el
frontend, preferir `formatCivilDate` (`apps/web/src/lib/dates.ts`), que ya
detecta el caso automáticamente por la forma del valor. Cualquier campo que
sea un instante real con hora propia (`createdAt`, `paidAt`, `sentAt`,
`approvedAt`, `startsAt`/`endsAt` de entradas, `DigitalInvitation.eventDate`)
debe fijar `timeZone: 'America/Argentina/Buenos_Aires'` explícito — nunca
depender del huso del proceso que lo generó (el servidor puede correr en
cualquier huso) ni del navegador de quien lo mira (staff viajando, etc.).
Typecheck y suite completa de `@mym/api` (298 tests / 54 archivos) y
`@mym/web` verificados sin regresiones tras todos los cambios.

Actualización 2026-08-05 (tris) — bug real encontrado y corregido en el
reporte `payment-control` ("Control de pagos mensual", `/admin/reports/payment-control`):
el usuario reportó ver un único registro y no tener claro si era correcto.
Causa raíz: `paymentControlReport` (`apps/api/src/modules/reporting/reports.service.ts`)
agregaba sobre la colección `Payment` filtrando `status: 'pending'` — pero en
esta app las cuotas de un contrato (`Contract`/`Event.paymentPlanSnapshot`,
armadas a mano en `EventCommercialEditor`) **nunca se materializan como
`Payment`** mientras están pendientes: el único flujo real de cobro
(`POST /events/:id/payments`, `events.routes.ts`) crea el `Payment` ya con
`status: 'paid'` en el momento del cobro, y no existe ningún botón del
frontend que llame a los endpoints que sí aceptan `status: 'pending'`
(`POST /payments`, `POST /contracts/:id/payments`) — confirmado revisando
`apps/web/src` completo. El único registro que veía el usuario era casi con
certeza un dato cargado manualmente vía API, no representativo del uso real.
Corregido: `paymentControlReport` ahora lee directamente
`Contract.paymentPlanSnapshot`/`Event.paymentPlanSnapshot` (contratos
`status: 'approved'`, mismo criterio que `financial-reminders.service.ts` y
`client-payment-reminders.service.ts`), reutilizando los helpers ya
exportados de `financial-reminders.service.ts` (`planFor`, `isOpenInstallment`,
`installmentDueDateKey`, `remainingInstallmentAmount`) en vez de duplicar la
noción de "cuota abierta". Test nuevo dedicado:
`apps/api/tests/reporting-payment-control.service.test.ts` (3 casos: cuota
dentro del período, cuota fuera del período, cuota ya saldada/cancelada).

**Hallazgo relacionado, no resuelto en esta tarea** (mismo root cause, fuera
del pedido puntual del usuario): el reporte `contracts` (columnas `overdueAmount`/
`installments`/`nextDueDate`, `reports.service.ts` función `contractsReport`)
y el dashboard financiero (`dashboard.service.ts`, tarjeta de "vencido" y
listado de pagos atrasados) también agregan sobre `Payment.status:'pending'`
por el mismo motivo — probablemente subreportan por la misma causa. No se
tocaron porque no fueron parte de lo reportado; si se pide revisar el
dashboard o el reporte de Contratos, aplicar el mismo criterio (leer
`paymentPlanSnapshot` vía los helpers de `financial-reminders.service.ts`) en
vez de agregar sobre `Payment`.

## 9. Integraciones — estado real

| Integración | Librería/mecanismo | Estado |
|---|---|---|
| Mercado Pago (entradas digitales) | `fetch` directo contra `https://api.mercadopago.com` (sin SDK oficial) — creación de preferencias, consulta de pago, cancelación, reembolsos con idempotencia, validación de firma de webhook (HMAC-SHA256, `timingSafeEqual`) | **Real y completa.** Existe un `MockTicketPaymentProvider` explícito (tipado como `'mock'`, no disfrazado) usado cuando `TICKET_PAYMENT_PROVIDER=mock` o no hay credenciales — es un modo de desarrollo/demo declarado, no un stub oculto. |
| PDF (presupuestos, contratos, recibos, entradas) | `pdfkit` — genera buffers en memoria, subidos a Cloudinary como recurso `raw` | **Real y completa.** |
| Email | `nodemailer` sobre SMTP | **Real.** Si `EMAIL_NOTIFICATIONS_ENABLED=false` o faltan credenciales SMTP, el envío se omite sin fallar el flujo (apagado por configuración, no simulación). |
| QR | `qrcode` (`toDataURL`) con token firmado (HMAC) embebido | **Real.** |
| Subida de archivos | `multer` + `cloudinary` (subida por stream, borrado, URLs firmadas de descarga con expiración) | **Real.** Sin credenciales configuradas, lanza error — no hay fallback simulado. |
| WhatsApp | Enlaces `wa.me` con mensaje prellenado | **Deliberadamente simple**, sin API oficial de WhatsApp Business (documentado como decisión, no como pendiente crítico). |
| Resend (email masivo de Marketing) | `fetch` directo contra `https://api.resend.com` (sin SDK oficial) — envío por lote (`/emails/batch`), verificación de firma de webhook Svix (HMAC-SHA256, `timingSafeEqual`) implementada a mano | **Real y completa.** Existe un `MockMarketingEmailProvider` explícito (tipado como `'mock'`) usado cuando `MARKETING_EMAIL_PROVIDER=mock` o falta `RESEND_API_KEY` — modo de desarrollo declarado, no un stub oculto. Ver `docs/MARKETING_EMAIL_PROVIDER.md`. |
| Geolocalización (app móvil) | `expo-location`, captura puntual al fichar (nunca en segundo plano) | **Real.** Validada contra geocercas reales por salón (`Salon.attendanceLocationRule`, haversine) — verificado en vivo bloqueando/aceptando marcaciones según distancia. |
| Biometría (app móvil) | `expo-local-authentication` (Face ID/huella) | **Real.** Nunca se envía ni se guarda nada biométrico. Dos mecanismos: (1) desbloqueo de una sesión ya abierta (protege el acceso local al token ya guardado, sin cambios); (2) **agregado 2026-08-03**: "Ingresar con huella" tras un logout explícito — requiere cachear la contraseña cifrada solo en ese dispositivo (gateada por huella/Face ID), decisión explícita del usuario tras evaluar alternativas. Ver `docs/MOBILE_AUTHENTICATION.md` §5. |
| Push notifications (app móvil) | N/A | **No implementado (push remoto).** No se registra ni persiste un token push hasta que exista el envío real. La bandeja in-app sí es real (reutiliza `/api/notifications`). **Distinto** de la notificación local agregada 2026-08-04 (`expo-notifications`, sin token/servidor) que mantiene visible "Jornada en curso" en la barra de estado de Android mientras haya un `WorkSession` activo — ver `docs/MOBILE_STAFF_APP.md` §4.7. |

No se encontraron comentarios `TODO`/`FIXME`/`HACK` en `apps/api/src`, ni `console.log` de simulación fuera de las rutas de mock ya señaladas.

---

## 10. Contradicciones detectadas y decisiones tomadas

| # | Contradicción | Evidencia | Decisión |
|---|---|---|---|
| 1 | Roles: docs hablan de 8 roles, código implementa 4 | `docs/PROJECT_CONTEXT.md`, `docs/SECURITY_RULES.md` vs. `packages/shared/src/constants/roles.ts` | Código es la fuente de verdad (§7). Los 4 roles adicionales son pendientes/aspiracionales, no un bug a corregir silenciosamente. |
| 2 | Invitaciones/Entradas: ¿ligadas a `Event` o independientes? | `DIGITAL_INVITATIONS_AND_TICKETS_PLAN.md`/`.md` (ligadas) vs. `INDEPENDENT_DIGITAL_MODULES_CORRECTION.md` (independientes) vs. código actual | Código confirma que la corrección **ya está aplicada** (§6). Los dos primeros docs quedan como historial superado; no se modifican pero no deben usarse como referencia de arquitectura vigente. |
| 3 | `DOMAIN_MODEL_OVERVIEW.md` describe `DigitalInvitation` como "asociada a un Event" | Línea explícita del doc, fechado el más antiguo (23 de junio) | Superado por §6/§10.2. Se marca como desactualizado en el índice de documentación (§11), sin editar el archivo original. |
| 4 | ¿Contratos/eventos implementados o pendientes? | `QUOTES_MODULE.md`/`QUOTE_REQUESTS_MODULE.md` dicen "pendiente"; `EVENTS_MODULE.md`/`CUSTOM_QUOTING_MODULE.md` documentan endpoints reales; código confirma `Contract`, `ContractAddendum`, `POST /events/:id/create-contract` implementados | Se tratan como fases sucesivas del mismo proyecto, no como contradicción real: los docs "pendiente" son más antiguos. Estado real vigente = implementado (ver §8), con las brechas puntuales listadas ahí (sin firma formal, sin bloqueo duro de fecha). |
| 5 | UI declarada como shadcn/ui en `ARCHITECTURE_DECISIONS.md`/`CODING_RULES.md` | Código usa Tailwind + Radix envuelto a mano, sin `components.json` ni CLI de shadcn | Se documenta como decisión no seguida en la práctica. No se reescribe el frontend para "cumplir" el doc; se dejan ambos hechos registrados aquí para que futuras tareas de UI no asuman una base shadcn que no existe. |
| 6 | Rutas de operaciones (`catalog`, `inventory`, `consumption-rules`) existían en backend pero no estaban montadas, y el frontend tenía carpetas vacías para ellas | `apps/api/src/modules/operations/{catalog,inventory,consumption-rules}.routes.ts` no aparecían en `src/routes/index.ts`; `apps/web/src/app/admin/{catalog,inventory,consumption-rules}` seguían vacías | **Parcialmente resuelto 2026-08-05**: `catalog.routes.ts` se montó (`/catalog`), a pedido explícito del usuario, para destrabar el selector de "Producto" de las reglas de producción (antes no había ninguna forma de cargar un producto nuevo sin un script de desarrollo). Nueva pantalla en `/admin/production/catalog` (no en la carpeta histórica `admin/catalog`, que sigue vacía y sin uso). `inventory.routes.ts`/`consumption-rules.routes.ts` **siguen sin montar** — esa parte de la decisión original (riesgo/pendiente de integración, no código muerto a borrar sin confirmar) sigue vigente. Ver `docs/PRODUCTION_MODULE.md` §7. |
| 7 | Doble adaptador serverless de Vercel | `api/` (raíz) + `vercel.json` (raíz) vs. `apps/api/api/[...path].ts` + `apps/api/vercel.json`, casi idénticos | El adaptador raíz es el que efectivamente usa Vercel (`outputDirectory: apps/web/.next`, `buildCommand` en `vercel.json` raíz coincide con `docs/VERCEL_DEPLOYMENT.md`). El de `apps/api` parece remanente de una configuración de despliegue standalone anterior. No se elimina en esta tarea; se deja anotado como limpieza pendiente a confirmar con el usuario antes de borrar. |
| 8 | Inconsistencia de nombres de paquete en comandos (`--filter api` vs `--filter @mym/api`) | `docs/VERCEL_DEPLOYMENT.md` | Se documenta la forma correcta (con scope) en §3; no se edita el doc original en esta tarea. |
| 9 | Rutas de pruebas manuales en `DIGITAL_INVITATIONS_AND_TICKETS_TESTING.md` referencian navegación "dentro de un evento" | El doc de testing es de la implementación pre-corrección | Se marca como parcialmente desactualizado (§6); la intención de las pruebas (concurrencia, unicidad de QR, idempotencia) sigue siendo válida y debería reescribirse contra las rutas independientes actuales cuando se retome testing de este módulo. |
| 10 | App móvil descrita como "pendiente en su totalidad" | `PROMPT_MAESTRO_CLAUDE_MYM_EVENTOS.md` §5.4, `docs/MYM_EVENTOS_LIFECYCLE_COMPLETION_AUDIT.md` (2026-07-22) | **Superado 2026-07-25**: implementada (ver §2.3, §8, `docs/MOBILE_STAFF_APP.md`). Esos dos documentos quedan como historial de la brecha original; no se editan pero no reflejan el estado actual del móvil. |
| 11 | El toggle `attendanceConfig.canUseMobileApp` de `/admin/users/[id]` existía en la UI antes de esta tarea sin ningún consumidor real en el backend | Auditoría previa al desarrollo de esta tarea; confirmado con un login de prueba que lo ignoraba | Corregido: ahora es una de las dos condiciones obligatorias del login móvil (ver `docs/MOBILE_AUTHENTICATION.md` §2). Documentado como bug real encontrado y corregido en QA manual, no como diseño intencional previo. |
| 12 | Producción, Gastos/Rentabilidad, Payroll y Reportes descritos como inexistentes, "solo permisos" o "scaffolding" en versiones previas de este documento y en `docs/MYM_EVENTOS_LIFECYCLE_COMPLETION_AUDIT.md` (2026-07-22) | Auditoría de código real hecha el 2026-07-29 (3 revisiones independientes de `apps/api/src/modules/{production,expenses,payroll,reporting,event-closure}` y sus pantallas en `apps/web/src/app/admin/{production,expenses,payroll,reports}`), disparada por un pedido de comparar la plataforma contra Excel/Word reales que usa hoy el equipo (`Producción mayo.xlsx`, `Control mensual de Gastos mayo.xlsx`, `Contratos enero 2026.xlsx`, `MARZO Control de pagos VE.xlsx`, `Cronograma XV Camila 29-05.docx`) | Los cuatro módulos están **implementados, montados y en uso** — ver filas actualizadas en §8. La auditoría de ciclo de vida de 2026-07-22 quedó **parcialmente superada** en las secciones que tratan producción/gastos/cierre como pendientes (§10/§11.1 de ese documento); sus hallazgos sobre disponibilidad de salón/fecha, validación de monto de pago y permisos declarados-pero-no-aplicados **siguen vigentes** (no se re-auditaron en esta tarea, no hay evidencia de que se hayan resuelto). Gaps puntuales que sí siguen abiertos tras esta auditoría: sin cálculo de comisión fija del 30% (el sistema calcula margen económico real, no ese porcentaje), sin desglose por evento en el consolidado mensual de producción, sin vista agrupada por proveedor en gastos, sin vista mensual de "control de pagos" agregada por cliente/salón. El checklist de mantelería/limpieza/equipamiento menor como stock controlado (recomendación 6 del gap analysis) **se cerró el 2026-07-29**: `SalonStockItem.category` ahora admite `LINENS`/`CLEANING`/`MINOR_EQUIPMENT` además de `PLATES`/`GLASSWARE`/`DRINKWARE`/`CUTLERY`/`MISCELLANEOUS` (`apps/api/src/modules/salons/salonStockItem.model.ts`), con el mismo CRUD, reserva por fecha de evento (`EventTablewareAllocation`, vía `GET/PUT /events/:id/tableware`) y UI (`/admin/salons/[id]` pestaña "Stock"). Las cantidades de stock se administran manualmente desde esa pestaña; no existen datos estáticos ni scripts de precarga. La sugerencia automática "por invitado" y "completar faltantes" del workspace de evento sigue acotada a vajilla de mesa (`PLATES`/`GLASSWARE`/`DRINKWARE`/`CUTLERY`) — mantelería/limpieza/equipamiento menor se asignan a mano porque no escalan 1:1 por invitado. |

---

## 11. Documentación complementaria (`docs/*.md`)

Estos archivos existentes se conservan como documentación granular por módulo. Este documento (`MYM_EVENTOS_PROJECT_CONTEXT.md`) es el punto de entrada; para el detalle de campos/endpoints de un módulo específico, consultar el archivo correspondiente, teniendo en cuenta su vigencia:

| Archivo | Contenido | Vigencia |
|---|---|---|
| `PROJECT_CONTEXT.md` | Brief de producto/negocio original | Vigente como visión de negocio; roles listados están desactualizados (§10.1) |
| `ARCHITECTURE_DECISIONS.md` | Decisiones de stack/arquitectura | Vigente en general; la referencia a shadcn/ui no se cumplió en la práctica (§10.5) |
| `DOMAIN_MODEL_OVERVIEW.md` | Modelo de dominio conceptual (el más antiguo) | **Parcialmente superado** — ver §10.3 |
| `SECURITY_RULES.md` | Reglas de seguridad normativas | Vigente; roles listados desactualizados (§10.1) |
| `API_FOUNDATION.md` | Snapshot de la base del backend (auth/users/salons/settings) | Describe una capa base ya ampliada por los módulos de negocio posteriores; útil para convenciones (códigos de error en inglés, mensajes en español) |
| `CODING_RULES.md` | Convenciones de código y UI | Vigente y normativo — aplicar siempre |
| `CUSTOM_QUOTING_MODULE.md` | Presupuestos por catálogo (modos PACKAGE/CUSTOM/HYBRID) | Vigente, implementado |
| `OPERATIONS_CATALOG_MODULE.md` | Catálogo, proveedores, inventario, reglas de consumo | Backend descrito está construido pero **no montado en rutas** (§10.6) |
| `QUICK_QUOTE_FIX.md` | Fix puntual del formulario de cotización rápida | Vigente, cerrado |
| `QUOTES_MODULE.md` | Flujo de presupuestos (versión más simple, anterior a QuoteRequest) | Superado parcialmente por `QUOTE_REQUESTS_MODULE.md` y `EVENTS_MODULE.md` en cuanto a contratos/eventos (§10.4) |
| `QUOTE_REQUESTS_MODULE.md` | Etapa intermedia Lead → QuoteRequest → Quote | Vigente |
| `WEB_FOUNDATION.md` | Snapshot inicial del frontend | Describe un estado de bootstrap muy anterior al frontend actual (mucho más construido); útil solo para historia |
| `VERCEL_DEPLOYMENT.md` | Guía de despliegue en Vercel | Vigente; ver nota de nombres de paquete (§10.8) |
| `EVENTS_MODULE.md` | Módulo de eventos, el más detallado y actual sobre el ciclo comercial | Vigente |
| `DIGITAL_INVITATIONS_AND_TICKETS_PLAN.md` | Plan original (acoplado a Event) | **Superado** (§6, §10.2) |
| `DIGITAL_INVITATIONS_AND_TICKETS.md` | Reporte de esa implementación acoplada | **Superado** (§6, §10.2) |
| `DIGITAL_INVITATIONS_AND_TICKETS_TESTING.md` | Plan de pruebas de esa implementación | **Parcialmente desactualizado** (§10.9) |
| `INDEPENDENT_DIGITAL_MODULES_CORRECTION.md` | Corrección: desacopla ambos módulos de Event | **Vigente y autoritativo** para la arquitectura de invitaciones/entradas |
| `MARKETING_MODULE.md` | Arquitectura del módulo de Marketing y Campañas: modelos, segmentación, editor visual, variables, permisos | Vigente, creado 2026-07-25 |
| `MARKETING_EMAIL_PROVIDER.md` | Proveedor Resend: configuración, verificación de firma Svix, pasos manuales para producción | Vigente, creado 2026-07-25 |
| `MARKETING_CAMPAIGNS_OPERATIONS.md` | Runbook operativo: ciclo de vida de campañas, motor de lotes, cron en Vercel, diagnóstico de errores | Vigente, creado 2026-07-25 |
| `TICKET_AUTOMATION.md` | Runbook de expiración de reservas, reintentos y recordatorios de entradas; cron de GitHub Actions cada 5 minutos | Vigente |
| `PRODUCTION_MODULE.md` | Proceso completo de Producción: generación desde reglas/snapshot, ciclo de vida de ítems, cierre/reapertura del plan, su dependencia con el cierre de evento y los recordatorios automáticos | Vigente, reescrito 2026-08-05 (versión previa era un resumen de una línea) |
| `FINANCIAL_REMINDERS.md` | Política y operación de los avisos internos por cuotas/pagos pendientes, saldo D-15, cron y secretos | Vigente |
| `PAYMENT_COLLECTION_CONTACT.md` | Contacto manual, editable y auditado con clientes por obligaciones vencidas; comportamiento de email y borrador de WhatsApp | Vigente |
| `MOBILE_STAFF_APP.md` | App móvil de personal: arquitectura, pantallas, flujo de fichaje, decisiones/simplificaciones explícitas | Vigente, creado 2026-07-25 |
| `ATTENDANCE_ARCHITECTURE.md` | Modelos de asistencia, geocercas, reloj cliente/servidor, máquina de estados, idempotencia sin transacciones Mongo | Vigente, creado 2026-07-25 |
| `ATTENDANCE_BACKOFFICE.md` | Gestión de asistencia desde `/admin/attendance` y `/admin/salons`/`/admin/users`, qué no se construyó | Vigente, creado 2026-07-25 |
| `MOBILE_AUTHENTICATION.md` | Auth Bearer móvil, gate de doble condición, dispositivos, biometría, recuperación de contraseña | Vigente, creado 2026-07-25 |
| `MOBILE_BUILDS.md` | Config de `app.json`, variables de entorno, estado de build EAS/push (pendientes) | Vigente, creado 2026-07-25 |
| `MOBILE_QA.md` | Cobertura de tests (backend + mobile), QA manual E2E real ejecutado, bug encontrado y corregido, recomendaciones | Vigente, creado 2026-07-25 |
| `MYM_EVENTOS_ADMINISTRATIVE_GAP_ANALYSIS.html` | Informe (HTML, no markdown) que cruza los 5 documentos Excel/Word reales que usa el equipo (cronograma, producción, control de gastos, contratos, control de pagos) contra el código real de Producción/Gastos/Payroll/Reportes, con cita de archivo/línea por hallazgo | Vigente, creado 2026-07-29 |

Archivos creados/actualizados en esta tarea (además de las anteriores ya registradas): `MYM_EVENTOS_PROJECT_CONTEXT.md` (esta actualización, 2026-07-29) y `MYM_EVENTOS_ADMINISTRATIVE_GAP_ANALYSIS.html` (nuevo, 2026-07-29).

---

## 11.1 Auditoría del circuito operativo completo

Existe una auditoría mucho más profunda, entidad por entidad, del ciclo Lead → Presupuesto → Contrato → Pago → Evento → Producción → Cierre → Reportes en `docs/MYM_EVENTOS_LIFECYCLE_COMPLETION_AUDIT.md` (2026-07-22). Ese documento incluye: matriz de brechas críticas (con severidad), modelo de dominio propuesto para producción/gastos/cierre, máquinas de estado completas, arquitectura de calendario automático, y un plan de implementación en 14 fases.

**Actualización 2026-07-29 (ver §10.12):** las secciones de ese documento sobre **producción, gastos y cierre de eventos ya no describen el estado real** — las tres áreas se implementaron después de esa fecha (ver §8: filas Producción, Gastos/Rentabilidad, Liquidaciones y el cierre en 3 niveles de la fila Eventos). Consultar en cambio `docs/MYM_EVENTOS_ADMINISTRATIVE_GAP_ANALYSIS.html` para el estado real de esas tres áreas contrastado contra los Excel/Word que usa el equipo. Lo que **sí sigue vigente y sin resolver** de esa auditoría (no re-verificado en esta tarea, tratar como probablemente todavía cierto): disponibilidad de salón/fecha, validación de montos de pago contra el saldo del contrato, permisos declarados-pero-no-aplicados (`EVENTS_CANCEL`, `EVENTS_DELETE`, `QUOTES_DELETE`, `PAYMENTS_CANCEL`), y el resto de la arquitectura de calendario automático más allá de lo ya cubierto por alertas de evento y recordatorios financieros (ver fila "Calendario general" en §8).

## 12. Riesgos técnicos prioritarios (detectados, no resueltos en esta tarea)

En orden de relevancia:

1. **Rate limiting en memoria** (`publicRateLimit.ts`) no es apto para múltiples instancias — auto-documentado en el código. Si el despliegue en Vercel escala a más de una instancia concurrente para rutas públicas, el rate limit deja de ser confiable. Requiere Redis o gateway antes de tráfico público serio.
2. **Módulos de operaciones inconexos**: ~~catálogo, inventario y reglas de consumo tienen backend completo pero desconectado~~ **catálogo se montó 2026-08-05** (`/catalog`, con pantalla en `/admin/production/catalog` — ver §10.6). Inventario y reglas de consumo siguen con backend completo pero desconectado (rutas no montadas) y frontend con carpetas vacías. Antes de continuar cualquier trabajo en inventario, confirmar con el usuario si se retoma esa integración o si el código debe eliminarse por estar abandonado.
3. ~~App móvil inexistente~~ **Actualizado 2026-07-25: implementada** (ver §2.3, §8). **Migrada a Expo SDK 57 el 2026-07-26** (desde ~50.0.8) para arreglar el crash de Expo Go en emuladores/dispositivos Android 15+ (`DETECT_SCREEN_CAPTURE`, ver `docs/MOBILE_BUILDS.md`). ~~Riesgo puntual: sin rate limiting en `/api/mobile/auth/login`~~ **Corregido 2026-08-03**: esa premisa era parcialmente incorrecta — `/api/mobile/auth/login` ya tenía `publicRateLimit` (10 intentos/15min por IP) igual que la recuperación de contraseña; lo que realmente faltaba era el bloqueo de cuenta tras fallos repetidos (`User.lockedUntil` se leía pero nunca se seteaba) — corregido en ambos logins (mobile y web), ver §14.3. Riesgos remanentes: sin build EAS ni credenciales de firma; sin push notifications reales (no se registran tokens mientras no exista envío); sin tests de render de pantallas (solo lib/ tiene cobertura automatizada) — ver `docs/MOBILE_QA.md` §5 para el detalle priorizado. Fast-follows abiertos por la migración de SDK: (a) React Navigation quedó deliberadamente en v6 (no forzado por SDK 57, pero v6 ya no recibe soporte activo — evaluar el salto a v7 como tarea separada); (b) el proyecto ahora usa el preset `jest-expo/node` para tests (antes se evitaba por un bug de pnpm+Flow-stripping que resultó estar resuelto en `jest-expo@57` — ver comentario en `apps/mobile/jest.config.js`), lo que reabre la posibilidad de sumar tests de render con `@testing-library/react-native` (dependencia ya presente pero sin uso real todavía).
4. **Doble configuración de Vercel** (`apps/api/vercel.json` + `apps/api/api/[...path].ts` vs. la raíz) — riesgo de confusión en despliegues futuros; confirmar con el usuario antes de eliminar los archivos duplicados.
5. **Auditoría sin UI de consulta**: se registra `AuditLog` pero no hay pantalla para revisarlo — limita la trazabilidad operativa real pese a que el dato existe.
6. ~~Personal (Staff) sin entrada de navegación~~ **Corregido 2026-07-25**: ahora tiene entrada en el submenú "Configuración" (junto con la nueva sección "Asistencia").
7. **Mercado Pago solo integrado en Entradas Digitales**, no en Pagos de eventos/contratos (que siguen siendo manuales) — coherente con el alcance actual pero relevante si se pide "cobro online" para el flujo comercial principal.
8. ~~Cron de Marketing dependía de un plan pago de Vercel~~ **Resuelto 2026-07-25, 100% gratuito**: `vercel.json` programa el cron de Vercel una vez al día (`0 6 * * *`, compatible con el plan Hobby gratuito) solo como red de seguridad; la cadencia real (cada 10 minutos) corre por `.github/workflows/marketing-cron.yml` (GitHub Actions, gratis en repos públicos y privados dentro de la cuota de minutos incluida). Requiere cargar los secrets `MARKETING_APP_BASE_URL` y `MARKETING_CRON_SECRET` en GitHub (Settings → Secrets and variables → Actions) — ver `docs/MARKETING_CAMPAIGNS_OPERATIONS.md` §3. Nota: GitHub desactiva automáticamente los workflows programados de un repositorio sin commits en 60 días; hay que reactivarlo manualmente desde la pestaña Actions si eso llega a pasar.
9. ~~Expiración de reservas de entradas dependiente del tráfico web~~ **Resuelto 2026-07-28**: `.github/workflows/ticket-automation-cron.yml` llama `POST /api/tickets/process` cada 5 minutos para vencer órdenes pendientes y liberar cupos. Es el único scheduler de Tickets y requiere los secrets de GitHub `TICKET_AUTOMATION_APP_BASE_URL` y `TICKET_AUTOMATION_CRON_SECRET` — ver `docs/TICKET_AUTOMATION.md`.
10. ~~Recordatorios financieros dependientes de revisión manual~~ **Resuelto 2026-07-28**: `.github/workflows/financial-reminders-cron.yml` llama `POST /api/internal/calendar-tick` cada 10 minutos, con fallback diario de Vercel. La entrega es interna (notificación + email según preferencias), idempotente por `automationKey`; requiere `FINANCIAL_REMINDERS_APP_BASE_URL` y `CRON_SECRET` en GitHub Actions — ver `docs/FINANCIAL_REMINDERS.md`.
11. **`User.attendanceConfig.allowedGeoLocations` (geocerca por usuario) queda dormant**: la fuente de verdad de geocercas pasó a ser `Salon.attendanceLocationRule` (por salón). El campo per-usuario no se borró (no se elimina código sin confirmar) pero no lo consume ningún flujo — ver `docs/ATTENDANCE_ARCHITECTURE.md` §3.
12. ~~Exportación de registros de asistencia y vista agregada para liquidaciones: no implementadas~~ **Actualizado 2026-07-29**: la vista agregada para liquidaciones **ya existe** (`/admin/payroll`, módulo `payroll` real — ver §8, §10.12); no se verificó en esta tarea si la exportación de registros de asistencia en sí (más allá de la liquidación calculada) está implementada — tratar como pendiente de confirmar, no como resuelto.

---

## 13. Protocolo de trabajo (resumen operativo)

Antes de implementar cualquier tarea:

1. Leer `CLAUDE.md` y este documento.
2. Identificar el módulo afectado y su estado real según §8 (no asumir completitud por lo que diga un doc antiguo).
3. Inspeccionar modelos/rutas/servicios/componentes/tests del módulo puntual — no releer todo el repositorio de cero.
4. Diseñar el cambio más pequeño que resuelva el problema completo, coherente en backend y frontend (y móvil si el flujo lo requiere, considerando que móvil hoy no existe).
5. Validar permisos, alcance por salón e idempotencia antes de dar por terminada la tarea.
6. Ejecutar `typecheck`/`lint`/`test` del workspace afectado como mínimo.
7. Si el cambio afecta una regla de negocio, arquitectura, integración o comando, actualizar este documento y/o `CLAUDE.md` en el mismo cambio.
8. Si se detecta una nueva contradicción entre documentación y código, agregarla a §10 con la decisión tomada — nunca resolverla en silencio.

---

## 14. Motor de automatizaciones extendido (2026-08-03)

Ampliación grande sobre el único motor de recordatorios que existía hasta esta tarea (`financial-reminders.service.ts`, ver §12.10). Origen: informe `docs/AUTOMATIZACIONES_INFORME.html` con 24 propuestas — se implementaron 22, se excluyó 1 por pedido explícito del usuario y se descopeó 1 por depender de un módulo dormant que este mismo documento ya marca como pendiente de decisión (§10.6, §12.2).

### 14.1 Arquitectura: motor genérico aditivo

`apps/api/src/modules/crm/reminder-engine.ts` generaliza el patrón lock/lease/entrega de `financial-reminders.service.ts` (`claimNextDueReminder`/`deliverFinancialReminder`/`stillRequiresReminder`/`markReminderFailure`) en funciones parametrizadas — **sin modificar el comportamiento de ese archivo** (solo se le agregó `export` a un puñado de helpers puros ya existentes: `planFor`, `isOpenInstallment`, `installmentDueDateKey`, `remainingInstallmentAmount`, para que los dominios nuevos los reutilicen sin duplicar lógica de vencimientos). Cada dominio nuevo:

1. Escribe su propia función "sync" que arma/actualiza `CalendarItem` con un `automationKey` propio y un discriminador `metadata.<dominio>: true` (mismo criterio que `metadata.financialReminder: true`).
2. Define `stillApplies`/`resolveRecipients`/`buildContent` y llama a `runGenericReminderTick(now, sync, options)`.
3. El destinatario puede ser interno (`{ kind: 'internal', userIds }`, crea `Notification` + email a usuarios) o externo (`{ kind: 'external', to }`, envía directo por `sendEmail` a un email de cliente, sin `Notification` ni gate de preferencias — son destinatarios sin cuenta de `User`).

`apps/api/src/modules/crm/calendar-tick.routes.ts` pasó de invocar un único tick a recorrer un array `domainTicks` (cada uno con su propio try/catch, uno que falle no bloquea a los demás) en el mismo endpoint `/api/internal/calendar-tick` — **mismo secreto (`CRON_SECRET`), mismo cron de GitHub Actions cada 10 minutos, mismo fallback diario de Vercel**, sin crear infraestructura nueva. La respuesta de `/api/internal/calendar-tick` cambió de forma (antes un objeto plano por ronda, ahora un objeto `{ financial, eventAlert, dailyDigest, ... }` por ronda) — sin consumidores conocidos más allá del propio workflow de GitHub Actions, que no parsea el body.

`apps/api/src/modules/email/email-template.util.ts` extrae `escapeHtml`/`resolveEmailLogoPath`/`logoEmailAttachments` (antes duplicados dentro de `quote-request-notifications.service.ts`, que ahora los importa sin cambiar su HTML) y agrega `renderBrandedEmail()`, una plantilla de tarjeta institucional genérica (header con logo, filas label/valor, botón CTA opcional) reutilizada por las automatizaciones nuevas que envían email a clientes.

### 14.2 Automatizaciones nuevas (todas activas vía el mismo cron de 10 minutos salvo que se indique otra cosa)

| # | Automatización | Archivo | Destinatario | Nota |
|---|---|---|---|---|
| P1 | Alertas de evento por defecto (D-15 revisar invitados, D-10 coordinar reunión, D-7 cronograma, D-3 confirmar invitados, D-1 montaje, D+2 iniciar cierre) | `event-alert-defaults.ts`, enganchado en `events.routes.ts` (creación manual de evento) | — (precarga el plan de tareas) | Reglas hardcodeadas en TS (igual criterio que `paymentRules`), no un modelo Mongo configurable. Solo aplica si el request no mandó su propio `resourcePlanSnapshot` y ya hay `eventDate`. Eventos creados por conversión de presupuesto (`quote-to-event.service.ts`) no pasan por este hook — mismo gap que ya existía para el sync de alertas en general. |
| P2 | Disparo real de las alertas de evento en su `remindAt` | `event-alert-reminders.service.ts` | Quien creó la alerta (`createdBy`) | `event-alert-calendar-sync.service.ts` ahora también setea `automationKey` y evita resetear `notification.status` si ya estaba `sent` para el mismo `remindAt` (antes de esta tarea, un guardado posterior del plan podía reprogramar una alerta ya entregada). |
| P3 | Resumen ejecutivo diario | `daily-digest.service.ts` | ADMIN/MANAGER (global) + cada SALON_MANAGER (solo sus salones) | No usa el motor genérico (es un agregado, no un recordatorio por obligación). Se dispara la primera vez que el tick corre después de las 08:00 hora Argentina; idempotente por `Notification.automationKey = daily_digest:{userId}:{fecha}`. |
| P5/P7 | Recordatorios de pago al cliente (D-5/D-1/D0 de cuotas + aviso de saldo a 15 días) | `client-payment-reminders.service.ts` | Email del cliente | Nuevo campo `Contract.clientReminderOptIn` (default `true`); reusa `planFor`/`isOpenInstallment` de `financial-reminders.service.ts`. Nunca escala/insiste tras vencido — para eso sigue estando el "Contacto de cobro" manual. |
| P6 | Checkbox "reintentar automáticamente si sigue sin pagarse" en Contacto de Cobro | `payment-collection.service.ts#schedulePaymentCollectionFollowUp`, `collection-followup-reminders.service.ts` | El operador que lo tildó | `POST /payment-collections/{send-email,open-whatsapp}` ahora acepta `scheduleFollowUp: boolean`. Reprograma (no apila) si se tilda de nuevo para la misma obligación. **Dónde encontrarlo:** botón "Contactar" sobre un pago/cuota vencida — visible en `/admin/payments` (Ingresos, listado general) y en la pestaña de pagos del detalle de un evento (`/admin/events/[id]`) para cuotas vencidas puntuales; el checkbox aparece dentro del modal "Contactar por pago vencido" (`overdue-payment-contact.tsx`), antes de las secciones de Email/WhatsApp. |
| P8 | Reseña post-evento | `post-event-review.service.ts` | Email del cliente | D+2 de `eventDate` para eventos `confirmed`, una sola vez (upsert `$setOnInsert`-only). Contiene el link `https://share.google/Zoetd8PLSfJVjAl1C` como botón CTA. **Con test de integración dedicado** (`apps/api/tests/post-event-review.service.test.ts`): verifica el link exacto en el email e idempotencia entre dos ticks. Absorbe también el caso "gracias" de P18 para eventos (un solo email, no dos). |
| P9 | Seguimiento de leads sin atender (48h aviso, 5 días escalamiento) | `lead-followup-reminders.service.ts` | `Lead.assignedUserId` o ADMIN/MANAGER | Se cancela solo si `Lead.status` deja de ser `'new'`. |
| P10 | Expiración automática de presupuestos | `quote-lifecycle-reminders.service.ts#autoExpireQuotes` | — | `updateMany` directo a `status:'expired'` cuando `validUntil < now` y `status:'sent'`; no genera `CalendarItem`. **Aclaración:** `validUntil` no es un plazo fijo del sistema — ya existía antes de esta tarea y se calcula por salón (`Salon.defaultQuoteValidityDays`, editable desde `/admin/salons/[id]`; si el salón no tiene nada configurado, el código usa 7 días de respaldo, aunque en la práctica la mayoría de los salones tiene configurado ~15 días). Esta automatización solo actúa sobre esa fecha ya calculada, no define el plazo. |
| P11/P12 | Aviso al cliente 3 días antes de que venza su presupuesto + seguimiento interno a los 5 días sin respuesta | `quote-lifecycle-reminders.service.ts` | Cliente (email del `Quote`) / vendedor (`Lead.assignedUserId` o `Quote.createdBy`) | Mismo dominio `quoteLifecycle`, discriminado por `metadata.kind`. Los "3 días antes" se calculan sobre el mismo `validUntil` configurable por salón de la fila de arriba. |
| P13 | Aviso de "falta generar producción" (eventos ≤20 días sin `ProductionPlan` vigente) | `production-reminders.service.ts` | Gerente del salón o ADMIN/MANAGER | Reusa la misma noción de "candidato" que `GET /production/candidates`, ventana más angosta. |
| P14 | Sobre-reserva de vajilla/stock de salón | `tableware-overbooking.service.ts` | Gerente del salón o ADMIN/MANAGER | Agrupa `EventTablewareAllocation` (`source:'salon_stock'`) por `(salonId, eventDay, salonStockItemId)` y compara contra `SalonStockItem.currentQuantity` — mismo criterio que el guard de `PUT /events/:id/tableware`. |
| P4 | Cierre de evento pendiente (D+1 y D+7 sin `EventClosure.administrative.status:'closed'`) | `closure-reminders.service.ts`, reusa `event-closure/pending-closures.ts#findEventsWithPendingClosure` (también usado por el digest) | Responsable del evento o ADMIN/MANAGER | — |
| P16 | Saludo de cumpleaños de clientes | `birthday-campaigns.service.ts` | Cliente (motor de Marketing) | Nuevo campo `Customer.birthDate` (opcional, editable desde `/admin/customers/[id]`) + `birthdayGreetingSentYear` para no repetir en el mismo año. Arma una `MarketingAudience` `manual`/`isDynamic:false` del día y una `MarketingCampaign` puntual, reusando `freezeCampaignSnapshots`→`prepareCampaignRecipients`→`processMarketingTick` (mismo camino que el wizard). No requirió sembrar ninguna `MarketingTemplate` — el contenido va directo en la campaña. |
| P20 | Alerta de jornada abierta sin fichaje de salida (+8h, antes +14h — ajustado 2026-08-04) | `open-session-alerts.service.ts` | Gerente del salón o ADMIN/MANAGER | — |
| P21 | Aviso de liquidación pendiente de generar | `payroll-pending-alerts.service.ts` | ADMIN/MANAGER | Detecta `WorkSession` aprobadas (`payrollApprovalStatus:'approved'`) sin `payrollSettlementId` y con más de 35 días — no reconstruye el período exacto por perfil, usa el mismo filtro que ya existía en `payroll.service.ts#settlementSessions` sin el `employeeId`. |
| P22 | Aviso de producción sin cerrar (D+1/D+3) | `production-close-reminders.service.ts` | Gerente del salón o ADMIN/MANAGER | Agregada 2026-08-05. Simétrica de P13 (que avisa *antes* del evento si falta generar el plan): esta avisa *después* si el plan sigue en cualquier estado abierto (`pending`/`in_progress`/`ready`/`blocked`/`checked`) sin llegar a `closed` — ver `docs/PRODUCTION_MODULE.md` §3. |

**No implementado, por decisión explícita:**

- **P19 (recordatorio de turno del día siguiente en la app móvil) — excluido a pedido del usuario.** No se tocó nada de `EventStaffAssignment` ni se agregó ninguna notificación de turnos.
- **P15 (alerta de stock bajo de Inventario) — descopeado.** El módulo de catálogo/inventario sigue sin montar en rutas (§10.6, §12.2); implementar esta automatización primero requeriría resolver esa integración dormant, que sigue pendiente de una decisión explícita del usuario.
- **P18, caso de entradas digitales (thank-you post-compra) — no implementado como email separado.** `ticket.service.ts#markOrderPaid` ya dispara `sendOrderTicketsEmail` con las entradas; agregar un segundo email de "gracias" inmediatamente después duplicaría el contacto por la misma compra. El caso de eventos privados de P18 sí se cubre, fusionado en el email de P8.
- **P17 (reactivación de audiencia inactiva) — implementada y luego retirada a pedido explícito del usuario (2026-08-03).** Se había construido `reengagement-campaign.service.ts` (campaña mensual automática a clientes inactivos); el usuario pidió sacarla al revisar la guía impresa de automatizaciones. Se eliminó el archivo, se sacó del registro de `calendar-tick.routes.ts` y de sus tests. No queda ningún resto activo.

### 14.3 Otras correcciones incluidas en esta tarea

- **Bloqueo de cuenta tras fallos de login**: `User.lockedUntil` se leía y se limpiaba en `auth.routes.ts` y `mobile-auth.routes.ts`, pero nada lo seteaba — `failedLoginAttempts` crecía sin ninguna consecuencia. Nuevo helper `apps/api/src/utils/account-lockout.ts#registerFailedLoginAttempt` bloquea la cuenta 15 minutos tras 5 intentos fallidos, usado por ambos logins (comparten el mismo campo de `User`). El límite por IP (`publicRateLimit`, 10 intentos/15min) ya existía y se mantiene sin cambios — son dos capas independientes, no una sustituye a la otra.
- **Código muerto eliminado**: `apps/api/src/modules/notifications/notification.service.ts` (`createNotifications`) no lo importaba nada del backend real (confirmado) y no tenía idempotencia — el motor genérico nuevo lo vuelve innecesario.
- **Scheduler**: no se agregó ningún cron nuevo — las ~13 automatizaciones basadas en `CalendarItem` corren dentro del mismo `/api/internal/calendar-tick` ya cableado a `.github/workflows/financial-reminders-cron.yml`. La de cumpleaños (Marketing) también corre ahí, pero delega el envío real al propio motor de Marketing (`processMarketingTick`, que a su vez ya tiene su propio cron de 10 minutos — el `calendar-tick` solo dispara la creación/entrega de la campaña puntual, no reemplaza ese motor).
- **Test dedicado**: `apps/api/tests/post-event-review.service.test.ts` (pedido explícito del usuario) verifica que el email de reseña post-evento incluya el link exacto de Google, que sea idempotente entre dos ticks, y que un evento cancelado o futuro no genere nada.
- Suite completa de `@mym/api` verificada sin regresiones tras todos los cambios de esta tarea: 52 archivos / 276 tests, `typecheck` limpio en `@mym/api` y `@mym/web`.

Reglas de interacción (ver también `docs/CODING_RULES.md`):

- No afirmar que una tarea está completa sin evidencia (typecheck/test/verificación manual).
- No crear integraciones simuladas como solución definitiva; si se crea un modo mock, debe estar explícitamente tipado/nombrado como tal (como ya se hace en `TicketPaymentProvider`).
- No acoplar `DigitalInvitation` ni `TicketPublication`/entidades relacionadas a `Event`/`Salon`/`Customer` de nuevo.
- No reescribir áreas grandes sin necesidad concreta.
- Código en inglés, UI y documentación en español (`docs/CODING_RULES.md`).
- Sin Docker/Dockerfile/docker-compose (decisión explícita en `docs/ARCHITECTURE_DECISIONS.md` y `docs/CODING_RULES.md`).
