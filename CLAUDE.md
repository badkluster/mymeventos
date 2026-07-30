# CLAUDE.md — M&M Eventos

Contexto operativo breve para trabajar en este repositorio. El contexto funcional y técnico completo, el estado real detectado por módulo y las contradicciones documentadas viven en:

@docs/MYM_EVENTOS_PROJECT_CONTEXT.md

No vuelvas a auditar todo el proyecto desde cero en cada sesión: usa ese documento como fuente persistente y valida solo el área que vas a modificar. Si una tarea cambia una regla de negocio, arquitectura, integración o comando principal, actualiza ese documento (y este archivo si corresponde) en el mismo cambio.

## Propósito

Plataforma para M&M Eventos: gestión comercial y operativa de una empresa de eventos con salones propios (leads → solicitudes de presupuesto → presupuestos → clientes → contratos → eventos), más dos productos digitales **independientes** del ciclo de eventos privados: invitaciones digitales y venta de entradas con QR/Mercado Pago.

## Arquitectura real

Monorepo pnpm (`pnpm@10.24.0`):

- `apps/api` — Express 4 + Mongoose 8 + TypeScript, organizado por módulo de dominio (`src/modules/<dominio>`). Fuente de verdad de reglas de negocio, permisos y precios.
- `apps/web` — Next.js 16 (App Router) + React 19. Sin `middleware.ts`: la protección de `/admin/*` es solo client-side; el backend es la única barrera de seguridad real.
- `apps/mobile` — Expo (SDK 57) + React Native 0.86 + React Navigation + zustand. Corre con New Architecture obligatoria (sin opt-out desde SDK 55). **App real de personal/asistencia implementada** (login con Bearer token, fichaje con geolocalización y cola offline, historial, incidencias, correcciones, perfil/avatar y biometría). Turnos y Avisos se preservan en código pero no se exponen hasta acordar ese alcance. Ver `docs/MOBILE_STAFF_APP.md`. La validación de entradas QR **no** vive acá (es del módulo de Entradas Digitales, permiso separado).
- `packages/shared` — enums (`Role`, `Permission`, estados), esquemas zod y helpers de permisos, consumidos por `api`, `web` y ahora también por `mobile` (dependencia de workspace agregada al implementar la app de personal).
- `api/` (raíz) — adaptador serverless Vercel que envuelve la app Express (`apps/api/api/[...path].ts` + `apps/api/vercel.json` son un duplicado probablemente obsoleto; no tocar sin confirmar con el usuario).

Despliegue: proyecto único de Vercel (`vercel.json` en la raíz), `apps/web` como build Next.js y el backend como función serverless.

## Comandos reales

```
pnpm dev            # todas las apps en paralelo
pnpm dev:web / dev:api / dev:mobile
pnpm build / pnpm lint / pnpm typecheck / pnpm test   # -r sobre los workspaces (apps/web no tiene script test)

pnpm --filter @mym/api test        # vitest run (requiere Mongo local)
pnpm --filter @mym/api seed        # seed de base de datos
pnpm --filter @mym/api seed:mobile-attendance   # usuarios + jornadas demo para probar la app de personal
pnpm --filter @mym/api reset:admin-password   # solo local, bloqueado en producción
pnpm --filter @mym/web typecheck
pnpm --filter @mym/mobile start / typecheck / test   # Expo dev server / tsc / jest (ver docs/MOBILE_STAFF_APP.md)
pnpm --filter @mym/shared build    # reconstruir antes de que api/web/mobile recojan cambios de tipos/enums
```

Usar siempre el nombre de paquete con scope (`@mym/api`, `@mym/web`, `@mym/mobile`, `@mym/shared`), no `api`/`web` a secas.

## Reglas críticas de dominio

