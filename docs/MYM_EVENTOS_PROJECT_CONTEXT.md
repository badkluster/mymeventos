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
- Estructura **por módulo de dominio** (no por capa técnica): `src/modules/<dominio>/{*.model.ts, *.routes.ts, *.service.ts}`. Módulos reales: `auth`, `audit`, `crm` (el más grande: leads, quote-requests, customers, quotes, events, calendar-items, contracts, payments, tableware), `email`, `invitations`, `landing`, `notifications`, `operations` (suppliers, catalog, inventory, consumption-rules), `salons`, `settings`, `tickets`, `uploads`, `users`.
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

**No implementado / fuera de alcance de esta iteración** (documentado, no oculto): Turnos y Avisos en navegación móvil (código preservado para una negociación futura), notificaciones push reales (no se registran tokens mientras no exista envío), selector nativo de fecha/hora en "solicitar corrección" (campos de texto guiados), listener de conectividad en segundo plano (se chequea en los puntos de interacción), build EAS/credenciales de tienda, validación de entradas QR (deliberadamente fuera — módulo y permiso separados de Entradas Digitales).

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

`start`, `dev` (nodemon + ts-node), `build` (`tsc`), `lint`/`typecheck` (ambos `tsc --noEmit`), `test` (`vitest run`), `seed`, `seed:digital-tickets`, `seed:mobile-attendance` (usuarios + jornadas demo para la app de personal, idempotente — ver `docs/MOBILE_QA.md`), `clean:digital-tickets-demo`, `seed:salon-stock`, `reset:admin-password`, `update:la-plata-packages`, `migrate:package-template-names`, `migrate:invitation-event-index`, `migrate:remove-ticket-payment-credentials`, `import:promo-infantil-packages`, `import:san-carlos-packages`, `import:la-plata-premium-packages`.

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
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Script `seed` |
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
| Eventos (Event) | Implementado (snapshot operativo completo) | Implementado (incl. calendario 988 líneas) | En menú | **Implementado** (sin bloqueo duro de disponibilidad por fecha) |
| Calendario general (CalendarItem) | Implementado (CRUD propio en `calendar-items.routes.ts`); tipos soportados: `event`, `alert`, `reminder`, `note`, `task`, `payment_window`, `meeting` (este último agregado el 2026-07-25 para agendar reuniones con leads/clientes, sin acoplarse a `Event`/`Lead`/`Customer` — la vinculación es opcional vía `leadId`/`customerId`, igual que en el resto de los tipos); las alertas/recordatorios cargados en la pestaña "Tareas" del detalle de un evento (`resourcePlanSnapshot.alerts`) se sincronizan automáticamente como `CalendarItem` (`type: 'reminder'`, `source: 'event'`, `eventId` seteado) vía `apps/api/src/modules/crm/event-alert-calendar-sync.service.ts` (invocado desde `POST /events` y `PATCH /events/:id`). Desde 2026-07-28, cuotas/pagos pendientes y saldo contractual generan `payment_window` de sistema con locks, reintentos e idempotencia. | Implementado (`/admin/calendar`, filtros por tipo/estado/prioridad/notificación) | En menú | **Implementado**, sincronización automática para alertas de evento y recordatorios financieros; notas, tareas sueltas y reuniones siguen siendo manuales |
| Salones | Implementado | Implementado (incluye gestión de paquetes embebida) | En menú | **Implementado** |
| Paquetes (PackageTemplate/VenuePackageRule) | Implementado | Implementado, pero **embebido en Salón**, no es módulo propio | Sin entrada propia | **Implementado**, sin ruta dedicada |
| Extras (ServiceExtra) | Implementado (modelo + rutas en `operations`) | No se identificó UI dedicada | No | **Parcial** |
| Catálogo de operaciones (CatalogItem, Supplier) | Implementado, pero `catalog.routes.ts` **no está montado** en `routes/index.ts` | Carpeta `admin/catalog` vacía (sin `page.tsx`) | No | **Parcial / inconsistente** (ver §10) |
| Inventario | Modelo + rutas implementadas, **no montadas** | Carpeta `admin/inventory` vacía | No | **Parcial / inconsistente** |
| Reglas de consumo (ConsumptionRule) | Implementado, **no montado** | Carpeta `admin/consumption-rules` vacía | No | **Parcial / inconsistente** |
| Proveedores (Supplier) | Implementado y **sí montado** (`suppliers.routes.ts`) | Implementado (lista + detalle) | En menú | **Implementado** |
| Personal (Staff/Employee) | Implementado dentro de `User` (subrol, salones habilitados, asignación a eventos) | Implementado (CRUD) | **Actualizado 2026-07-25: ya tiene entrada en el submenú "Configuración"** (antes solo accesible por URL directa) | **Implementado** |
| Fichaje/asistencia (Attendance) | **Implementado 2026-07-25**: `WorkSession`/`TimePunch`/`AttendanceIncident`/`AttendanceAdjustmentRequest` (`apps/api/src/modules/attendance/`), geocercas por salón, idempotencia real, offline handling — ver `docs/ATTENDANCE_ARCHITECTURE.md` | Implementado: `/admin/attendance` (activos/historial/incidencias/correcciones/configuración) + pestaña "Asistencia" en `/admin/salons/[id]` (geocerca) | En submenú "Configuración" | **Implementado** (sin exportación de registros ni vista de liquidaciones agregada — ver `docs/ATTENDANCE_BACKOFFICE.md` §5) |
| Liquidaciones (Payroll) | Solo permisos (`PAYROLL_READ/MANAGE`) definidos; `WorkSession` ya deja `workedMinutes`/`payableMinutes`/`attendanceClassification` listos como contrato de integración (ver `docs/ATTENDANCE_ARCHITECTURE.md` §8) | No existe página | No | **Pendiente** (sin cálculo salarial) |
| Pagos (Payment) | Implementado (tipos, métodos incl. Mercado Pago, recibos PDF); desde 2026-07-24 el modelo `Payment` también acepta entradas de solo lectura con `source: 'ticket_order'` (`eventId`/`contractId`/`customerId`/`salonId` ahora opcionales, nuevo `ticketOrderId`) creadas automáticamente por `ticket.service.ts#markOrderPaid` al aprobarse una compra de entradas (webhook o marcado manual), y sincronizadas al estado `refunded`/`refundedAmount` desde `refundTicketOrder`. Las cuotas de `Event.paymentPlanSnapshot` y pagos manuales pendientes con vencimiento alimentan recordatorios financieros internos D-7, D-3, D0, D+1, D+3 y D+7; el saldo del contrato se controla a D-15 del evento. | Implementado; la lista/detalle de Pagos muestra ambos orígenes (badge "Entrada digital"), con filtro `source`; las filas de entradas digitales son de solo lectura (edición/cobro/cancelación/reembolso se rechazan con `PAYMENT_TICKET_ORDER_READONLY`, se gestionan desde la orden en Entradas digitales) | En menú | **Implementado** (pagos manuales de eventos/contratos + pagos automáticos de entradas digitales conviven en la misma colección para trazabilidad contable; Mercado Pago real sigue integrado solo en el módulo de entradas, no hay cobro online iniciado desde Pagos) |
| Landing / sitio público | Implementado como CMS (`LandingSettings` y afines) + página pública real con SEO/JSON-LD y formulario de consulta. **Actualizado 2026-07-29**: el hero admite video de fondo además de imagen (`LandingSettings.heroVideoUrl`, mismo pipeline de subida genérico de `/uploads` que ya soportaba video, sin cambios de backend de uploads); nueva colección/tab `LandingStoryStep` (`GET/POST/PATCH/DELETE /landing/story-steps`) para configurar título/descripción/imagen de los 4 pasos de la sección pública "Cómo trabajamos", con imágenes IA fotorrealistas generadas como default (`apps/web/public/images/story/step-{1..4}.jpg`) hasta que el equipo cargue fotos reales propias — sembradas en la base de testing vía `pnpm --filter @mym/api seed:landing-story-steps` (sube las 4 imágenes a Cloudinary e idempotentemente crea/actualiza los `LandingStoryStep` por título). Un rediseño visual completo del landing (paleta monocromática, tipografía serif itálica, secciones de salones/"cómo trabajamos" rediseñadas) quedó revertido a pedido explícito, conservando solo 4 piezas: el hero (con su tipografía original, más el nuevo soporte de video), la sección "Nuestros salones" (tarjetas con foto de fondo completo), "Cómo trabajamos" (diseño de scroll sticky a 2 columnas, ahora configurable) y una nueva sección de cierre "Tu evento merece un lugar así de memorable" antes del footer | Implementado | En menú (admin) | **Implementado** |
| Invitaciones digitales | Implementado, independiente de `Event` (ver §6) | Implementado (workspace visual, temas, envío) | En menú | **Implementado** |
| Entradas digitales (tickets) | Implementado, independiente de `Event` (ver §6); Mercado Pago real vía `fetch` + proveedor mock explícito; `GET /tickets/publications` oculta por defecto las publicaciones con `status: 'archived'` (excluidas salvo que se filtre explícitamente por `status=archived` o se use `search`). Las reservas vencidas se procesan de forma autónoma cada 5 minutos mediante GitHub Actions → `POST /api/tickets/process`. | Implementado (publicaciones, órdenes, check-in, ajustes de Mercado Pago) | En menú | **Implementado** — operación en `docs/TICKET_AUTOMATION.md` |
| Validación/escaneo QR | Implementado en backend (transición atómica `valid → used`, registro `TicketAccessAttempt`) y en frontend (API nativa `BarcodeDetector` + fallback manual) | Implementado | Dentro de Entradas Digitales | **Implementado** |
| Usuarios / Roles / Permisos | Implementado | Implementado (incl. editor de permisos por usuario) | En menú | **Implementado** (solo 4 roles reales, ver §7) |
| Notificaciones | Implementado (modelo, servicio, rutas) | Implementado (página + campana en header) | En menú | **Implementado** |
| Auditoría (AuditLog) | Implementado y usado desde varias rutas mutantes | **Sin página de visualización** | No | **Parcial** (se registra, no se puede consultar desde la UI) |
| Configuración general | Implementado (`SystemSetting` clave/valor) | Implementado | Submenú "Configuración" | **Implementado** |
| Marketing y Campañas | Implementado desde 2026-07-25: `Promotion`, `MarketingTemplate`, `MarketingAudience`, `MarketingCampaign`, `MarketingRecipient`, `MarketingSendLog`, `MarketingWebhookEvent`, `MarketingSettings` (`apps/api/src/modules/marketing/`); segmentación de leads/clientes, envío por lotes con locks Mongo (primer motor de cron del proyecto, ver §12), proveedor Resend real vía `fetch` + mock explícito y webhooks firmados (Svix). `MarketingUnsubscribe` se conserva solo como historial y ya no interviene en envíos nuevos. | Implementado (Resumen, Campañas con wizard de 5 pasos + editor visual de bloques de email, Plantillas, Audiencias con estimación/muestra, Historial, Configuración institucional con adjuntos de logo/imagen). Promociones se retiró de la navegación, el resumen y el editor de campañas; se preserva el modelo y las referencias históricas para no alterar datos existentes. | En menú | **Implementado** (ver `docs/MARKETING_MODULE.md`, `docs/MARKETING_EMAIL_PROVIDER.md`, `docs/MARKETING_CAMPAIGNS_OPERATIONS.md`); reemplaza el scaffolding de permisos `CAMPAIGNS_*`/`PROMOTIONS_*` que antes no tenía backend/frontend detrás. `Reports/*` (reportes generales) sigue siendo solo scaffolding de permisos, sin páginas — no confundir con este módulo |
| App móvil de personal (`apps/mobile`) | Implementado 2026-07-25 (Expo real: login Bearer, fichaje geolocalizado, historial, incidencias, correcciones, perfil y biometría; fuentes de Turnos/Avisos preservadas pero diferidas) | — (es la app móvil; ver `/admin/attendance` para su contraparte de gestión) | — | **Implementado** para los flujos expuestos, ver §2.3 y `docs/MOBILE_STAFF_APP.md`. Turnos/Avisos, push notifications y build EAS quedan pendientes de alcance/infraestructura. |

