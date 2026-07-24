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
- `apps/mobile` — Expo/React Native. **Scaffold vacío, sin funcionalidad** (no asumir que algo del fichaje/QR móvil existe).
- `packages/shared` — enums (`Role`, `Permission`, estados), esquemas zod y helpers de permisos, consumidos por `api` y `web` (no por `mobile`).
- `api/` (raíz) — adaptador serverless Vercel que envuelve la app Express (`apps/api/api/[...path].ts` + `apps/api/vercel.json` son un duplicado probablemente obsoleto; no tocar sin confirmar con el usuario).

Despliegue: proyecto único de Vercel (`vercel.json` en la raíz), `apps/web` como build Next.js y el backend como función serverless.

## Comandos reales

```
pnpm dev            # todas las apps en paralelo
pnpm dev:web / dev:api / dev:mobile
pnpm build / pnpm lint / pnpm typecheck / pnpm test   # -r sobre los workspaces (apps/web no tiene script test)

pnpm --filter @mym/api test        # vitest run (requiere Mongo local)
pnpm --filter @mym/api seed        # seed de base de datos
pnpm --filter @mym/api reset:admin-password   # solo local, bloqueado en producción
pnpm --filter @mym/web typecheck
pnpm --filter @mym/shared build    # reconstruir antes de que api/web recojan cambios de tipos/enums
```

Usar siempre el nombre de paquete con scope (`@mym/api`, `@mym/web`, `@mym/mobile`, `@mym/shared`), no `api`/`web` a secas.

## Reglas críticas de dominio

- **Separación obligatoria**: `Event` (evento privado contratado), `DigitalInvitation` (invitaciones) y `TicketPublication` (entradas digitales) son independientes entre sí — ya corregido en el código (ver `docs/INDEPENDENT_DIGITAL_MODULES_CORRECTION.md`). No reintroducir `eventId`/`salonId`/`customerId` obligatorios en invitaciones o entradas.
- **Roles reales**: solo `ADMIN`, `MANAGER`, `SALON_MANAGER`, `STAFF` (`packages/shared/src/constants/roles.ts`). Documentación antigua menciona 8 roles; los 4 adicionales no están implementados — no asumir que existen.
- RBAC y alcance por salón se validan en el backend (`requireAuth`, `requirePermission`, `requireSalonScope`); el frontend nunca es la barrera de seguridad.
- Presupuestos/eventos/contratos usan snapshots congelados del catálogo — no referencias vivas.
- Idempotencia puntual ya implementada en: conversión de presupuesto a evento, `TicketOrder`/`TicketRefund` (idempotencyKey), webhooks de Mercado Pago (dedupe por `provider`+`providerEventId`). Mantener ese patrón al tocar flujos sensibles.
- Mercado Pago real (vía `fetch`, sin SDK) solo está integrado en **entradas digitales**; los pagos de eventos/contratos siguen siendo manuales.
- Las alertas/recordatorios cargados en la pestaña "Tareas" del detalle de un Evento (`EventTasksEditor`, `resourcePlanSnapshot.alerts`) se sincronizan automáticamente hacia `CalendarItem` (`type: 'reminder'`, `source: 'event'`, `eventId` seteado) en `apps/api/src/modules/crm/event-alert-calendar-sync.service.ts`, invocado desde `POST /events` y `PATCH /events/:id` en `events.routes.ts`. Es sincronización unidireccional evento → calendario (se re-crea/borra por `metadata.eventAlertId` en cada guardado del plan); editar el ítem directamente en `/admin/calendar` no actualiza el plan del evento. Mantener este patrón si se agregan otros orígenes de recordatorios.

## Auditoría del circuito operativo (Lead → Cierre)

`docs/MYM_EVENTOS_LIFECYCLE_COMPLETION_AUDIT.md` documenta, campo por campo, dónde se corta hoy el circuito comercial/contractual/financiero/operativo y el plan de 14 fases para cerrarlo (disponibilidad de salón/fecha inexistente, validación de montos de pago ausente, permisos declarados pero no aplicados en rutas, sin motor de cron, catálogo/inventario montado a medias, sin entidad de gastos, sin cierre de evento). Consultarlo antes de tocar cualquiera de esas áreas. Nota: el calendario sigue siendo mayormente manual, salvo por la sincronización puntual de alertas de evento descrita arriba — ese documento de auditoría (más antiguo) todavía lo describe como "100% manual sin generación automática"; esa frase quedó parcialmente desactualizada por este cambio.

## Módulos independientes (no acoplar)

CRM (leads/presupuestos/clientes/contratos/eventos), Salones (con paquetes embebidos), Operaciones (catálogo/inventario/proveedores/reglas de consumo — backend existe pero **no está montado en rutas** ni tiene frontend, ver riesgos en el doc detallado), Personal/Staff (implementado pero sin entrada en el menú), Pagos, Landing pública, Invitaciones digitales, Entradas digitales, Notificaciones, Auditoría (se registra, sin UI de consulta), Usuarios/Roles/Permisos, Configuración.

## Convenciones técnicas

- TypeScript en todo el código; Zod para validación.
- Código (nombres, variables, comentarios) en inglés; UI y documentación en español.
- Sin Docker/Dockerfile/docker-compose.
- No presentar integraciones simuladas como definitivas; si se necesita un modo mock, debe estar explícitamente tipado como tal (patrón existente: `TicketPaymentProvider` con variante `'mock'`).
- Convenciones de UI/formularios detalladas en `docs/CODING_RULES.md` (modales para formularios cortos, `AlertDialog` para acciones destructivas, soft delete, etc.).

## Protocolo de trabajo

1. Leer este archivo y `docs/MYM_EVENTOS_PROJECT_CONTEXT.md`.
2. Ubicar el módulo afectado y su estado real (tabla de estado en §8 del doc detallado) antes de asumir que algo existe o falta.
3. Inspeccionar solo el área puntual a modificar (modelos, rutas, servicios, componentes, tests relacionados).
4. Implementar backend + frontend de forma coherente (incluir móvil solo si la tarea lo pide explícitamente, partiendo de que hoy no existe nada ahí).
5. Verificar permisos, alcance por salón e idempotencia.
6. Ejecutar typecheck/lint/test del workspace tocado.
7. Actualizar `docs/MYM_EVENTOS_PROJECT_CONTEXT.md` (y este archivo si aplica) si cambió una regla de negocio, arquitectura, integración o comando.
8. Si aparece una contradicción nueva entre documentación y código, documentarla con su decisión — no resolverla en silencio.