- **Separación obligatoria**: `Event` (evento privado contratado), `DigitalInvitation` (invitaciones) y `TicketPublication` (entradas digitales) son independientes entre sí — ya corregido en el código (ver `docs/INDEPENDENT_DIGITAL_MODULES_CORRECTION.md`). No reintroducir `eventId`/`salonId`/`customerId` obligatorios en invitaciones o entradas.
- **Roles reales**: solo `ADMIN`, `MANAGER`, `SALON_MANAGER`, `STAFF` (`packages/shared/src/constants/roles.ts`). Documentación antigua menciona 8 roles; los 4 adicionales no están implementados — no asumir que existen.
- RBAC y alcance por salón se validan en el backend (`requireAuth`, `requirePermission`, `requireSalonScope`); el frontend nunca es la barrera de seguridad.
- Presupuestos/eventos/contratos usan snapshots congelados del catálogo — no referencias vivas.
- Idempotencia puntual ya implementada en: conversión de presupuesto a evento, `TicketOrder`/`TicketRefund` (idempotencyKey), webhooks de Mercado Pago (dedupe por `provider`+`providerEventId`), preparación de destinatarios y envío por lotes de campañas de Marketing (locks Mongo por `findOneAndUpdate`, mismo criterio que `TicketOrder`). Mantener ese patrón al tocar flujos sensibles.
- Mercado Pago real (vía `fetch`, sin SDK) solo está integrado en **entradas digitales**; los pagos de eventos/contratos siguen siendo manuales. Resend (también vía `fetch`, sin SDK) es el proveedor real de email masivo del módulo de Marketing — ver `docs/MARKETING_EMAIL_PROVIDER.md`.
- **Crons frecuentes, 100% gratuitos**: Marketing (`apps/api/src/modules/marketing/internal.routes.ts`, `GET/POST /api/marketing/process`) y Entradas Digitales (`apps/api/src/modules/tickets/ticket-automation.routes.ts`, `GET/POST /api/tickets/process`) usan endpoints internos protegidos por secreto e idempotentes. La cadencia real la proveen GitHub Actions: `.github/workflows/marketing-cron.yml` cada 10 minutos y `.github/workflows/ticket-automation-cron.yml` cada 5 minutos. `vercel.json` conserva únicamente el disparo diario de Marketing como red de seguridad compatible con Hobby; Tickets no tiene un segundo scheduler. No usar `*/N * * * *` en `vercel.json`: esa granularidad requiere un plan pago. Para otro proceso programado, reutilizar este patrón (endpoint interno + secreto + locks/operaciones idempotentes + GitHub Actions) en vez de introducir una cola, un proceso residente o depender de un plan pago.
- Las alertas/recordatorios cargados en la pestaña "Tareas" del detalle de un Evento (`EventTasksEditor`, `resourcePlanSnapshot.alerts`) se sincronizan automáticamente hacia `CalendarItem` (`type: 'reminder'`, `source: 'event'`, `eventId` seteado) en `apps/api/src/modules/crm/event-alert-calendar-sync.service.ts`, invocado desde `POST /events` y `PATCH /events/:id` en `events.routes.ts`. Es sincronización unidireccional evento → calendario (se re-crea/borra por `metadata.eventAlertId` en cada guardado del plan); editar el ítem directamente en `/admin/calendar` no actualiza el plan del evento. Mantener este patrón si se agregan otros orígenes de recordatorios.
- **Auth móvil = Bearer token, no cookie.** `requireAuth` (`apps/api/src/middlewares/auth.ts`) acepta cookie (web, exige `canAccessBackoffice !== false`, sin cambios) **o** `Authorization: Bearer` (móvil, sin ese filtro). El acceso móvil real se decide en `isMobileEligible()` (`apps/api/src/modules/mobile/mobile-auth.routes.ts`) exigiendo **dos** condiciones a la vez: permiso `Permission.MOBILE_ACCESS` (por rol/override — no depende solo de `STAFF`) **y** `User.attendanceConfig.canUseMobileApp === true` (el toggle de `/admin/users/[id]` → "Asistencia"). Si se toca este flujo, mantener ambas condiciones — quitar cualquiera reabre el bug real que se encontró y corrigió durante el desarrollo (ver `docs/MOBILE_AUTHENTICATION.md`).
- El "perfil laboral" de la app móvil **no** es un modelo nuevo: reutiliza `User.staffProfile`/`User.attendanceConfig` (ya existían). Los turnos se leen de `EventStaffAssignment` (ya existía). No reintroducir un `EmployeeProfile`/`Shift` paralelo — ver `docs/ATTENDANCE_ARCHITECTURE.md`.

## Auditoría del circuito operativo (Lead → Cierre)

