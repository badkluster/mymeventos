# Módulo de Eventos Base

## Alcance

Esta fase implementa el tramo **Presupuesto aceptado → Cliente → Evento base**.

No implementa todavía:

- Contratos.
- Reservas formales.
- Pagos o señas.
- Calendario operativo completo.
- Inventario.
- Tareas, cronograma ni staff.

## Conversión desde Presupuesto

Endpoint:

- `POST /api/quotes/:id/convert-to-event`

El endpoint:

1. Carga el presupuesto.
2. Valida acceso al salón.
3. Busca o crea un `Customer`.
4. Crea un `Event` con estado `quoted`.
5. Marca el presupuesto como `converted`.
6. Guarda `acceptedAt` si todavía no existía.
7. Marca el Lead como `converted`.
8. Guarda en el Lead `convertedCustomerId`, `convertedEventId` y `convertedAt`.
9. Registra actividad en el Lead.

La operación es idempotente: si el presupuesto ya tiene un evento asociado por `sourceQuoteId`, devuelve el evento existente.

## Cliente

El cliente se reutiliza en este orden:

1. `quote.customerId` si existe.
2. `Customer.sourceLeadId`.
3. Email normalizado.
4. Teléfono normalizado.

Si no existe, se crea con datos del presupuesto y del Lead.

## Evento

El evento base guarda:

- `customerId`
- `sourceLeadId`
- `sourceQuoteId`
- `salonId`
- `eventType`
- `eventName`
- `eventDate`
- `guestCount`
- `status = quoted`
- `estimatedAmount`
- `finalAmount`
- `notes`

## Endpoints de Eventos

- `GET /api/events`
- `GET /api/events/:id`
- `PATCH /api/events/:id/status`

Filtros de listado:

- `status`
- `salonId`
- `customerId`
- `sourceQuoteId`
- `search`
- `page`
- `limit`
- `sortBy`
- `sortOrder`

## UI

- `/admin/events`: listado de eventos base.
- `/admin/events/:id`: detalle de evento, cliente, salón, presupuesto origen y estado.
- `/admin/quotes/:id`: botón “Crear evento” desde el presupuesto.

## Estados

- `draft`: Borrador.
- `quoted`: Pendiente de contrato.
- `reserved`: Reservado.
- `confirmed`: Confirmado.
- `cancelled`: Cancelado.
- `lost`: Perdido.

## Gaps

- No hay contrato legal generado.
- No hay workflow de firma o aceptación formal.
- No hay pagos, señas ni planes de pago.
- No hay bloqueo de disponibilidad del salón por fecha.
- No hay calendario operativo completo.