---

Actualización 2026-07-28 — ante pagos o cuotas vencidos, el módulo de Pagos
permite preparar y editar un recordatorio cordial para el cliente. El email se
envía sólo al confirmar mediante el SMTP existente; WhatsApp abre un borrador
`wa.me` para revisión y envío manual. La acción valida nuevamente estado,
saldo y alcance de salón, requiere `PAYMENTS_CREATE` y deja auditoría sin
guardar el contenido del mensaje. Ver `PAYMENT_COLLECTION_CONTACT.md`.

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
| Biometría (app móvil) | `expo-local-authentication` (Face ID/huella) | **Real**, pero solo protege el acceso local al token ya guardado — nunca se envía ni almacena nada biométrico. |
| Push notifications (app móvil) | N/A | **No implementado.** No se registra ni persiste un token push hasta que exista el envío real. La bandeja in-app sí es real (reutiliza `/api/notifications`). |

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
| 6 | Rutas de operaciones (`catalog`, `inventory`, `consumption-rules`) existen en backend pero no están montadas, y el frontend tiene carpetas vacías para ellas | `apps/api/src/modules/operations/{catalog,inventory,consumption-rules}.routes.ts` no aparecen en `src/routes/index.ts`; `apps/web/src/app/admin/{catalog,inventory,consumption-rules}` están vacías | Se documenta como **riesgo/pendiente de integración**, no como código muerto a borrar sin confirmar: podría ser trabajo en curso interrumpido. No se monta ni se borra en esta tarea (instrucción explícita de no cambiar funcionalidad). Queda como prioridad técnica (§12). |
| 7 | Doble adaptador serverless de Vercel | `api/` (raíz) + `vercel.json` (raíz) vs. `apps/api/api/[...path].ts` + `apps/api/vercel.json`, casi idénticos | El adaptador raíz es el que efectivamente usa Vercel (`outputDirectory: apps/web/.next`, `buildCommand` en `vercel.json` raíz coincide con `docs/VERCEL_DEPLOYMENT.md`). El de `apps/api` parece remanente de una configuración de despliegue standalone anterior. No se elimina en esta tarea; se deja anotado como limpieza pendiente a confirmar con el usuario antes de borrar. |
| 8 | Inconsistencia de nombres de paquete en comandos (`--filter api` vs `--filter @mym/api`) | `docs/VERCEL_DEPLOYMENT.md` | Se documenta la forma correcta (con scope) en §3; no se edita el doc original en esta tarea. |
| 9 | Rutas de pruebas manuales en `DIGITAL_INVITATIONS_AND_TICKETS_TESTING.md` referencian navegación "dentro de un evento" | El doc de testing es de la implementación pre-corrección | Se marca como parcialmente desactualizado (§6); la intención de las pruebas (concurrencia, unicidad de QR, idempotencia) sigue siendo válida y debería reescribirse contra las rutas independientes actuales cuando se retome testing de este módulo. |
| 10 | App móvil descrita como "pendiente en su totalidad" | `PROMPT_MAESTRO_CLAUDE_MYM_EVENTOS.md` §5.4, `docs/MYM_EVENTOS_LIFECYCLE_COMPLETION_AUDIT.md` (2026-07-22) | **Superado 2026-07-25**: implementada (ver §2.3, §8, `docs/MOBILE_STAFF_APP.md`). Esos dos documentos quedan como historial de la brecha original; no se editan pero no reflejan el estado actual del móvil. |
| 11 | El toggle `attendanceConfig.canUseMobileApp` de `/admin/users/[id]` existía en la UI antes de esta tarea sin ningún consumidor real en el backend | Auditoría previa al desarrollo de esta tarea; confirmado con un login de prueba que lo ignoraba | Corregido: ahora es una de las dos condiciones obligatorias del login móvil (ver `docs/MOBILE_AUTHENTICATION.md` §2). Documentado como bug real encontrado y corregido en QA manual, no como diseño intencional previo. |

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
| `FINANCIAL_REMINDERS.md` | Política y operación de los avisos internos por cuotas/pagos pendientes, saldo D-15, cron y secretos | Vigente |
| `PAYMENT_COLLECTION_CONTACT.md` | Contacto manual, editable y auditado con clientes por obligaciones vencidas; comportamiento de email y borrador de WhatsApp | Vigente |
| `MOBILE_STAFF_APP.md` | App móvil de personal: arquitectura, pantallas, flujo de fichaje, decisiones/simplificaciones explícitas | Vigente, creado 2026-07-25 |
| `ATTENDANCE_ARCHITECTURE.md` | Modelos de asistencia, geocercas, reloj cliente/servidor, máquina de estados, idempotencia sin transacciones Mongo | Vigente, creado 2026-07-25 |
| `ATTENDANCE_BACKOFFICE.md` | Gestión de asistencia desde `/admin/attendance` y `/admin/salons`/`/admin/users`, qué no se construyó | Vigente, creado 2026-07-25 |
| `MOBILE_AUTHENTICATION.md` | Auth Bearer móvil, gate de doble condición, dispositivos, biometría, recuperación de contraseña | Vigente, creado 2026-07-25 |
| `MOBILE_BUILDS.md` | Config de `app.json`, variables de entorno, estado de build EAS/push (pendientes) | Vigente, creado 2026-07-25 |
| `MOBILE_QA.md` | Cobertura de tests (backend + mobile), QA manual E2E real ejecutado, bug encontrado y corregido, recomendaciones | Vigente, creado 2026-07-25 |

