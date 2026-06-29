# Módulo de Catálogo Operativo

## Alcance

Este módulo define el catálogo operativo que alimenta presupuestos personalizados, eventos, contratos, compras e inventario.

No reemplaza las plantillas actuales `PackageTemplate` y `VenuePackageRule`. Las complementa con ítems reutilizables y reglas de consumo para armar presupuestos custom o híbridos sin hardcodear servicios, proveedores ni insumos.

## Entidades

### CatalogItem

Representa un producto o servicio vendible o consumible.

Campos implementados:

- `name`: nombre visible.
- `type`: `FOOD`, `BEVERAGE`, `DISPOSABLE`, `CLEANING`, `DECORATION`, `OTHER`.
- `category`: `FOOD`, `BEVERAGE`, `TABLEWARE`, `LINEN`, `FURNITURE`, `DECORATION`, `EQUIPMENT`, `CLEANING`, `DISPOSABLE`, `OTHER`.
- `beverageType`: `NON_ALCOHOLIC` o `ALCOHOLIC`.
- `description`: detalle comercial.
- `unitOfMeasure`, `unitSize`.
- `unitCost`, `suggestedSalePrice`, `markupPercentage`.
- `supplierId`.
- `active`, `notes`.
- Campos base: `createdBy`, `updatedBy`, `deletedAt`, `deletedBy`, timestamps.

Indices sugeridos:

- `{ name: 1, deletedAt: 1 }`
- `{ status: 1, type: 1, deletedAt: 1 }`
- `{ salonIds: 1, status: 1, deletedAt: 1 }`

### ServiceExtra

Representa un adicional comercial derivado de un `CatalogItem`. Puede existir como entidad separada si la UI necesita una sección rápida de extras, o resolverse como vista filtrada de `CatalogItem`.

Campos implementados:

- `name`, `description`.
- `type`: `FIXED_PRICE`, `PER_PERSON`, `PER_HOUR`, `PER_UNIT`, `CUSTOM`.
- `basePrice`: precio de venta base.
- `cost`: costo estimado.
- `pricePerPerson`, `pricePerHour`, `pricePerUnit`.
- `applicableSalonIds`.
- `supplierId`.
- `active`.
- Campos base y timestamps.

Regla práctica: si el extra necesita stock, proveedor o regla de consumo, debe estar respaldado por un `CatalogItem`.

### Supplier

Representa proveedores externos de servicios, productos o insumos.

Campos implementados:

- `name`.
- `businessName`, `taxId`.
- `phone`, `whatsapp`, `email`, `address`.
- `category`: `BEVERAGES`, `FOOD`, `BAKERY`, `PASTRY`, `MEAT`, `DECORATION`, `SOUND_DJ`, `PHOTOGRAPHY`, `CLEANING`, `DISPOSABLES`, `TABLEWARE`, `LINEN`, `STAFFING`, `OTHER`.
- `contactPerson`, `notes`.
- `active`.
- Campos base y timestamps.

### InventoryItem

Representa stock físico, insumos consumibles o activos reutilizables.

Campos implementados:

- `name`.
- `type`: `CONSUMABLE` o `NON_CONSUMABLE`.
- `category`: categorías de inventario compartidas.
- `catalogItemId`: referencia opcional al catálogo.
- `salonId`: ubicación principal opcional.
- `unitOfMeasure`.
- `currentQuantity`: cantidad disponible contable.
- `minimumQuantity`: umbral de alerta.
- `reservedQuantity`, `damagedQuantity`, `lostQuantity`.
- `replacementCost`, `rentalPrice`.
- `active`, `notes`.
- Campos base y timestamps.

Indices sugeridos:

- `{ salonId: 1, status: 1, deletedAt: 1 }`
- `{ sku: 1, deletedAt: 1 }`
- `{ currentQuantity: 1, minimumQuantity: 1 }`

### InventoryAdjustment

Registra todo movimiento de inventario. No se debe editar `currentQuantity` sin ajuste asociado.

Campos implementados:

- `inventoryItemId`.
- `type`: `IN`, `OUT`, `ADJUSTMENT`, `DAMAGE`, `LOSS`, `RETURN`.
- `quantity`: número no negativo. El endpoint de ajuste decide si suma, resta o fija stock.
- `reason`.
- `eventId`, `supplierId`, `notes`.
- `createdBy`, timestamps.

Convención: no se edita `currentQuantity` desde UI sin crear un `InventoryAdjustment`.

### ConsumptionRule

Define cómo un `CatalogItem` consume inventario o requiere compras.

Campos implementados:

- `name`, `description`.
- `active`.
- `salonId`, `eventType`.
- `catalogItemId` o `serviceExtraId`.
- `target`: `TOTAL_GUESTS`, `ADULTS`, `MINORS`, `CHILDREN`, `TEENAGERS`, `ADULTS_WITH_ALCOHOL`, `TABLES`, `EVENT_DURATION_HOURS`.
- `quantityPerTarget`, `unitOfMeasure`, `minimumQuantity`.
- `roundingMode`: `NONE`, `CEIL`, `FLOOR`, `ROUND`, `PACKAGE_SIZE`.
- `packageSize`.
- `appliesWhen`: `includesAlcohol`, `eventType`, `minGuests`, `maxGuests`.
- `notes`.
- Campos base y timestamps.

Ejemplo: una barra libre puede consumir bebidas con `basis = per_person`, `quantity = 0.75`, `wastePercentage = 10`, redondeo `ceil`.

## Enums

Estados técnicos en inglés, labels en español en la UI.