`docs/MYM_EVENTOS_LIFECYCLE_COMPLETION_AUDIT.md` documenta, campo por campo, dónde se corta hoy el circuito comercial/contractual/financiero/operativo y el plan de 14 fases para cerrarlo (disponibilidad de salón/fecha inexistente, validación de montos de pago ausente, permisos declarados pero no aplicados en rutas, sin motor de cron, catálogo/inventario montado a medias). Consultarlo antes de tocar cualquiera de esas áreas — pero **no** para producción/gastos/cierre de evento: ese documento las describe como inexistentes ("sin entidad de gastos, sin cierre de evento"), y esa parte quedó superada — los tres módulos (`production`, `expenses`, `event-closure`, más `payroll` y `reporting`) ya están implementados y montados (ver `docs/MYM_EVENTOS_PROJECT_CONTEXT.md` §8 y §10.12, y `docs/MYM_EVENTOS_ADMINISTRATIVE_GAP_ANALYSIS.html` para el detalle). Nota: el calendario sigue siendo mayormente manual, salvo por la sincronización puntual de alertas de evento descrita arriba — ese documento de auditoría (más antiguo) todavía lo describe como "100% manual sin generación automática"; esa frase quedó parcialmente desactualizada por este cambio.

## Módulos independientes (no acoplar)

CRM (leads/presupuestos/clientes/contratos/eventos), Salones (con paquetes embebidos), Operaciones (catálogo/inventario/reglas de consumo — backend existe pero **no está montado en rutas** ni tiene frontend, ver riesgos en el doc detallado; proveedores y `Expense`/`ExpenseCategory` sí están montados, ver módulo Gastos abajo), Producción (`production`: plan de producción por evento con secciones/ítems tipados, generado a partir de reglas configurables por salón/paquete, más un consolidado mensual por ítem — ver `docs/MYM_EVENTOS_PROJECT_CONTEXT.md` §8), Gastos y Rentabilidad (`expenses`: gasto por evento/proveedor/categoría + reporte de rentabilidad económica real ingreso−gasto), Liquidaciones/Payroll (`payroll`: liquidación real a partir de `WorkSession`, genera un `Expense` automático al aprobarse), Reportes (`reporting`: dashboard + reportes agregados exportables — leads/quotes/events/contracts/payments/expenses), Cierre de evento (`event-closure`: cierre en 3 niveles — operativo/financiero/administrativo, cada uno con su checklist), Personal/Staff (implementado, ahora **con entrada en el menú** — ver `docs/ATTENDANCE_BACKOFFICE.md`), App móvil de personal / Asistencia (fichaje con geolocalización y geocercas por salón, incidencias y correcciones; Turnos vía `EventStaffAssignment` y Avisos se preservan pero no se exponen — independiente del resto, ver `docs/MOBILE_STAFF_APP.md` y `docs/ATTENDANCE_ARCHITECTURE.md`), Pagos, Landing pública, Invitaciones digitales, Entradas digitales, Marketing y Campañas (promociones, plantillas de email con editor visual de bloques, audiencias segmentadas de leads/clientes, campañas con envío por lotes vía Resend — independiente de `Event`/`Salon`/`Customer`, opcionalmente vinculable a un salón o promoción; ver `docs/MARKETING_MODULE.md`), Notificaciones, Auditoría (se registra, sin UI de consulta), Usuarios/Roles/Permisos, Configuración.

## Convenciones técnicas

- TypeScript en todo el código; Zod para validación.
- Código (nombres, variables, comentarios) en inglés; UI y documentación en español.
- Sin Docker/Dockerfile/docker-compose.
- No presentar integraciones simuladas como definitivas; si se necesita un modo mock, debe estar explícitamente tipado como tal (patrón existente: `TicketPaymentProvider` y `MarketingEmailProvider`, ambos con variante `'mock'` explícita).
- Convenciones de UI/formularios detalladas en `docs/CODING_RULES.md` (modales para formularios cortos, `AlertDialog` para acciones destructivas, soft delete, etc.).

## Protocolo de trabajo

1. Leer este archivo y `docs/MYM_EVENTOS_PROJECT_CONTEXT.md`.
2. Ubicar el módulo afectado y su estado real (tabla de estado en §8 del doc detallado) antes de asumir que algo existe o falta.
3. Inspeccionar solo el área puntual a modificar (modelos, rutas, servicios, componentes, tests relacionados).
4. Implementar backend + frontend de forma coherente. `apps/mobile` ya es una app real (personal/asistencia) — si la tarea toca fichaje/perfil/turnos/incidencias de personal, es el lugar; para cualquier otra cosa (comercial, marketing, etc.) no asumir que debe tener contraparte móvil salvo que se pida explícitamente.
5. Verificar permisos, alcance por salón e idempotencia.
6. Ejecutar typecheck/lint/test del workspace tocado.
7. Actualizar `docs/MYM_EVENTOS_PROJECT_CONTEXT.md` (y este archivo si aplica) si cambió una regla de negocio, arquitectura, integración o comando.
8. Si aparece una contradicción nueva entre documentación y código, documentarla con su decisión — no resolverla en silencio.