No se creó ni eliminó ningún archivo dentro de `docs/` en esta tarea salvo `MYM_EVENTOS_PROJECT_CONTEXT.md`, `TICKET_AUTOMATION.md`, `FINANCIAL_REMINDERS.md`, `PAYMENT_COLLECTION_CONTACT.md` y los 6 archivos nuevos de la app móvil listados arriba.

---

## 11.1 Auditoría del circuito operativo completo

Existe una auditoría mucho más profunda, entidad por entidad, del ciclo Lead → Presupuesto → Contrato → Pago → Evento → Producción → Cierre → Reportes en `docs/MYM_EVENTOS_LIFECYCLE_COMPLETION_AUDIT.md` (2026-07-22). Ese documento incluye: matriz de brechas críticas (con severidad), modelo de dominio propuesto para producción/gastos/cierre, máquinas de estado completas, arquitectura de calendario automático, y un plan de implementación en 14 fases. Consultarlo antes de tocar: disponibilidad de salón/fecha, validación de montos de pago, permisos declarados-pero-no-aplicados (`EVENTS_CANCEL`, `EVENTS_DELETE`, `QUOTES_DELETE`, `PAYMENTS_CANCEL`), calendario/recordatorios, producción de eventos, gastos o cierre de eventos — todas áreas sin resolver aún.

