# Módulo de Presupuestos Custom e Híbridos

## Alcance

El flujo existente sigue vigente:

`Lead / Customer / QuoteRequest -> Quote -> Event -> Contract`

Este módulo agrega presupuestos armados por líneas operativas, usando catálogo, servicios extra o carga manual, sin reemplazar las plantillas comerciales actuales.

## Modos

- `PACKAGE`: presupuesto clásico basado en `PackageTemplate` y `VenuePackageRule`.
- `CUSTOM`: presupuesto armado desde líneas de catálogo, servicios extra o líneas manuales.
- `HYBRID`: presupuesto mixto para combinar base comercial y ajustes custom.

Si un presupuesto viejo no tiene `quoteMode`, se interpreta como `PACKAGE`.

## QuoteLineItem

Campos implementados:

- `sourceType`: `PACKAGE`, `CATALOG_ITEM`, `SERVICE_EXTRA`, `MANUAL`, `ADDENDUM`.
- `catalogItemId`: opcional.
- `serviceExtraId`: opcional.
- `name`, `description`.
- `quantity`.
- `unitOfMeasure`.
- `unitCost`, `unitPrice`.
- `discountAmount`.
- `subtotalCost`, `subtotalPrice`, `totalPrice`: calculados por backend.
- `affectsInventory`.
- `notes`.

Las líneas viven embebidas en `Quote` para preservar versión comercial y para que revisiones, eventos y contratos no dependan de precios vivos del catálogo.

## Cálculo

`POST /api/quotes/custom-calculate` normaliza líneas y devuelve totales:

- `subtotalCost = quantity * unitCost`.
- `subtotalPrice = quantity * unitPrice`.
- `totalPrice = max(0, subtotalPrice - discountAmount)`.
- `subtotalCost` global es la suma de costos de línea.
- `totalAmount` global es la suma de `totalPrice`.

Al crear presupuesto:

- `Quote.totalAmount = totalAmount`.
- `Quote.pricePerPerson` y `Quote.finalPricePerPerson` se derivan de `totalAmount / guestCount` para mantener compatibilidad con listados.
- `Quote.balanceAmount = max(0, totalAmount - depositAmount)`.
- `customCalculationSnapshot` guarda inputs, desglose de invitados y cálculo.

## Endpoints

Extensiones implementadas sobre `/api/quotes`:

- `POST /api/quotes/custom-calculate`: calcula sin persistir.
- `POST /api/quotes/from-custom-calculation`: crea uno o más presupuestos desde un cálculo custom.
- `PATCH /api/quotes/:id/line-items`: reemplaza líneas y recalcula totales.
- `POST /api/quotes/:id/recalculate`: recalcula desde las líneas persistidas.
- `POST /api/quotes/:id/convert-to-event`: copia snapshots al evento.

Endpoints de apoyo:

- `GET /api/catalog/items?active=true&salonId=...`
- `GET /api/catalog/services?active=true&salonId=...`
- `GET /api/salons?active=true`

## UI

Pantallas implementadas:

- `/admin/quotes`: agrega acceso a "Cotizador personalizado".
- `/admin/quotes/custom`: permite seleccionar salón, datos del contacto, desglose de invitados, productos de catálogo, servicios extra, cantidades, costos, precios, cálculo y guardado.

## Validaciones

- Debe existir al menos un salón (`salonId` o `salonIds`).
- `CUSTOM` y `HYBRID` requieren al menos una línea.
- Si no hay `leadId` ni `customerId`, se exigen datos mínimos de contacto: teléfono, tipo de evento, invitados y nombre.
- Los totales no pueden quedar en cero para crear el presupuesto.
- Los endpoints aplican permisos y alcance por salón igual que el flujo clásico de presupuestos.

## Conversión a Event

Al convertir un presupuesto:

- `Event.quoteMode` recibe el modo.
- `Event.guestBreakdown` recibe el desglose de invitados.
- `Event.lineItemsSnapshot` recibe las líneas calculadas.
- `Event.customCalculationSnapshot` recibe inputs y resultados del cálculo.
- `Event.estimatedAmount` y `Event.finalAmount` se toman de `Quote.totalAmount`.

El evento no depende de lecturas vivas del catálogo para representar lo vendido.

## Conversión a Contract

Al crear contrato desde evento:

- `Contract.contractMode` copia el modo.
- `Contract.lineItemsSnapshot` copia las líneas aceptadas desde el evento.
- `Contract.baseAmount` usa el monto final del evento.

Los cambios comerciales posteriores a un contrato aprobado deben modelarse con adendas.

## Gaps

- No se implementó aceptación parcial por cliente para líneas opcionales.
- No se implementó workflow de aprobación interna por margen bajo.
- No se implementó integración automática de compras o reservas reales de stock desde presupuesto.
