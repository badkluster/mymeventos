# Módulo de Eventos

## Alcance

El módulo de Eventos es el pulmón operativo del sistema. Implementa el tramo **Presupuesto aceptado → Cliente → Evento** y centraliza la información necesaria para operar, contratar, cobrar y auditar cada servicio.

El evento vincula:

- Cliente y Lead origen.
- Presupuesto origen.
- Salón.
- Datos comerciales y modalidad de precio.
- Menú y servicios contratados.
- Staff asignado.
- Contrato y pagos asociados.
- Plan operativo editable: cronograma, logística, stock/insumos, vajilla/mantelería/equipos, proveedores externos, tareas y alertas.

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

## Alta Directa desde Eventos

Endpoint:

- `POST /api/events`

Permite crear eventos desde el módulo de Eventos en dos modos:

- `quoteId`: convierte o vincula un presupuesto existente, reutilizando cliente, salón, menú, servicios y snapshots comerciales del presupuesto.
- Evento directo: crea un evento sin presupuesto previo, pudiendo usar un cliente existente o crear uno nuevo en el mismo formulario.

El alta directa puede recibir `createContract = true`. Si el evento tiene los datos mínimos, se genera contrato inmediatamente. Si falta información contractual, el evento se conserva y la respuesta devuelve `contractError` para completar datos desde el detalle.

Todo evento nuevo inicializa `resourcePlanSnapshot` con un cronograma operativo base totalmente editable.

## Cliente

El cliente se reutiliza en este orden:

1. `quote.customerId` si existe.
2. `Customer.sourceLeadId`.
3. Email normalizado.
4. Teléfono normalizado.

Si no existe, se crea con datos del presupuesto y del Lead.

## Evento

El evento guarda:

- `customerId`
- `sourceLeadId`
- `sourceQuoteId`
- `salonId`
- `eventType`
- `eventName`
- `eventDate`
- `startTime`
- `endTime`
- `guestCount`
- `honoreeName`
- restricciones alimentarias
- `tableLinenColor`
- `status = quoted`
- `estimatedAmount`
- `finalAmount`
- `commercialSnapshot`
- `menuSnapshot`
- `servicesSnapshot`
- `paymentSnapshot`
- `resourcePlanSnapshot`
- `contractReadyChecklist`
- `notes`

`resourcePlanSnapshot` contiene la parte operativa del evento:

- `timelineItems`: cronograma operativo con horario, área, responsable, estado y notas.
- `productItems`: productos e insumos utilizados, cantidad, unidad, proveedor, costo y estado.
- `inventoryItems`: vajilla, mantelería, mobiliario y equipos requeridos/reservados/devueltos.
- `supplierAssignments`: servicios externos y proveedores vinculados al evento, con contacto, llegada, monto acordado y estado.
- `tasks`: tareas internas, responsables, prioridad, vencimiento y estado.
- `alerts`: recordatorios operativos.
- `logistics`: notas de armado de salón, cocina, barra, ambientación, accesos y riesgos.

## Endpoints de Eventos

- `GET /api/events`
- `POST /api/events`
- `GET /api/events/:id`
- `PATCH /api/events/:id`
- `PATCH /api/events/:id/status`
- `GET /api/events/:id/staff`
- `POST /api/events/:id/staff`
- `PATCH /api/events/:id/staff/:assignmentId`
- `DELETE /api/events/:id/staff/:assignmentId`
- `GET /api/events/:id/payments`
- `GET /api/events/:id/payment-summary`
- `POST /api/events/:id/create-contract`

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

- `/admin/events`: listado de eventos.
- `/admin/events/:id`: centro operativo del evento.
- `/admin/quotes/:id`: botón “Crear evento” desde el presupuesto.

Desde `/admin/events` se puede crear un evento con:

- Cliente nuevo.
- Cliente existente.
- Presupuesto existente.
- Contrato opcional.
- Cronograma inicial editable antes de guardar.

El detalle de evento se organiza por pestañas:

- Resumen.
- Ficha.
- Cliente.
- Comercial.
- Menú.
- Servicios.
- Cronograma.
- Logística.
- Stock y vajilla.
- Proveedores.
- Staff.
- Tareas.
- Contrato.
- Pagos.
- Actividad.

## Estados

- `draft`: Borrador.
- `quoted`: Pendiente de contrato.
- `contract_draft`: Contrato borrador.
- `deposit_pending`: Seña pendiente.
- `reserved`: Reservado.
- `confirmed`: Confirmado.
- `cancelled`: Cancelado.
- `lost`: Perdido.

## Gaps

- No hay workflow de firma o aceptación formal.
- No hay bloqueo de disponibilidad del salón por fecha.
- El plan de stock todavía es snapshot operativo; la reserva contable de inventario deberá conectarse al módulo de inventario cuando el evento pase a reservado/confirmado.
- Las alertas del plan operativo todavía no disparan notificaciones automáticas; quedan persistidas para la siguiente fase de recordatorios.