## 12. Riesgos técnicos prioritarios (detectados, no resueltos en esta tarea)

En orden de relevancia:

1. **Rate limiting en memoria** (`publicRateLimit.ts`) no es apto para múltiples instancias — auto-documentado en el código. Si el despliegue en Vercel escala a más de una instancia concurrente para rutas públicas, el rate limit deja de ser confiable. Requiere Redis o gateway antes de tráfico público serio.
2. **Módulos de operaciones inconexos**: catálogo, inventario y reglas de consumo tienen backend completo pero desconectado (rutas no montadas) y frontend con carpetas vacías. Antes de continuar cualquier trabajo en inventario, confirmar con el usuario si se retoma esa integración o si el código debe eliminarse por estar abandonado.
3. ~~App móvil inexistente~~ **Actualizado 2026-07-25: implementada** (ver §2.3, §8). **Migrada a Expo SDK 57 el 2026-07-26** (desde ~50.0.8) para arreglar el crash de Expo Go en emuladores/dispositivos Android 15+ (`DETECT_SCREEN_CAPTURE`, ver `docs/MOBILE_BUILDS.md`). Riesgos remanentes puntuales de la app móvil: sin rate limiting en `/api/mobile/auth/login` (la recuperación de contraseña ya tiene límites por IP y por código); sin build EAS ni credenciales de firma; sin push notifications reales (no se registran tokens mientras no exista envío); sin tests de render de pantallas (solo lib/ tiene cobertura automatizada) — ver `docs/MOBILE_QA.md` §5 para el detalle priorizado. Fast-follows abiertos por la migración de SDK: (a) React Navigation quedó deliberadamente en v6 (no forzado por SDK 57, pero v6 ya no recibe soporte activo — evaluar el salto a v7 como tarea separada); (b) el proyecto ahora usa el preset `jest-expo/node` para tests (antes se evitaba por un bug de pnpm+Flow-stripping que resultó estar resuelto en `jest-expo@57` — ver comentario en `apps/mobile/jest.config.js`), lo que reabre la posibilidad de sumar tests de render con `@testing-library/react-native` (dependencia ya presente pero sin uso real todavía).
4. **Doble configuración de Vercel** (`apps/api/vercel.json` + `apps/api/api/[...path].ts` vs. la raíz) — riesgo de confusión en despliegues futuros; confirmar con el usuario antes de eliminar los archivos duplicados.
5. **Auditoría sin UI de consulta**: se registra `AuditLog` pero no hay pantalla para revisarlo — limita la trazabilidad operativa real pese a que el dato existe.
6. ~~Personal (Staff) sin entrada de navegación~~ **Corregido 2026-07-25**: ahora tiene entrada en el submenú "Configuración" (junto con la nueva sección "Asistencia").
7. **Mercado Pago solo integrado en Entradas Digitales**, no en Pagos de eventos/contratos (que siguen siendo manuales) — coherente con el alcance actual pero relevante si se pide "cobro online" para el flujo comercial principal.
8. ~~Cron de Marketing dependía de un plan pago de Vercel~~ **Resuelto 2026-07-25, 100% gratuito**: `vercel.json` programa el cron de Vercel una vez al día (`0 6 * * *`, compatible con el plan Hobby gratuito) solo como red de seguridad; la cadencia real (cada 10 minutos) corre por `.github/workflows/marketing-cron.yml` (GitHub Actions, gratis en repos públicos y privados dentro de la cuota de minutos incluida). Requiere cargar los secrets `MARKETING_APP_BASE_URL` y `MARKETING_CRON_SECRET` en GitHub (Settings → Secrets and variables → Actions) — ver `docs/MARKETING_CAMPAIGNS_OPERATIONS.md` §3. Nota: GitHub desactiva automáticamente los workflows programados de un repositorio sin commits en 60 días; hay que reactivarlo manualmente desde la pestaña Actions si eso llega a pasar.
9. ~~Expiración de reservas de entradas dependiente del tráfico web~~ **Resuelto 2026-07-28**: `.github/workflows/ticket-automation-cron.yml` llama `POST /api/tickets/process` cada 5 minutos para vencer órdenes pendientes y liberar cupos. Es el único scheduler de Tickets y requiere los secrets de GitHub `TICKET_AUTOMATION_APP_BASE_URL` y `TICKET_AUTOMATION_CRON_SECRET` — ver `docs/TICKET_AUTOMATION.md`.
10. ~~Recordatorios financieros dependientes de revisión manual~~ **Resuelto 2026-07-28**: `.github/workflows/financial-reminders-cron.yml` llama `POST /api/internal/calendar-tick` cada 10 minutos, con fallback diario de Vercel. La entrega es interna (notificación + email según preferencias), idempotente por `automationKey`; requiere `FINANCIAL_REMINDERS_APP_BASE_URL` y `CRON_SECRET` en GitHub Actions — ver `docs/FINANCIAL_REMINDERS.md`.
11. **`User.attendanceConfig.allowedGeoLocations` (geocerca por usuario) queda dormant**: la fuente de verdad de geocercas pasó a ser `Salon.attendanceLocationRule` (por salón). El campo per-usuario no se borró (no se elimina código sin confirmar) pero no lo consume ningún flujo — ver `docs/ATTENDANCE_ARCHITECTURE.md` §3.
12. **Exportación de registros de asistencia y vista agregada para liquidaciones**: no implementadas — ver `docs/ATTENDANCE_BACKOFFICE.md` §5 y `docs/ATTENDANCE_ARCHITECTURE.md` §8.

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

Reglas de interacción (ver también `docs/CODING_RULES.md`):

- No afirmar que una tarea está completa sin evidencia (typecheck/test/verificación manual).
- No crear integraciones simuladas como solución definitiva; si se crea un modo mock, debe estar explícitamente tipado/nombrado como tal (como ya se hace en `TicketPaymentProvider`).
- No acoplar `DigitalInvitation` ni `TicketPublication`/entidades relacionadas a `Event`/`Salon`/`Customer` de nuevo.
- No reescribir áreas grandes sin necesidad concreta.
- Código en inglés, UI y documentación en español (`docs/CODING_RULES.md`).
- Sin Docker/Dockerfile/docker-compose (decisión explícita en `docs/ARCHITECTURE_DECISIONS.md` y `docs/CODING_RULES.md`).