- `CatalogItemType`: `FOOD`, `BEVERAGE`, `DISPOSABLE`, `CLEANING`, `DECORATION`, `OTHER`.
- `ServiceExtraType`: `FIXED_PRICE`, `PER_PERSON`, `PER_HOUR`, `PER_UNIT`, `CUSTOM`.
- `SupplierCategory`: `BEVERAGES`, `FOOD`, `BAKERY`, `PASTRY`, `MEAT`, `DECORATION`, `SOUND_DJ`, `PHOTOGRAPHY`, `CLEANING`, `DISPOSABLES`, `TABLEWARE`, `LINEN`, `STAFFING`, `OTHER`.
- `InventoryItemType`: `CONSUMABLE`, `NON_CONSUMABLE`.
- `InventoryCategory`: `FOOD`, `BEVERAGE`, `TABLEWARE`, `LINEN`, `FURNITURE`, `DECORATION`, `EQUIPMENT`, `CLEANING`, `DISPOSABLE`, `OTHER`.
- `InventoryAdjustmentType`: `IN`, `OUT`, `ADJUSTMENT`, `DAMAGE`, `LOSS`, `RETURN`.
- `ConsumptionRuleTarget`: `TOTAL_GUESTS`, `ADULTS`, `MINORS`, `CHILDREN`, `TEENAGERS`, `ADULTS_WITH_ALCOHOL`, `TABLES`, `EVENT_DURATION_HOURS`.
- `RoundingMode`: `NONE`, `CEIL`, `FLOOR`, `ROUND`, `PACKAGE_SIZE`.

## Endpoints

Base autenticada, con RBAC y alcance por salón como el resto de la API.

Catálogo:

- `GET /api/catalog/items`
- `POST /api/catalog/items`
- `GET /api/catalog/items/:id`
- `PATCH /api/catalog/items/:id`
- `DELETE /api/catalog/items/:id`
- `PATCH /api/catalog/items/:id/status`

Extras:

- `GET /api/catalog/services`
- `POST /api/catalog/services`
- `GET /api/catalog/services/:id`
- `PATCH /api/catalog/services/:id`
- `DELETE /api/catalog/services/:id`

Proveedores:

- `GET /api/suppliers`
- `POST /api/suppliers`
- `GET /api/suppliers/:id`
- `PATCH /api/suppliers/:id`
- `DELETE /api/suppliers/:id`
- `PATCH /api/suppliers/:id/status`

Inventario:

- `GET /api/inventory`
- `POST /api/inventory`
- `GET /api/inventory/summary`
- `GET /api/inventory/:id`
- `PATCH /api/inventory/:id`
- `DELETE /api/inventory/:id`
- `POST /api/inventory/:id/adjust`
- `GET /api/inventory/:id/movements`

Reglas de consumo:

- `GET /api/consumption-rules`
- `POST /api/consumption-rules`
- `GET /api/consumption-rules/:id`
- `PATCH /api/consumption-rules/:id`
- `DELETE /api/consumption-rules/:id`
- `POST /api/consumption-rules/calculate`

Filtros mínimos:

- `status`, `type`, `salonId`, `supplierId`, `inventoryItemId`, `search`, `page`, `limit`, `sortBy`, `sortOrder`.

## Convenciones de cálculo

- Todos los importes se guardan como números en ARS, siguiendo el patrón actual de `Quote.totalAmount`, `depositAmount` y `balanceAmount`.
- Redondeo comercial: `Math.round` al peso más cercano, consistente con presupuestos actuales.
- `lineSubtotal = quantity * unitPrice`.
- `discountAmount` gana sobre `discountPercentage` si ambos vienen informados.
- `lineTotal = max(0, lineSubtotal - discountAmount)`.
- Para precios por persona: `quantity` debe resolverse con `guestCount`.
- Para precios por hora: `quantity` debe resolverse con duración efectiva.
- Los costos internos no afectan el precio enviado al cliente; se usan para margen.
- Stock disponible operativo: `availableQuantity = currentQuantity - reservedQuantity`.
- Reservas de stock se generan al confirmar evento o contrato, no al crear un borrador de presupuesto.

## Snapshots

Cuando un ítem de catálogo entra en un presupuesto, evento o contrato, se guarda snapshot para preservar lo cotizado aunque cambie el catálogo.

Snapshot mínimo de `CatalogItem`:

- `catalogItemId`, `name`, `type`, `description`, `unit`, `pricingMode`.
- `unitPrice`, `cost`, `currency`, `taxRate`.
- `supplierSnapshot`: proveedor elegido si aplica.
- `inventorySnapshot`: insumos o activos relevantes si aplica.
- `consumptionRulesSnapshot`: reglas usadas para cálculo operativo.
- `sourceVersion`: `updatedAt` del ítem al momento de tomar snapshot.

Eventos y contratos deben consumir snapshots, no leer precios vivos desde catálogo.

## Integraciones

- Presupuestos custom e híbridos consumen `CatalogItem` y `ServiceExtra` para construir `QuoteLineItem`.
- Eventos guardan `commercialSnapshot`, `menuSnapshot` y `servicesSnapshot` con las líneas aceptadas.
- Contratos copian esos snapshots a `commercialSnapshot`, `menuSnapshot`, `servicesSnapshot` y anexos.
- Inventario puede reservarse desde eventos `reserved` o contratos `approved`.
- Pagos no dependen del catálogo; usan total contractual.
- Auditoría debe registrar altas, bajas, cambios de precio, reglas de consumo y ajustes de inventario.

## Gaps

- No se define todavía una orden de compra formal.
- No se implementa valuación contable de stock.
- No se define multi-moneda real.
- No se automatiza compra a proveedor; solo queda modelado el contrato de integración.
