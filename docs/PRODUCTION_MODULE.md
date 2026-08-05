# Módulo de Producción

Plan de producción por evento (`apps/api/src/modules/production/`): qué preparar, cuánto y quién lo chequeó. Calca la planilla `Producción mayo.xlsx` que usa hoy el equipo (producto, cantidad planificada, unidad, listo/chequeado con quién y cuándo, observaciones), generada automáticamente a partir de reglas configurables en vez de tipeada a mano evento por evento.

Rutas web: `/admin/production` (listado), `/admin/production/[id]` (detalle/checklist), `/admin/production/consolidated` (agregado mensual), `/admin/production/rules` (reglas de generación) y `/admin/production/catalog` (catálogo de productos, agregado 2026-08-05 — ver §7).

## 1. Cómo se genera un plan

`POST /production/plans/generate` (`{ eventId }`) combina tres fuentes en `productionSource()` (`production.service.ts`):

1. **Reglas de producción** (`ProductionRule`, pestaña "Reglas"): cantidad fija + cantidad por invitado, filtradas por salón/tipo de evento/rango de invitados/vigencia, con redondeo y % de merma configurables. Sin reglas cargadas para un salón/paquete, esta fuente no aporta nada — la automatización depende de que el equipo invierta en cargarlas una vez.
2. **Snapshot legado del evento** (`Event.resourcePlanSnapshot.productItems`): lo que ya estaba tipeado a mano en el plan de recursos del evento.
3. **Ítems manuales de la versión anterior** (`ProductionItem.isManual`): al regenerar, lo que alguien agregó a mano se conserva en la nueva versión.

Los tres se fusionan por `productId` (o nombre normalizado) + unidad — mismo producto y unidad no se duplica, se suma. El resultado queda agrupado en secciones (`savory`, `sweet`, `beverages`, `cake`, `bakery`, `kitchen`, `bar`, `miscellaneous`).

Cada plan guarda un `sourceFingerprint` (hash del evento + contrato + presupuesto + reglas que aplicaron). Si esa fuente cambia después de generado (cambió la cantidad de invitados, se agregó un servicio, se editó una regla), `GET /production/plans/:id/freshness` lo detecta y el front ofrece regenerar — **crea una nueva versión** (`version + 1`), conserva la anterior completa para auditoría (`supersedesPlanId`/`supersededByPlanId`, `isCurrent: false`) y exige un motivo de regeneración si ya existía un plan.

**No se genera ni se regenera producción para un evento `cancelled`/`lost`** (`generateProductionPlan` lo bloquea con `PRODUCTION_EVENT_CANCELLED`) — evita reabrir por la puerta de atrás un plan que ya fue cancelado junto con el evento (ver §3).

## 2. Ciclo de vida de un ítem y del plan

Cada `ProductionItem` tiene su propio estado — el del `ProductionPlan` **se recalcula solo**, nadie lo edita directamente (`refreshPlanStatus`, se corre después de cada cambio de ítem):

| Estado del ítem | Quién lo pone | Efecto en el plan |
| --- | --- | --- |
| `pending` | Valor inicial | — |
| `in_progress` | Cualquiera con `production.update` | Plan pasa a `in_progress` si algún ítem se movió |
| `ready` | Requiere `production.complete` | Plan pasa a `ready` cuando **todos** los ítems están en `ready`/`checked` |
| `checked` | Requiere `production.complete` | Plan pasa a `checked` cuando **todos** los ítems están `checked` |
| `blocked` | Cualquiera con `production.update` | Un solo ítem bloqueado fuerza el plan entero a `blocked`, sin importar el resto |
| `cancelled` | Cualquiera con `production.update` | Se excluye del cálculo — es la salida para "esto no se necesitó", no cuenta como pendiente |

Volver un ítem de `ready`/`checked` hacia atrás (`pending`/`in_progress`) requiere permiso `production.reopen` — deshacer un chequeo ya hecho no es una acción trivial.

## 3. Cerrar el plan — el paso que suele pasar desapercibido

`checked` (todos los ítems listos) **no es lo mismo que cerrado**. Cerrar es una acción manual separada, y es la parte del flujo que más confusión genera:

- `POST /production/plans/:id/close` (permiso `production.complete`) exige que el 100% de los ítems no cancelados estén `checked`; si falta uno, devuelve `PRODUCTION_INCOMPLETE` con la cantidad exacta que falta. Al cerrar, el plan queda **bloqueado**: no admite altas ni cambios de ítems (`PRODUCTION_PLAN_LOCKED`) hasta que se reabra.
- `POST /production/plans/:id/reopen` (permiso `production.reopen`, motivo obligatorio ≥3 caracteres) vuelve el plan a `checked` — no restaura el estado que tenía antes de cerrarse, siempre queda en `checked` tras reabrir.

Este cierre es además **prerrequisito para cerrar el evento**: el checklist operativo de `event-closure` (`event-closure.routes.ts`) exige `plan.status === 'closed'` y cero ítems `blocked` como condiciones bloqueantes para poder cerrar el evento a nivel operativo. Si el equipo termina de cocinar/armar todo (todos los ítems `checked`) pero nadie aprieta "Cerrar producción", el evento queda con su cierre operativo trabado sin que sea obvio por qué.

Reglas agregadas para acompañar justamente ese punto de fricción (2026-08-05):

