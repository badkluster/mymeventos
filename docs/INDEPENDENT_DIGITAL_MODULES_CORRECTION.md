# Corrección: módulos digitales independientes

## Hallazgo

La primera implementación vinculó incorrectamente `DigitalInvitation` y `TicketSale` a `Event` mediante `eventId`, rutas bajo `/admin/events`, y lecturas de fecha, salón, cliente y capacidad desde el dominio comercial. Esto contradice la autonomía requerida y puede impedir usar estos productos sin un evento administrativo.

## Archivos afectados

| Área | Archivos principales | Corrección |
| --- | --- | --- |
| Invitaciones API | `modules/invitations/invitation.models.ts`, `invitation.routes.ts`, `invitation.service.ts` | Eliminar `eventId` y relaciones comerciales; incorporar propietario, datos propios y plantillas. |
| Entradas API | `modules/tickets/ticket.models.ts`, `ticket.routes.ts`, `ticket.service.ts` | Renombrar la publicación de venta a `TicketPublication`; quitar `Event`, `Salon` y `Customer` de todos los flujos. |
| Web | `features/digital/*`, `app/admin/events/[id]/*` | Crear rutas principales independientes y retirar enlaces/páginas dentro de Eventos. |
| Navegación/permisos | `admin-shell.tsx`, permisos compartidos | Agregar módulos de menú y mantener autorización independiente. |

## Relaciones que se eliminan

- `DigitalInvitation.eventId`, `salonId` y `customerId`.
- `TicketSale.eventId`, `salonId` y `customerId`, así como los equivalentes en orden, entrada e intento de acceso.
- Consultas a `Event` y validación por alcance de salón desde ambos módulos.
- Rutas y enlaces `/admin/events/:eventId/(invitations|tickets|check-in)`.

Los nuevos datos de fecha, ubicación, capacidad, descripción y reglas de acceso se guardan directamente en `DigitalInvitation` o `TicketPublication`.

## Datos y migración

No se ejecutará ninguna migración ni se tocará producción. El script idempotente `apps/api/src/scripts/migrateIndependentDigitalModules.ts` sólo simula por defecto; requiere `--apply` para escribir. Copia ventas históricas a `TicketPublication` conservando su `_id`, transforma las relaciones hijas a `publicationId` y elimina los campos comerciales de los documentos migrados. El flujo normal no utiliza ni expone `legacyEventId`.

## Protección del módulo de eventos

No se modifican modelos, rutas, controladores ni flujos comerciales de `Event`. La corrección elimina únicamente las rutas y enlaces digitales que estaban dentro de Eventos.

## Matriz de propiedad

| Responsable | Archivos bajo propiedad |
| --- | --- |
| Coordinación | este documento, integración de rutas, menú, permisos, migración y verificación final |
| Invitaciones | `apps/api/src/modules/invitations/**`, sus pruebas; `apps/web/src/app/admin/digital-invitations/**`, `features/digital/invitations*`, vista pública de invitación |
| Entradas | `apps/api/src/modules/tickets/**`, sus pruebas; `apps/web/src/app/admin/digital-tickets/**`, `features/digital/tickets*`, vistas públicas de entrada |
| QA | revisión de referencias y pruebas independientes; no edita módulos de dominio |

## Rollback

Los cambios se separarán en commits por módulo. Para rollback se retiran las rutas y pantallas digitales independientes sin cambiar `Event`. El script de migración será sólo de copia y no borrará registros históricos; no se ejecutará automáticamente.
