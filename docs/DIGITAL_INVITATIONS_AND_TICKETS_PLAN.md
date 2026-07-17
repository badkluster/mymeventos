# Plan de invitaciones digitales y entradas

## Arquitectura

Se implementarán dos módulos independientes, ligados obligatoriamente a `Event`:

- `digital-invitations`: configuración pública, invitados o grupos familiares y confirmaciones.
- `tickets`: configuración comercial, tipos de entrada, órdenes, entradas individuales y registros de acceso.

Cada módulo guarda `eventId`, `salonId` y, cuando aplica, `customerId` como snapshots de alcance. El evento sigue siendo la fuente de fecha, nombre operativo y salón; las configuraciones públicas guardan los datos editables que se mostrarán al público.

No se reutiliza `Payment` contractual: sus invariantes exigen contrato y no representan una orden de entradas. Las órdenes de entradas registran su propio estado de pago y referencias externas/manuales. La integración de Mercado Pago queda preparada mediante proveedor y referencia, sin confirmar pagos provenientes del navegador.

## Entidades y relaciones

| Entidad | Relación | Propósito |
| --- | --- | --- |
| `DigitalInvitation` | 1:1 con `Event` | Configuración, publicación y token público de la invitación. |
| `InvitationGuest` | N:1 con `DigitalInvitation` | Invitado individual o grupo familiar, cupos y RSVP. |
| `TicketSale` | 1:1 con `Event` | Configuración de venta, cupo global y publicación. |
| `TicketType` | N:1 con `TicketSale` | Precio, cupo y vigencia de cada categoría. |
| `TicketOrder` | N:1 con `TicketSale` | Compra o reserva con clave de idempotencia. |
| `DigitalTicket` | N:1 con `TicketOrder` | Entrada individual con token/QR único. |
| `TicketAccessAttempt` | N:1 con `DigitalTicket` | Intentos de validación, ingreso y reversión. |

Todos los documentos administrativos tienen auditoría de usuario y borrado lógico cuando corresponde. Los tokens públicos se generan con `crypto.randomBytes`, nunca con ObjectId ni secuencias.

## Contratos API

### Invitaciones

- Administración: `/api/invitations/events/:eventId`, `/api/invitations/:id`, `/api/invitations/:id/guests`, `/api/invitations/:id/metrics`.
- Público: `/api/public/invitations/:token`, `/api/public/invitations/:token/rsvp`.
- Permisos: `INVITATIONS_READ`, `INVITATIONS_CREATE`, `INVITATIONS_UPDATE` y alcance de salón del evento.

### Entradas

- Administración: `/api/tickets/events/:eventId`, `/api/tickets/sales/:id`, `/api/tickets/sales/:id/types`, `/api/tickets/sales/:id/orders`, `/api/tickets/events/:eventId/check-in`.
- Público: `/api/public/tickets/:slug`, `/api/public/tickets/:slug/orders`, `/api/public/ticket/:token`.
- Permisos: `TICKETS_READ`, `TICKETS_CREATE`, `TICKETS_UPDATE` y `TICKETS_VALIDATE`, además del alcance de salón.

Las respuestas respetan el sobre `{ success, data, message }`; validaciones son Zod y errores son códigos técnicos con mensaje en español.

## Estados

- Invitación: `draft`, `published`, `unpublished`, `expired`, `cancelled`.
- RSVP: `pending`, `sent`, `viewed`, `confirmed`, `declined`, `partially_confirmed`, `expired`, `cancelled`.
- Venta: `draft`, `scheduled`, `active`, `paused`, `sold_out`, `closed`, `cancelled`.
- Orden: `pending`, `payment_pending`, `paid`, `expired`, `cancelled`, `refunded`, `partially_refunded`, `failed`.
- Entrada: `reserved`, `issued`, `valid`, `used`, `cancelled`, `refunded`, `expired`, `blocked`.

## Rutas frontend

- Backoffice: `/admin/events/[id]` enlaza a `/admin/events/[id]/invitations`, `/admin/events/[id]/tickets` y `/admin/events/[id]/check-in`.
- Público: `/invitacion/[token]`, `/entradas/[slug]`, `/entrada/[token]`.

Las rutas públicas se marcan como no indexables. El checkout nunca recibe precio confiable desde el cliente: el backend recalcula por tipo de entrada.

## QR, capacidad y concurrencia

El QR contiene únicamente el token aleatorio de la entrada. La validación real consulta el backend y el check-in es un `findOneAndUpdate` condicional sobre estado válido, por lo que no puede consumirse dos veces. Cada intento se persiste.

La reserva de cupos usa actualizaciones condicionales atómicas por tipo y cupo global; una orden conserva una expiración. Al expirar/cancelar se liberan cupos mediante una transición idempotente. La implementación evita el patrón leer-calcular-escribir.

## Propiedad de archivos

| Agente | Propiedad exclusiva |
| --- | --- |
| Coordinación | Este plan, `routes/index.ts`, permisos/roles compartidos, documentación final, integración y pruebas globales. |
| Invitaciones | `apps/api/src/modules/invitations/**`, pruebas de invitaciones. |
| Entradas | `apps/api/src/modules/tickets/**`, pruebas de ticketing y QR. |
| Web | Rutas nuevas de `apps/web/src/app/invitacion/**`, `entrada/**`, `entradas/**`, `admin/events/[id]/{invitations,tickets,check-in}/**`, componentes/tipos del módulo web. |

Las integraciones que requieren archivos de coordinación se comunicarán sin modificarlos directamente.

## Riesgos y rollback

- Mercado Pago no posee una integración funcional existente: se registra referencia y confirmación manual; no se simula una confirmación externa.
- El rate limit inicial será local al proceso; un entorno multiinstancia deberá moverlo a Redis o API Gateway.
- Rollback: despublicar la configuración y ejecutar un script idempotente de baja lógica si fuera necesario; no se modifica `Event`, `Customer`, pagos contractuales ni stock existentes.