- **Cancelar/perder el evento cancela automáticamente su plan de producción vigente** (`cancelCurrentProductionPlan`, invocado desde `PATCH /events/:id/status`). Antes de esta fecha, `ProductionPlan.status: 'cancelled'` existía en el esquema pero ningún código lo asignaba nunca — un evento cancelado dejaba su plan `pending`/`in_progress` para siempre, ensuciando `/admin/production` y el consolidado mensual. Un plan ya `closed` **no** se toca (el evento ya ocurrió y la producción quedó chequeada y auditada; una cancelación posterior — p. ej. una corrección administrativa — no debe alterar retroactivamente ese registro).
- **Recordatorio automático D+1/D+3**: si el evento ya pasó y su plan sigue en cualquier estado abierto (`pending`/`in_progress`/`ready`/`blocked`/`checked`, o sea todavía no `closed`), se notifica al gerente del salón (o a ADMIN/MANAGER si no hay uno asignado) con un link directo al plan. Es el simétrico del aviso que ya existía para "falta generar producción" (`production-reminders.service.ts`, dispara antes del evento); este nuevo (`production-close-reminders.service.ts`) dispara después. Corre en el mismo `/api/internal/calendar-tick` cada 10 minutos, sin cron nuevo — ver `docs/MYM_EVENTOS_PROJECT_CONTEXT.md` §14.

## 4. Consolidado mensual

`GET /production/consolidated` (`/admin/production/consolidated`) suma, por sección y producto, la cantidad planificada de todos los planes vigentes del período, la compara contra stock disponible (`InventoryItem`) y ya desglosa por evento (columna por evento en la tabla, agrupada por sección) — pese a que auditorías anteriores lo describieron como "sin desglose por evento ni por sección", el código actual ya lo tiene. Lo que sigue sin existir es una fila que señale **qué planes del período quedaron sin cerrar** — hoy hay que revisar la lista de `/admin/production` filtrando por estado para verlo.

## 5. Permisos

| Permiso | Habilita |
| --- | --- |
| `production.view` | Ver planes, ítems, consolidado |
| `production.generate` | Generar/regenerar un plan |
| `production.create` | Agregar ítems manuales a un plan abierto |
| `production.update` | Editar cantidades/responsable/observaciones, mover ítems entre `pending`/`in_progress`/`blocked`/`cancelled` |
| `production.complete` | Marcar ítems `ready`/`checked`, cerrar el plan |
| `production.reopen` | Reabrir un plan cerrado, regenerar un plan ya cerrado, devolver un ítem de `ready`/`checked` hacia atrás |
| `production.rules.manage` | CRUD de `ProductionRule` (pestaña "Reglas") |
| `production.export` | Declarado en `@mym/shared`; no se encontró una ruta que lo consuma todavía |
| `catalog.read` / `catalog.create` / `catalog.update` / `catalog.delete` | Pestaña "Catálogo" (§7). Otorgados a ADMIN y MANAGER; `SALON_MANAGER`/`STAFF` no los tienen por defecto (mismo criterio que `production.rules.manage`, que tampoco tienen) |

## 7. Catálogo de productos (agregado 2026-08-05)

Hasta esta fecha, el desplegable "Producto" del formulario de reglas solo podía elegir entre `CatalogItem` que ya existieran en la base — y no había ninguna pantalla para crear uno nuevo: `catalog.routes.ts` (CRUD completo de `CatalogItem`/`ServiceExtra`, con permisos y soft delete) existía en el backend desde antes, pero nunca se montó en `routes/index.ts` (ver §10.6 de `docs/MYM_EVENTOS_PROJECT_CONTEXT.md`). Cualquier producto nuevo requería una intervención directa de un desarrollador en la base.

Se montó `catalog.routes.ts` en `/catalog` y se agregó una pantalla dedicada en `/admin/production/catalog` (pestaña "Catálogo" de `ProductionNav`) para dar de alta/editar/activar/eliminar productos: nombre, tipo (`CatalogItemType`: alimento/bebida/descartable/limpieza/decoración/otro), categoría (`InventoryCategory`), tipo de bebida si aplica, unidad de medida y notas. Es una pantalla acotada a lo que necesita Producción — no expone `ServiceExtra` (servicios extra de presupuestos, mismo router pero otro dominio) ni las columnas de costo/precio/proveedor que sí tiene el modelo (`unitCost`, `suggestedSalePrice`, `supplierId`), que quedan en su valor por defecto (0 / sin proveedor) porque esta pantalla no las pide.

La carpeta histórica `apps/web/src/app/admin/catalog` (pensada en su momento para un catálogo genérico de operaciones, con inventario y reglas de consumo) sigue vacía — no se resucitó ni se reutilizó; es una pantalla distinta con un alcance más chico.

## 8. Gaps conocidos (no resueltos en esta tarea)

- **Cierre todo-o-nada por plan**, no por sección: la planilla real separa Salado/Dulce/Bebidas como bloques que cierra gente distinta en momentos distintos (cocina el día antes, barra el día del evento); hoy el único gate es cerrar el 100% del plan de una sola vez.
- **`production.export`** está declarado como permiso pero no tiene ruta asociada.
- El consolidado no señala qué planes quedaron sin cerrar dentro del período — solo agrega cantidades.
- **Inventario y reglas de consumo** siguen sin montar (§10.6/§12.2 del contexto persistente) — el catálogo resuelto en §7 es solo la parte de productos, no ese resto.
- Eliminar un producto del catálogo que ya usa una regla de producción activa no bloquea el borrado ni avisa qué reglas quedan huérfanas (la regla queda apuntando a un `productId` inexistente).
