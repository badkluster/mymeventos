# M&M Eventos — Auditoría integral y plan de finalización del circuito operativo

> Documento generado el 2026-07-22. Complementa a `docs/MYM_EVENTOS_PROJECT_CONTEXT.md` (contexto general del repositorio) con una auditoría profunda, entidad por entidad, del ciclo Lead → Presupuesto → Contrato → Pago → Evento → Producción → Cierre → Reportes, y el plan por fases para completarlo de forma coherente. No se modificó código en esta etapa: es un documento de investigación y diseño.
>
> Convención: código, nombres de campos y de entidades en inglés (tal como existen en el repositorio); explicación en español.

---

## 1. Resumen ejecutivo

M&M Eventos tiene, hoy, un **núcleo comercial y contractual sorprendentemente maduro** (leads, solicitudes de presupuesto, presupuestos con modos PACKAGE/CUSTOM/HYBRID, conversión a cliente, conversión a evento, contratos versionados, addenda, pagos con reconciliación de saldo) construido sobre patrones sólidos: snapshots congelados, idempotencia en las conversiones, soft delete generalizado, auditoría en la mayoría de las mutaciones sensibles.

Pero el circuito se **corta exactamente donde empieza la operación real del evento**: no existe bloqueo de disponibilidad de salón/fecha, el plan de producción es un blob JSON sin validación ni estados reales, el calendario es una agenda manual desconectada (nada se genera automáticamente pese a que el modelo está diseñado para eso), no hay mecanismo de notificaciones programadas ni de tareas en segundo plano, el módulo de inventario/catálogo está construido pero **desconectado de la API** (no montado en las rutas), no existe ningún concepto de gasto, y el evento **nunca llega a un estado de "completado" o "cerrado"** — la única forma de terminar su vida es `confirmed`, `cancelled` o `lost`, sin distinción entre cierre operativo, financiero y administrativo.

Además se detectaron dos categorías de riesgo transversal que deben corregirse independientemente de cualquier funcionalidad nueva:

1. **El backend nunca valida el monto de un pago contra el saldo del contrato.** Cualquier usuario con permiso `PAYMENTS_CREATE` puede registrar un pago o un reembolso por cualquier monto arbitrario.
2. **Existe una brecha entre el modelo de permisos declarado y lo realmente aplicado**: `EVENTS_CANCEL`, `EVENTS_DELETE`, `QUOTES_DELETE` y `PAYMENTS_CANCEL` están definidos en `packages/shared/src/constants/permissions.ts` y se muestran en el editor de permisos de la web, pero **ninguna ruta del backend los verifica** — las acciones reales quedan gateadas por permisos más generales (`EVENTS_UPDATE`, `QUOTES_UPDATE`, `PAYMENTS_REJECT`). Un administrador puede creer que está restringiendo una acción cuando en realidad no restringe nada.

La estrategia recomendada **no es construir módulos nuevos aislados** (inventario, producción, gastos, cierre) sino, en este orden: (a) reparar las brechas de integridad financiera y de permisos ya existentes; (b) conectar lo que ya está construido pero desenchufado (catálogo/inventario, calendario automático); (c) introducir los conceptos que realmente faltan (producción estructurada, gastos, cierre) como extensiones de las entidades ya existentes (`Event`, `CalendarItem`, `InventoryItem`) en vez de nuevas abstracciones paralelas; (d) recién entonces construir reportes, porque hoy ningún reporte de rentabilidad podría ser confiable — no hay gastos, el plan operativo no tiene estados reales, y el inventario por evento vive en dos sistemas no relacionados (`EventTablewareAllocation` vs. `InventoryItem`/`InventoryAdjustment`).

Se prioriza deliberadamente **no** introducir microservicios, event sourcing, ni una cola de trabajos distribuida: el monolito modular actual (Express + Mongoose por módulo de dominio) es adecuado a la escala real del negocio (una empresa con salones propios, no una plataforma multi-tenant masiva). La única pieza de infraestructura nueva genuinamente necesaria es un mecanismo de tareas programadas (cron) — hoy no existe ninguno en absoluto.

---

## 2. Ciclo de vida actual (reconstruido desde el código, no desde la documentación)

```
Solicitud pública / alta manual
        │
        ▼
      Lead ── LeadActivity (timeline manual)
        │        status: new → contacted → follow_up → quote_sent → negotiation → won/lost/converted
        │        dedupe: contact-dedupe.service.ts (email/teléfono normalizado, sin índice único en BD)
        ▼
  QuoteRequest (solicitud pendiente; dedupe de leads; notificación real SOLO en este punto del sistema)
        │  operador "toma" la solicitud (status: new → in_review → converted/discarded/duplicated)
        ▼
      Quote  (modo PACKAGE/CUSTOM/HYBRID; QuoteRevision = snapshot versionado)
        │        status: draft → sent → accepted/rejected/expired → converted
        │        cálculo: per-person o fijo, recalculado en backend
        ▼
POST /api/quotes/:id/convert-to-event   ── IDEMPOTENTE (confirmado en código y en tests)
        │        crea/reutiliza Customer (prioridad: quote.customerId → sourceLeadId → email → teléfono)
        │        marca Quote → converted, Lead → converted, crea QuoteRevision, LeadActivity
        ▼
      Event  (status: draft → quoted → contract_draft → deposit_pending → reserved → confirmed → cancelled/lost)
        │        NO existe estado "completed"/"closed": el ciclo termina en confirmed, cancelled o lost.
        │        NO existe bloqueo de disponibilidad de salón+fecha (confirmado: sin índice, sin query de conflicto)
        │        resourcePlanSnapshot: blob JSON libre (timeline, staff notes, guest list, inventory items,
        │        tasks, alerts, logistics) — sin schema, sin transiciones de estado reales
        ▼
   createContractFromEvent()  (manual, o automático si createContract=true al crear el evento)
        │        bloquea si el evento está incompleto (contractReadyChecklist se calcula pero NUNCA se
        │        usa para bloquear la transición de status del propio Event)
        ▼
      Contract  (status: draft → pending_approval → approved → cancelled/superseded/requires_changes)
        │        versionado real: contractFamilyId, supersedesContractId/supersededByContractId
        │        cambios en campos "sensibles" del Event tras aprobación → nueva versión de Contract
        ▼
   ContractAddendum (status: draft → pending_approval → approved/rejected/cancelled)
        │        approve() recalcula Contract.totalAmount sumando addenda aprobadas
        ▼
      Payment  (type: deposit/installment/balance/addendum/extra/security_deposit/adjustment/refund/other)
        │        status: pending → paid → cancelled/refunded*
        │        *'refunded' EXISTE en el enum pero el código de refund() NUNCA lo aplica al pago original
        │        balance = Contract.totalAmount - Contract.paidAmount, recalculado por SUMA de Payments
        │        (no hay agregación de Mongo, es un reduce en memoria; no hay validación del monto contra
        │        el saldo — el backend confía en el monto que manda el cliente)
        ▼
   [AQUÍ SE CORTA EL CIRCUITO]
        │
        │   CalendarItem existe pero es 100% manual — el enum `source` sugiere generación automática
        │   (event/payment/contract/system) que NUNCA ocurre en el código real.
        │
        │   EventStaffAssignment existe (asignación real, con detección de duplicados exactos, sin
        │   detección de solapamiento de turnos) pero "checked_in" es solo un valor de enum sin
        │   fichaje real (sin hora, geolocalización ni confirmación).
        │
        │   EventTablewareAllocation SÍ tiene reglas reales de disponibilidad por día y bloquea
        │   sobre-asignación — es la única pieza del circuito operativo con integridad real.
        │
        │   InventoryItem/InventoryAdjustment/CatalogItem/ConsumptionRule/Supplier existen en el
        │   backend, con CRUD completo, PERO catalog/inventory/consumption-rules NO están montados
        │   en las rutas (inalcanzables por HTTP); Suppliers SÍ está montado y en uso, aunque sin auditoría.
        │
        │   No existe ningún concepto de "gasto" en todo el repositorio (2 coincidencias irrelevantes
        │   en todo el proyecto, ninguna es código funcional).
        │
        │   No existe ningún mecanismo de cron/job en segundo plano en todo el backend.
        ▼
   [Nunca se llega a "evento completado" ni a "cierre financiero/administrativo"]
        ▼
   [No hay reportes de producción, rentabilidad ni cuentas por cobrar/pagar — no hay dónde leerlos]
```

### Estado por paso del ciclo (1–27 del enunciado)

| # | Paso | Estado real |
|---|---|---|
| 1 | Solicitud pública / lead manual | **Implementado**. `POST /api/public/quick-quote` crea Lead + QuoteRequest (no una Quote directa, corrigiendo una versión anterior documentada). |
| 2 | Calificación de lead | **Implementado** (status, LeadActivity, asignación de responsable). |
| 3 | Detección de cliente existente | **Implementado** (dedupe por email/teléfono normalizado, sin índice único — dedupe es solo aplicativo). |
| 4 | Creación de cliente nuevo | **Implementado**, idempotente. |
| 5 | Creación de presupuesto | **Implementado** (PACKAGE/CUSTOM/HYBRID). |
| 6 | Revisiones de presupuesto | **Implementado** (`QuoteRevision`, snapshot append-only). |
| 7 | Envío de presupuesto | **Parcial** — el status `sent` existe, pero no hay envío real de email de presupuesto documentado en el código auditado en esta pasada (existe generación de PDF; el envío por email de la Quote en sí no fue confirmado como automático). |
| 8 | Aceptación/rechazo | **Implementado** (`accepted/rejected/expired`, sin cron que expire automáticamente). |
| 9 | Conversión a cliente | **Implementado**, idempotente. |
| 10 | Conversión/creación de evento | **Implementado**, idempotente (no duplica evento por reintento). |
| 11 | Reserva de salón y fecha | **Falso implementado** — se guarda `salonId`+`eventDate` en el Event, pero **no hay ningún chequeo que impida dos eventos confirmados en el mismo salón el mismo día.** Esto es una **brecha crítica**. |
| 12 | Creación de contrato | **Implementado**, con checklist de completitud calculado (pero no enforced) y versionado real. |
| 13 | Firma de contrato | **No implementado** — no existe campo `signedAt` en el schema real de Contract (una ruta hace `select()` sobre `sentAt`/`signedAt`, campos que no existen — inconsistencia latente ya detectada). Solo existe `approvedAt` (aprobación interna, no firma del cliente). |
| 14 | Addenda | **Implementado** (workflow completo de aprobación, recalculo de totales). |
| 15 | Plan de pagos | **Parcial** — existe `paymentPlanSnapshot` (blob) con lógica de aplicación de pagos a cuotas, pero es bookkeeping ad-hoc sobre un blob, no un modelo de cuotas propio. |
| 16 | Registro de pagos | **Implementado**, con el riesgo de validación de monto ya señalado. |
| 17 | Entradas de calendario | **Existe el modelo, la creación es 100% manual.** Ninguna automática. |
| 18 | Recordatorios y alertas | **No implementado en la práctica** — el sub-schema de notificación de `CalendarItem` es inerte; nada lo lee ni dispara nada. |
| 19 | Preparación del evento | **Parcial** — existe `resourcePlanSnapshot` con tareas/timeline por defecto, sin validación de schema ni transición de estado real. |
| 20 | Tareas de producción | **Parcial/no estructurado** — mismo blob, `timelineItems[].status` nunca transiciona vía código. |
| 21 | Asignación de personal | **Implementado** (creación, confirmación, cancelación), sin fichaje real, sin detección de solapamiento de turnos. |
| 22 | Asignación de inventario | **Dividido en dos sistemas no relacionados**: `EventTablewareAllocation` (real, con reglas) para vajilla/mantelería de salón, e `InventoryItem`/`InventoryAdjustment` (backend completo, inalcanzable por HTTP, sin ningún vínculo obligatorio a Event). |
| 23 | Gastos | **No implementado. No existe la entidad.** |
| 24 | Ejecución del evento | **No implementado** — no hay ningún registro de "el evento está en curso" ni de incidentes. |
| 25 | Finalización del evento | **No implementado** — no existe estado `completed`. |
| 26 | Cierre financiero | **No implementado como concepto explícito** — el saldo se puede consultar (`paymentSummary`), pero no hay un "cierre" que lo congele o lo audite. |
| 27 | Cierre administrativo | **No implementado.** |
| 28 | Reportes | **No implementado** — no hay pantallas ni agregaciones de reporting; los datos fuente para varios reportes (gastos, producción) ni siquiera existen todavía. |

---

## 3. Mapa del sistema actual

### Aplicaciones y su rol real

| App | Rol | Estado |
|---|---|---|
| `apps/api` | Fuente de verdad de reglas de negocio, precios, permisos, integraciones | Sólido en CRM comercial/contractual/financiero; débil en operación/producción/reportes |
| `apps/web` | Backoffice + sitio público | Sólido en las mismas áreas que el backend; **sin `middleware.ts`**, protección de `/admin` solo client-side |
| `apps/mobile` | Prevista para personal (fichaje, tareas, QR) | **Scaffold vacío**, sin una sola pantalla |
| `packages/shared` | Enums, permisos, esquemas zod comunes | Sólido, bien consumido por api/web, no por mobile |

### Entidades de dominio existentes (módulo `crm`, `apps/api/src/modules/crm/crm.models.ts`)

`Lead`, `LeadActivity`, `QuoteRequest`, `Customer`, `ContactPerson`, `PackageTemplate`, `VenuePackageRule`, `Quote`, `QuoteRevision`, `Event`, `EventStaffAssignment`, `CalendarItem`, `Contract`, `ContractAddendum`, `Payment`, `EventTablewareAllocation` (archivo propio).

### Entidades de operaciones (módulo `operations`, no todas montadas)

`Supplier` (montado, `/suppliers`), `CatalogItem`, `ServiceExtra`, `InventoryItem`, `InventoryAdjustment`, `ConsumptionRule` (estas cuatro **no montadas** — rutas completas pero inalcanzables por HTTP).

### Otras entidades relevantes

`User` (incluye perfil de staff/nómina/asistencia embebido), `SalonStockItem`, `Salon`, `AuditLog`, `Notification`, `SystemSetting`, más los módulos independientes `DigitalInvitation`/`InvitationTemplate`/`InvitationGuest` y `TicketPublication`/`TicketType`/`TicketOrder`/`DigitalTicket`/etc. (correctamente desacoplados de `Event`, no forman parte de este circuito y no deben acoplarse a él).

### Endpoints principales relevantes al circuito (agrupados)

`/api/leads`, `/api/quote-requests`, `/api/quotes` (+ `/packages`), `/api/customers`, `/api/events` (+ `/payments`, `/staff`, `/tableware`, `/create-contract`, `/status`, `/guest-list-link`), `/api/contracts` (+ `/addendums`, `/approve`, `/cancel`, `/pdf`), `/api/payments` (+ `/mark-paid`, `/cancel`, `/refund`, `/summary/contracts/:id`), `/api/calendar-items`, `/api/suppliers` — y, **no montados**: catálogo, inventario, reglas de consumo.

### Páginas principales relevantes (`apps/web/src/app/admin/`)

`leads`, `customers`, `quotes` (+ `requests/[id]`), `events/[id]` (detalle con tabs), `calendar`, `contracts/[id]` (+ `/print`), `payments/[id]`, `staff` (sin entrada de menú), `salons/[id]` (con paquetes embebidos), `suppliers`. **Vacíos/inexistentes:** `catalog`, `inventory`, `consumption-rules`, cualquier pantalla de "gastos" o "cierre de evento".

---

## 4. Brechas críticas — matriz de análisis de gaps

| # | Área | Comportamiento actual | Comportamiento esperado | Brecha | Severidad | Impacto de negocio | Riesgo técnico | Acción recomendada | Archivos/módulos |
|---|---|---|---|---|---|---|---|---|---|
| G1 | Reserva de salón/fecha | Sin ningún chequeo de conflicto | Bloqueo duro (o al menos advertencia) ante doble reserva confirmada | Total | **Crítica** | Doble venta del mismo salón/fecha, pérdida de confianza del cliente | Colisión de datos en producción, imposible de revertir limpiamente | Agregar validación de disponibilidad en creación/transición a `reserved`/`confirmed` + índice de soporte | `apps/api/src/modules/crm/events.routes.ts` |
| G2 | Validación de monto de pago | El backend acepta cualquier `amount` positivo, sin comparar contra el saldo | Validar contra `balanceAmount`/cuota objetivo antes de persistir | Total | **Crítica** | Fraude interno o error humano no detectado, estados financieros no confiables | Corrupción de la única fuente de verdad financiera | Validar `amount` server-side en `createPayment`/`refundPayment`, con override explícito y auditado si se permite exceso | `apps/api/src/modules/crm/payments.service.ts` |
| G3 | Permisos declarados vs. aplicados | `EVENTS_CANCEL`, `EVENTS_DELETE`, `QUOTES_DELETE`, `PAYMENTS_CANCEL` no se usan en ninguna ruta | Cada permiso declarado debe tener un punto de enforcement real | Total | **Alta** | Falsa sensación de control de acceso; un admin puede "revocar" un permiso que no hace nada | Superficie de auditoría de seguridad poco confiable | Alinear rutas con los permisos declarados o eliminar los permisos huérfanos | `packages/shared/src/constants/permissions.ts`, `events.routes.ts`, `quotes.routes.ts`, `payments.routes.ts` |
| G4 | Estado `refunded` de Payment nunca aplicado | `refundPayment()` crea un nuevo Payment `type=refund` pero nunca marca el original como `refunded` | El pago original debería reflejar que fue reembolsado | Inconsistencia de datos | **Media** | Reportes futuros podrían contar mal pagos "reembolsados" si filtran por `status='refunded'` | Bajo, pero corrompe cualquier reporte que confíe en ese status | Setear `original.status = 'refunded'` al crear el refund, o documentar explícitamente que el status no se usa y quitarlo del enum | `apps/api/src/modules/crm/payments.service.ts` |
| G5 | Doble lógica de recálculo de balance | `payments.service.ts` y `event-to-contract.service.ts` recalculan `Contract.balanceAmount` con fórmulas distintas (una re-suma Payments, otra usa `paidAmount` ya almacenado) | Una sola función fuente de verdad para el recálculo | Duplicación con riesgo de divergencia | **Alta** | Saldo mostrado podría quedar desincronizado si se llama una ruta y no la otra | Bug silencioso, difícil de detectar en QA manual | Unificar en una sola función `recalculateContractFinancials()` invocada desde ambos flujos | `payments.service.ts`, `event-to-contract.service.ts` |
| G6 | Catálogo/Inventario/Reglas de consumo no montados | Backend completo, 0% alcanzable por HTTP | Debe decidirse: retomar y montar, o remover código muerto | Desconexión total | **Alta** (bloquea producción/gastos/reportes de costo) | Sin esto no hay forma de planificar/consumir stock real vinculado a un evento | Código sin usar que puede desviar a futuros desarrolladores | Confirmar con el usuario si se retoma; si sí, montar rutas + agregar permisos a `RolePresets` + construir frontend | `apps/api/src/modules/operations/*`, `apps/api/src/routes/index.ts` |
| G7 | Ausencia de motor de tareas programadas | Cero mecanismo de cron/job en todo el backend | Necesario para expirar presupuestos, disparar recordatorios, verificar vencimientos | Falta total de infraestructura | **Alta** | Ningún recordatorio, alerta de vencimiento o expiración automática puede funcionar sin esto | Cualquier feature de "alertas automáticas" quedaría inerte igual que `CalendarItem.notification` hoy | Introducir un mecanismo simple (Vercel Cron + endpoint protegido, o `node-cron` si se despliega fuera de serverless) | Nuevo: `apps/api/src/jobs/` |
| G8 | `CalendarItem` 100% manual pese al diseño para automatización | El enum `source` sugiere auto-generación; el código nunca la implementa | Generar automáticamente entradas de calendario en los eventos clave del ciclo | Funcionalidad diseñada pero no construida | **Alta** | El calendario no refleja obligaciones reales — el objetivo #6 del prompt no se cumple hoy | Riesgo de duplicados si se implementa sin guarda de idempotencia | Implementar generación automática idempotente (ver §8) | `calendar-items.routes.ts` + nuevos triggers en `events.routes.ts`, `contracts.routes.ts`, `payments.service.ts` |
| G9 | Sin estado de "evento completado/cerrado" | El status máximo positivo es `confirmed` | Distinguir cierre operativo / financiero / administrativo | Falta de concepto de dominio completo | **Alta** | Imposible saber si un evento ya pasado está resuelto o tiene pendientes | Sin esto, ningún reporte de "eventos pendientes de cierre" es posible | Extender `Event.status` + agregar campos de cierre (ver §11) | `crm.models.ts`, `events.routes.ts` |
| G10 | `resourcePlanSnapshot` sin schema | Blob `Mixed`, cualquier forma es aceptada, transiciones nunca se aplican vía código | Estructura mínima validada para timeline/tareas/staff/inventario | Riesgo de datos corruptos silenciosos | **Media** | La "planificación de producción" es solo texto libre hoy, no operable | Ningún reporte de producción puede confiar en esta data | Migrar a sub-schemas tipados por partes (ver §7) sin romper snapshots históricos | `crm.models.ts`, `event-resource-plan.ts` |
| G11 | Sin entidad de gastos | No existe en absoluto | Modelo mínimo de gasto estimado/real por evento | Bloquea rentabilidad y reportes financieros | **Alta** (para el objetivo de reportes) | Sin gastos no hay margen, no hay rentabilidad por evento/salón/servicio | Ninguno relevante (feature nueva) | Nueva entidad `Expense` (ver §10) | Nuevo módulo `apps/api/src/modules/operations/` |
| G12 | Cascada de cancelación incompleta | Cancelar un Event solo borra `EventTablewareAllocation`; `CalendarItem`, `EventStaffAssignment`, `Payment` quedan huérfanos | Liberar/actualizar todo lo vinculado al cancelar | Cascada parcial | **Alta** | Recordatorios y asignaciones de personal fantasma para eventos cancelados | Confusión operativa, personal convocado a un evento cancelado | Implementar cascada explícita al transicionar a `cancelled`/`lost` | `events.routes.ts` |
| G13 | Sin motivo obligatorio en casi ninguna cancelación | Solo `Lead.markLost` exige `lostReason` | Motivo + usuario + timestamp + auditoría en toda cancelación/override sensible | Falta de trazabilidad | **Media** | Difícil auditar por qué se canceló un contrato/evento/pago | Bajo técnico, alto en gobernanza | Exigir `reason` en cancelaciones de Event/Contract/Payment | `events.routes.ts`, `contracts.routes.ts` (rutas `/cancel`), `payments.routes.ts` |
| G14 | Doble camino para cancelar contrato | `POST /:id/cancel` (permiso `CONTRACTS_CANCEL`) y `PATCH /:id/status` (permiso `CONTRACTS_UPDATE`) logran lo mismo | Un solo camino, o el mismo permiso en ambos | Bypass de permiso dedicado | **Media** | Un usuario sin `CONTRACTS_CANCEL` puede cancelar igual vía `/status` | Bajo | Bloquear `status=cancelled` en el PATCH genérico; forzar el uso de `/cancel` | `contracts.routes.ts` |
| G15 | Auditoría ausente en el módulo de operaciones | Ni `suppliers.routes.ts` (montado y en uso) ni el resto de operaciones llaman `writeAuditLog` | Toda mutación de proveedores/inventario debe auditarse | Falta puntual | **Media** | Sin trazabilidad de cambios de proveedores o ajustes de stock | Bajo | Agregar `writeAuditLog` a esas rutas | `apps/api/src/modules/operations/*.routes.ts` |
| G16 | Notificaciones solo para creación de QuoteRequest | El servicio genérico `createNotifications` existe pero es código muerto | Notificar también pagos vencidos, staff asignado, contrato pendiente de aprobación, etc. | Cobertura mínima | **Media** | El objetivo de "alertas y recordatorios por rol" no se cumple | Bajo | Reactivar/extender `createNotifications` desde los nuevos triggers de calendario (§8) | `notification.service.ts` |
| G17 | Personal (Staff) sin entrada de navegación | Módulo funcional, invisible en el menú | Visibilidad acorde a lo implementado | Brecha de UX, no técnica | **Baja** | Usuarios podrían no descubrir la función | Ninguno | Agregar entrada de menú | `apps/web/src/lib/admin-permissions.ts` |
| G18 | Doble configuración de Vercel | Raíz vs. `apps/api` casi idénticas | Una sola fuente de configuración de despliegue | Duplicación | **Baja** | Confusión en futuros despliegues | Ninguno si no se toca | Confirmar con el usuario antes de eliminar | `apps/api/vercel.json`, `apps/api/api/[...path].ts` |

---

## 5. Ciclo de vida objetivo (target lifecycle)

El diseño objetivo **no reemplaza ninguna entidad existente**: extiende `Event`, agrega estados y campos donde falta, conecta lo ya construido (catálogo/inventario, calendario) y agrega solo dos piezas genuinamente nuevas: `Expense` y un motor mínimo de tareas programadas.

```
Lead ─┬─> QuoteRequest ─> Quote (+QuoteRevision) ─> [conversión idempotente] ─> Customer + Event
      └─> (alta directa, sin QuoteRequest, ya soportada)

Event
  ├─ al pasar a "reserved"/"confirmed": CHEQUEO DE DISPONIBILIDAD salón+fecha (nuevo, bloqueante)
  ├─ Contract (creado desde Event, versionado) ──> ContractAddendum(s)
  │      └─ cada aprobación de Contract/Addendum ──> genera/actualiza CalendarItem(s) automáticos (nuevo)
  ├─ Payment(s) ──> valida monto contra balance del Contract (nuevo, bloqueante salvo override auditado)
  │      └─ vencimientos de cuota ──> CalendarItem tipo payment_window (nuevo, automático e idempotente)
  ├─ EventStaffAssignment(s) ──> fecha límite de asignación ──> CalendarItem (nuevo, automático)
  ├─ EventProduction (nuevo, estructurado — ver §7) referenciado desde Event, no embebido como blob libre
  │      ├─ ProductionTask(s) con responsable, prioridad, dependencias, evidencia
  │      ├─ Timeline con etapas tipadas (setup/service/main/breakdown/post_event)
  │      └─ Incident(s) estructurados (nuevo, campo mínimo)
  ├─ InventoryItem/InventoryAdjustment (reconectados: rutas montadas) + EventTablewareAllocation
  │      (ambos coexisten: EventTablewareAllocation sigue siendo la reserva día-a-día de vajilla de salón;
  │      InventoryAdjustment pasa a poder registrar consumo real vinculado a `eventId`, ya soportado
  │      por el schema, solo falta exponerlo)
  ├─ Expense(s) (nuevo — ver §10) estimado y real, por categoría configurable
  └─ Closure (nuevo — ver §11): operationalClosedAt / financialClosedAt / administrativeClosedAt,
         cada uno con su propio checklist y override auditado

Cancelación (en cualquier punto): estado de cancelación explícito + motivo obligatorio + cascada real
  sobre CalendarItem/EventStaffAssignment/Payment/InventoryAdjustment vinculados (nuevo)
```

### Decisiones de diseño clave (decision log resumido)

| Problema | Opciones consideradas | Opción elegida | Motivo | Impacto de migración |
|---|---|---|---|---|
| ¿Dónde vive la producción del evento? | (a) Nueva colección `EventProduction` separada; (b) seguir embebida en `Event.resourcePlanSnapshot`; (c) híbrido: entidad `EventProduction` 1:1 con `Event`, con sub-documentos tipados para tareas/timeline | **(c) Híbrido**: entidad propia, referenciada 1:1 desde `Event` | Permite tipar y validar sin inflar el documento `Event` (que ya tiene 8 blobs `Mixed`); mantiene una sola fuente de verdad; evita una nueva colección por cada concepto (tareas, timeline, staff-notes) | Migración de datos: copiar `resourcePlanSnapshot` existente a la nueva estructura con un script `--apply` explícito, igual que el patrón ya usado en `migrateIndependentDigitalModules.ts` |
| ¿Contrato y addenda usan snapshot, referencia o híbrido? | (a) Snapshot puro; (b) referencia viva; (c) híbrido | **(c) Híbrido — ya implementado, se mantiene**: el contrato snapshotea el acuerdo comercial al crearse/versionarse, pero referencia (`ObjectId`) a `ContractAddendum` para cambios posteriores, cada una con su propio snapshot de lo que agrega/quita | Ya es el patrón actual y funciona bien (verificado por tests); no hay razón de negocio para cambiarlo | Ninguno, se preserva tal cual |
| ¿Cómo se relaciona `Payment` con `ContractAddendum`? | (a) Agregar `addendumId` a `Payment`; (b) mantener solo `type: 'addendum'` como etiqueta | **(a) Agregar `addendumId` opcional** | Hoy es imposible saber qué addenda pagó un pago específico — dato pedido explícitamente en el objetivo del prompt ("¿qué pagos corresponden al contrato original y cuáles a addenda?") | Campo nuevo opcional, no rompe pagos existentes (quedan con `addendumId: null` = pertenecen al contrato base) |
| ¿Motor de tareas programadas: cron en biblioteca, o Vercel Cron? | (a) `node-cron`/`node-schedule` embebido en el proceso Express; (b) Vercel Cron Jobs (`vercel.json` `crons`) llamando a un endpoint protegido; (c) servicio externo (Redis/BullMQ) | **(b) Vercel Cron** | El proyecto ya despliega en Vercel serverless; un proceso persistente con `node-cron` no sobrevive entre invocaciones serverless (se perdería el timer a cada cold start). Vercel Cron es la opción nativa y ya coherente con la infraestructura elegida | Ninguno: es aditivo, un nuevo endpoint + una entrada en `vercel.json` |
| ¿Cómo se modela el "cierre" del evento? | (a) Un único status final `completed`; (b) tres booleanos/timestamps independientes (operativo/financiero/administrativo) con checklist propio cada uno | **(b) Tres cierres independientes** | El propio prompt exige distinguir "operacionalmente completado" de "financieramente cerrado" de "administrativamente cerrado" — colapsarlo en un solo status perdería esa información y forzaría a que todo pase junto, cuando en la práctica el evento puede estar operativamente listo con saldo pendiente | Aditivo: nuevos campos en `Event`, sin tocar el enum de `status` existente (ver §7) |
| ¿Los gastos son una colección nueva o se embeben en Event? | (a) Colección `Expense` propia; (b) array embebido en `Event` | **(a) Colección propia** | Necesita su propio ciclo de vida (aprobación, adjuntos, proveedor, cancelación) y debe poder reportarse cruzando salón/categoría/proveedor sin recorrer todos los eventos — coherente con cómo ya se modeló `Payment` (colección propia, no embebida) | Feature nueva, sin migración de datos existentes |

---

## 6. Modelo de dominio propuesto (extensiones, no reemplazos)

**No se crean entidades nuevas cuando una existente puede extenderse de forma segura**, según lo pedido. Resumen de cambios por entidad:

### Extender `Event` (no reemplazar)
Agregar (todos opcionales, no rompen documentos existentes):
- `operationalClosedAt: Date`, `operationalClosedBy: ObjectId<User>`
- `financialClosedAt: Date`, `financialClosedBy: ObjectId<User>`
- `administrativeClosedAt: Date`, `administrativeClosedBy: ObjectId<User>`
- `cancellationReason: String`, `cancelledAt: Date`, `cancelledBy: ObjectId<User>` (hoy no existen; la cancelación solo cambia `status`)
- `productionId: ObjectId<EventProduction>` (referencia 1:1 a la nueva entidad, ver abajo)
- Índice nuevo de soporte para disponibilidad: `{ salonId: 1, eventDate: 1, status: 1 }` (no único — el chequeo de conflicto es lógico, no de integridad de BD, porque conviene poder registrar eventos "draft" superpuestos mientras se cotiza, y solo bloquear en `reserved`/`confirmed`)

### Nueva entidad `EventProduction` (1:1 con Event, reemplaza el uso de `resourcePlanSnapshot` como fuente operativa — el snapshot legado se conserva de solo lectura para no perder historial)
```
EventProduction {
  eventId: ObjectId<Event>  // unique
  timeline: [{ stage: enum('setup','service','main','breakdown','post_event'), title, plannedStart, plannedEnd, actualStart, actualEnd, status: enum('pending','in_progress','done','skipped'), owner: ObjectId<User>, notes }]
  tasks: [ProductionTask]  // ver abajo, referenciadas o embebidas — embebidas por simplicidad (no necesitan query independiente)
  staffNotes: [{ userId, note, createdAt }]
  incidents: [{ reportedBy: ObjectId<User>, reportedAt: Date, category: String, description: String, severity: enum('low','medium','high'), resolved: Boolean, resolvedAt: Date }]
  logistics: { setupNotes, kitchenNotes, barNotes, decorationNotes, accessNotes, riskNotes }  // se preserva tal cual, es texto libre útil
  status: enum('planning','ready','in_progress','completed')
  ...base (createdBy/updatedBy/deletedAt/deletedBy)
}

ProductionTask (embebida en EventProduction.tasks) {
  _id, title, category: String (configurable, no hardcoded — reutiliza el patrón de "categoría libre validada contra una lista configurable" ya usado en SupplierCategory),
  responsibleUserId: ObjectId<User>, dueDate: Date, priority: enum('low','normal','high','critical'),
  dependsOnTaskId: ObjectId (referencia a otra tarea del mismo array, opcional),
  status: enum('pending','in_progress','blocked','done','cancelled'),
  completionEvidence: { note: String, attachmentId: ObjectId<FileAttachment> },
  completedAt: Date, completedBy: ObjectId<User>
}
```
Por qué 1:1 separado y no embebido en `Event`: `Event` ya tiene 8 campos `Mixed` — agregar la estructura tipada ahí perpetuaría el problema. Por qué no una colección por sub-concepto (tareas, timeline, incidentes como colecciones separadas): el volumen por evento es pequeño (decenas de tareas, no miles), no hay necesidad de paginar/query independiente de las tareas de un evento aislado del resto de `EventProduction` — embeber dentro de la entidad de producción es coherente con el principio de "no introducir abstracciones innecesarias".

### Nueva entidad `Expense`
```
Expense {
  eventId: ObjectId<Event>  // required
  salonId: ObjectId<Salon>  // required, para reportes por salón sin necesidad de populate
  category: ObjectId<ExpenseCategory>  // ver abajo — configurable, no hardcodeada
  supplierId: ObjectId<Supplier>  // opcional
  description: String
  estimatedAmount: Number
  actualAmount: Number
  status: enum('estimated','committed','paid','cancelled')
  dueDate: Date, paidDate: Date
  receiptAttachmentId: ObjectId<FileAttachment>  // reutiliza el mecanismo de adjuntos ya existente (Cloudinary)
  responsibleUserId: ObjectId<User>
  notes: String
  cancellationReason: String  // requerido si status=cancelled
  ...base
}

ExpenseCategory {  // catálogo configurable, no enum hardcodeado — coherente con "no hardcodear categorías si el proyecto ya tiene categorías configurables"
  name: String, active: Boolean, ...base
}
```
Se reutiliza `Supplier` ya existente (no se crea un segundo concepto de proveedor). El adjunto de comprobante reutiliza el servicio de Cloudinary ya construido (`modules/uploads`), no una integración nueva.

### Extender `Payment`
- Agregar `addendumId: ObjectId<ContractAddendum>` (opcional — `null` = pertenece al contrato base).
- Corregir: aplicar `status: 'refunded'` al Payment original dentro de `refundPayment()` (no es un campo nuevo, es arreglar el uso del campo existente).
- Agregar `approvedAmountAtCreation: Number` (snapshot del `balanceAmount` del contrato al momento de crear el pago) — permite auditar después "cuál era el saldo cuando se registró este pago", sin depender de recalcularlo desde el estado actual.

### Extender `Contract`
- Agregar `signedAt: Date`, `signedByCustomerName: String` (o vínculo a un `ContractAttachment` con el documento firmado) para cerrar la brecha ya detectada (la ruta actual selecciona un campo `signedAt` que no existe).
- Agregar `cancellationReason: String` (hoy `cancelledAt` existe pero sin motivo).

### Extender `CalendarItem`
- Sin cambios de schema — el modelo ya soporta todo lo necesario (`source: 'event'|'payment'|'contract'|'system'`, links a todas las entidades relevantes). El trabajo es **de servicio, no de modelo**: construir los generadores automáticos (ver §8) y un campo de deduplicación operativo: usar una clave lógica `(source, sourceEntityId, type)` para chequear existencia antes de crear (no requiere índice único en BD si se prefiere flexibilidad, pero se recomienda agregar un índice único parcial `{ eventId: 1, type: 1, source: 1 }` con `partialFilterExpression: { source: { $ne: 'manual' } }` para blindar la idempotencia a nivel de base de datos, no solo de aplicación).

### Conectar (no rediseñar) `InventoryItem`/`InventoryAdjustment`/`CatalogItem`/`ConsumptionRule`
- Montar las tres rutas huérfanas en `apps/api/src/routes/index.ts`.
- Agregar los permisos `CATALOG_*`, `INVENTORY_*`, `CONSUMPTION_RULES_*` a los `RolePresets` de `MANAGER`/`SALON_MANAGER` según corresponda (hoy solo `ADMIN` los tendría por defecto).
- Agregar `writeAuditLog` a las cuatro rutas de operaciones (incluida `suppliers`, que ya está montada pero sin auditoría).
- No fusionar `InventoryAdjustment` con `EventTablewareAllocation`: son conceptualmente distintos (stock de salón día-a-día vs. consumo/merma de insumos) y ya funcionan bien separados — solo se pide conectar el segundo (`InventoryAdjustment.eventId` ya existe en el schema) a la UI y a la API real.

---

## 7. Máquinas de estado

### Lead
```
new → contacted → follow_up → quote_sent → negotiation → won
                                                       └─→ lost (requiere lostReason)
new/contacted/... → converted (efecto lateral de convertir un Quote asociado a Event)
```
Sin cambios propuestos — funciona.

### Quote
```
draft → sent → accepted → converted
             └→ rejected
             └→ expired  (HOY: manual únicamente. PROPUESTO: job programado lo marca automáticamente
                          al vencer `validUntil`, ver §8)
```

### Contract
```
draft → pending_approval → approved → [cancelled | superseded (nueva versión) | requires_changes → pending_approval]
                                    └→ cancelled (requiere cancellationReason — NUEVO campo obligatorio)
PROPUESTO: approved → signed (nuevo estado intermedio opcional, ver Preguntas §15 — depende de si el
           negocio realmente usa firma formal o solo aprobación interna, no queda claro en el repo)
```

### ContractAddendum
```
draft → pending_approval → approved (recalcula Contract.totalAmount)
                         └→ rejected
                         └→ cancelled
```
Sin cambios — funciona, con test coverage real.

### Payment (obligación financiera)
```
pending → paid → [refunded (NUEVO: se aplica de verdad al original) | cancelled]
Refund independiente: crea un Payment nuevo type='refund', status='paid', referencia al original.
PROPUESTO: agregar validación de amount contra balance antes de pending→creación,
           y contra el pago original en el caso de refund.
```

### Event
```
draft → quoted → contract_draft → deposit_pending → reserved → confirmed
                                                              └→ cancelled (requiere reason — NUEVO)
                                                              └→ lost (requiere reason — NUEVO)
NUEVO (no reemplaza status, son campos de cierre independientes aplicables solo desde confirmed):
  confirmed + fecha pasada + checklist operativo OK → operationalClosedAt seteado
  operationalClosedAt seteado + balanceAmount == 0 (o override auditado) → financialClosedAt seteado
  financialClosedAt seteado + revisión administrativa → administrativeClosedAt seteado
  Cualquier cierre puede saltearse con permiso elevado + reason obligatorio + auditoría (ver §11)
```
Se elige **no** agregar `completed` al enum `status` para no invalidar toda la lógica existente que trata `confirmed` como el estado operativo positivo final (incluida la generación de contrato, que asume que un evento "vivo" nunca pasa de `confirmed`). En su lugar, el cierre es un conjunto de marcas de tiempo independientes sobre el mismo `status: confirmed` — most fiel al pedido explícito de distinguir cierre operativo/financiero/administrativo sin colapsarlos en un único status.

### EventProduction (nuevo)
```
planning → ready → in_progress → completed
```

### ProductionTask (nuevo, dentro de EventProduction)
```
pending → in_progress → done
                      └→ blocked (requiere dependsOnTaskId sin resolver, o motivo manual)
        → cancelled
```

### Expense (nuevo)
```
estimated → committed → paid
                       └→ cancelled (requiere cancellationReason)
```

### Cancelación (transversal)
```
Cualquier entidad cancelable: [estado activo] → cancelled
  - requiere reason (NUEVO, hoy solo Lead.markLost lo exige)
  - requiere permiso específico (NUEVO donde hoy se usa el permiso de update genérico — G3/G14)
  - dispara cascada explícita sobre entidades vinculadas (NUEVO — G12)
  - escribe AuditLog (YA EXISTE en la mayoría de los casos)
```

---

## 8. Arquitectura de calendario, alertas y recordatorios

**Diagnóstico**: el modelo de datos (`CalendarItem` + `calendarNotificationSchema`) ya está bien diseñado para lo que se pide — el problema es 100% de ausencia de disparadores, no de modelo.

### Generadores automáticos propuestos (todos idempotentes por clave lógica `(eventId|contractId|paymentId, type, source)`)

| Entrada de calendario | Disparador | Automática/manual | Bloqueante | Rol destinatario |
|---|---|---|---|---|
| Reserva tentativa de salón | `Event` creado con `salonId`+`eventDate` | Automática | Informativa | `SALON_MANAGER` del salón |
| Reserva confirmada | `Event.status → confirmed` | Automática | Informativa | `SALON_MANAGER`, `ADMIN` |
| Vencimiento de firma de contrato | `Contract.status → pending_approval` (+X días configurables) | Automática | Bloqueante para pasar a `deposit_pending` sin contrato aprobado (ya implícito hoy vía `contractReadyChecklist`, ahora enforced) | `MANAGER` responsable |
| Vencimiento de seña | `Contract.status → approved` (crea entrada `payment_window` con `dueDate` de la seña, tomado de `paymentPlanSnapshot`) | Automática | Informativa (con escalado a alerta si vence, ver abajo) | `ADMIN`/`ACCOUNTING`-equivalente |
| Vencimiento de cuotas | Cada cuota de `paymentPlanSnapshot` | Automática | Informativa | Responsable del cliente |
| Vencimiento de saldo final | Igual mecanismo, cuota final | Automática | Bloqueante para `financialClosedAt` si no se resolvió (ver §11) | Responsable + `ADMIN` |
| Seguimiento comercial | `Lead.status` sin cambios por N días (job programado) | Automática | Informativa | Responsable asignado |
| Confirmación de menú final | X días antes de `eventDate` (configurable por salón) | Automática | Informativa, escala a alerta si no se marca `done` | Coordinador del salón |
| Conteo final de invitados | X días antes de `eventDate` | Automática | Igual que arriba | Coordinador |
| Fecha límite de asignación de personal | X días antes de `eventDate`, si `EventStaffAssignment` requerido sin cubrir | Automática | Alerta si no se cubre | `SALON_MANAGER` |
| Preparación de inventario | Vinculada a `EventProduction.tasks` con categoría `inventory` | Automática (al crear `EventProduction`) | Informativa | Coordinador |
| Coordinación con proveedores | Vinculada a `Expense`/`Supplier` con `dueDate` | Automática | Informativa | Responsable de compras |
| Reunión de producción | Manual (no todo evento la necesita) | Manual | — | Quien la cree |
| Preparación de salón | Generada desde `EventProduction.timeline` etapa `setup` | Automática | Informativa | Staff asignado |
| Inicio/fin del evento | `Event.eventDate`+`startTime`/`endTime` | Automática | Informativa | Todos los asignados |
| Devolución de inventario post-evento | X horas después de `endTime` | Automática | Bloqueante para `operationalClosedAt` si no se marca `done` | Coordinador |
| Seguimiento de saldo pendiente | Si `financialClosedAt` no se logra en fecha, escalar a alerta `critical` | Automática (vía job) | Informativa (con escalado) | `ADMIN` |
| Cierre administrativo | Al lograr `financialClosedAt`, crear tarea de revisión final | Automática | Bloqueante para `administrativeClosedAt` | `ADMIN`/`MANAGER` |

### Reglas de sincronización

- **Cambio de fecha del evento**: todas las `CalendarItem` con `source='event'` y `eventId` igual deben recalcular `startAt`/`endAt` (update, no recreate) — evita duplicados y preserva el historial de `notification.lastSentAt`.
- **Cambio de cuota (addendum aprobada, pago adelantado, etc.)**: las entradas `payment_window` vinculadas a `paymentId`/`contractId` se recalculan o se marcan `cancelled` + se crea la nueva si el monto/fecha cambió sustancialmente (no un simple update, porque el histórico de "se avisó tarde" importa para auditoría).
- **Cancelación del evento**: **cascada obligatoria** (hoy ausente, G12) — todas las `CalendarItem` con `eventId` igual y `status` no terminal pasan a `cancelled`; todas las `EventStaffAssignment` no terminales pasan a `cancelled` (con notificación al staff); `EventTablewareAllocation` ya se borra (comportamiento actual, se mantiene); los `Payment` **no se cancelan automáticamente** (una cancelación de evento no implica que el dinero ya cobrado se devuelva solo — eso requiere una decisión humana explícita de reembolso, coherente con no destruir información financiera).
- **Adenda que modifica el contrato**: genera una nueva `CalendarItem` de vencimiento si la adenda agrega una cuota nueva; no se tocan las cuotas ya vencidas/pagadas.

### Motor de disparo — la pieza de infraestructura genuinamente nueva

Un único endpoint interno protegido (p. ej. `POST /api/internal/calendar-tick`, autenticado por un secreto en variable de entorno, no por sesión de usuario) invocado por **Vercel Cron** (entrada `crons` en `vercel.json`, ejecutando cada N minutos/horas — suficiente para un negocio de eventos, no se necesita granularidad de segundos). Ese endpoint:
1. Recorre `CalendarItem` con `notification.enabled=true`, `notification.status='pending'|'scheduled'` y `notification.sendAt <= now`.
2. Envía por los canales configurados (`system` = crea `Notification`; `email` = reutiliza `email.service.ts` ya existente; `whatsapp` = fuera de alcance real hoy, se deja como `channels` aceptado pero no implementado hasta que exista una integración real — **no simular un envío de WhatsApp que no ocurre**).
3. Marca `notification.status='sent'`, `notification.lastSentAt=now`.
4. Corre además las reglas de auto-generación de la tabla de arriba (crear entradas nuevas cuando corresponda) y la expiración automática de `Quote.status='expired'`.

Esto es deliberadamente el único componente nuevo de infraestructura de todo el plan.

---

## 9. Arquitectura contractual y financiera

### Decisión ya tomada por el código (se preserva): snapshot + referencia híbrida
El contrato snapshotea el acuerdo comercial (`crm.models.ts`), y las addenda son documentos propios referenciados por `contractId`, cada una con su propio `totalAmount` que se suma al total del contrato solo cuando `status='approved'`. Esto **ya cumple** el requisito de "no sobrescribir silenciosamente información contractual firmada": cada cambio posterior a la aprobación genera una nueva versión de contrato (`supersedesContractId`) o una addenda, nunca una edición en el lugar del contrato aprobado (confirmado en el código: `PATCH /events/:id` crea una nueva versión de Contract si el contrato existente ya está `approved`).

### Mecanismo financiero — mantener el patrón de "recompute desde el origen," reparando los defectos puntuales

Se mantiene la decisión arquitectónica actual: **no** materializar un ledger de doble entrada ni introducir un motor de contabilidad — es una sobre-ingeniería para el volumen de este negocio. Se preserva `Contract.paidAmount`/`balanceAmount` como campos cacheados, recalculados por una única función (unificando G5) a partir de la suma de `Payment` en cada mutación relevante. Se agrega:

1. **Validación de monto contra saldo** (cierra G2): antes de crear un `Payment` con `affectsContractBalance=true`, comparar `amount` contra `contract.balanceAmount` (o el remanente de la cuota apuntada en `paymentPlanSnapshot`). Si excede, **rechazar por defecto**; permitir el exceso solo con un flag explícito `allowOverpayment: true` que requiera un permiso elevado (`PAYMENTS_APPROVE`, no el genérico `PAYMENTS_CREATE`) y quede registrado en auditoría con el motivo. Esto no es "no permitir nunca sobrepago" (un cliente puede pagar de más por error o por adelantar la siguiente cuota) — es forzar que sea una decisión explícita y trazable, no un descuido silencioso.
2. **`addendumId` opcional en Payment** (cierra la pregunta explícita del prompt sobre "qué pagos corresponden a la addenda vs. al contrato base").
3. **Aplicar `status='refunded'` al pago original** en `refundPayment()` (cierra G4).
4. **Depósito de garantía (`security_deposit`)**: hoy excluido del balance por defecto, pero sin ningún vínculo a la devolución al cierre del evento. Se agrega una tarea automática de calendario "revisar devolución de depósito de garantía" al alcanzar `operationalClosedAt`, y se bloquea `financialClosedAt` si existe un `security_deposit` pagado sin un `refund` (o una decisión explícita de "se retiene por daños", registrada como nota auditada) vinculado.
5. **Unificar el recálculo** (cierra G5): una sola función `recalculateContractFinancials(contractId)` invocada tanto desde el flujo de pagos como desde el flujo de aprobación de addenda, que primero recalcula `totalAmount` (base + addenda aprobadas − descuentos) y luego `paidAmount`/`balanceAmount` (suma de pagos) en una sola pasada.

### Mercado Pago en el circuito comercial
Hoy Mercado Pago **no** está integrado en `Payment` (CRM) — solo en el módulo de entradas digitales. Se documenta como decisión consciente **no** extenderlo automáticamente al circuito de contratos en esta fase: el objetivo del prompt es cerrar el ciclo operativo, y agregar un gateway de cobro real a pagos de contrato es un cambio de alcance mayor (webhooks, conciliación, reversos) que debería tratarse como una fase explícita posterior si el negocio lo pide, no colarse como efecto secundario de esta auditoría.

---

## 10. Arquitectura de producción y gastos

Ver modelo completo en §6. Puntos de integración:

- `EventProduction` se crea automáticamente (1:1, idempotente) en el mismo momento en que se crea el `Event` (tanto por conversión de quote como por creación directa), sembrada con las mismas tareas/timeline por defecto que hoy pobla `buildInitialResourcePlan()` — se reutiliza esa lógica, solo se muda el destino de un blob `Mixed` a la nueva entidad tipada.
- `resourcePlanSnapshot` en `Event` **se conserva** de solo lectura (no se borra retroactivamente) para no perder el historial de eventos ya creados; nuevas escrituras van a `EventProduction`.
- `Expense.category` usa el catálogo configurable `ExpenseCategory` (no un enum hardcodeado), sembrado inicialmente con las categorías de ejemplo del prompt (Comida, Bebidas, Personal, Proveedores externos, Decoración, Entretenimiento, Limpieza, Transporte, Mantenimiento, Gastos de salón, Impuestos, Otros) pero editable desde el backoffice — igual patrón que `SupplierCategory`/`SystemSetting`.
- `Expense.supplierId` reutiliza `Supplier` ya existente; **no** se automatiza la generación de una orden de compra (fuera de alcance, coincide con el gap ya documentado en `docs/OPERATIONS_CATALOG_MODULE.md`: "no se automatiza compra a proveedor").
- El consumo real de inventario (`InventoryAdjustment` con `eventId`) se conecta a `EventProduction.tasks` de categoría `inventory`: al marcar una tarea de "retiro de insumos" como `done`, el formulario permite (no obliga) registrar los `InventoryAdjustment` correspondientes — mantiene la separación ya existente entre `EventTablewareAllocation` (reserva de vajilla de salón) e `InventoryAdjustment` (consumo/merma de insumos), sin fusionarlas.

---

## 11. Arquitectura de cierre y finalización del evento

Checklist propuesto (todas las condiciones son **verificables por consulta**, no por un flag manual sin sustento):

**Cierre operativo** (`operationalClosedAt`):
- `EventProduction.status = 'completed'` (todas las tareas no bloqueantes `done` o `cancelled`).
- Todas las `EventStaffAssignment` no canceladas están en `completed`.
- `EventTablewareAllocation` del evento fue liberada o confirmada como devuelta (nuevo campo `returnedAt` en la asignación, o simplemente su eliminación al cierre — a decidir con el usuario, ver §15).
- Incidentes reportados (`EventProduction.incidents`) están todos `resolved=true` o explícitamente aceptados como no bloqueantes.
- Conteo final de invitados registrado (`Event.guestCount` actualizado o campo nuevo `finalGuestCount`).

**Cierre financiero** (`financialClosedAt`, requiere `operationalClosedAt` previo):
- `Contract.balanceAmount <= 0` (o excepción auditada explícita).
- Todo `security_deposit` pagado tiene su `refund` vinculado o una nota de retención auditada.
- Todos los `Expense` del evento están en `paid` o `cancelled` (ninguno en `estimated`/`committed` sin resolver).

**Cierre administrativo** (`administrativeClosedAt`, requiere `financialClosedAt` previo):
- Contrato y addenda están adjuntos/accesibles (ya lo están por diseño, es una verificación, no una acción).
- Comprobantes de pago adjuntos (`Payment.receiptPdfUrl` presente en los pagos relevantes).
- Notas finales registradas (campo libre).
- Aprobación explícita de un usuario con permiso `EVENTS_CLOSE` (nuevo permiso, distinto de `EVENTS_UPDATE`, para no repetir el patrón de permisos declarados-pero-no-usados).

### Mecanismo de override
Cualquier condición puede saltearse, pero **nunca en silencio**:
```
POST /api/events/:id/close/{operational|financial|administrative}
  body: { force: boolean, reason: string }  // reason obligatorio SIEMPRE, incluso sin force
  - si !force y el checklist falla → 422 con el detalle de qué falta
  - si force=true → requiere permiso EVENTS_CLOSE_OVERRIDE (nuevo, distinto del cierre normal)
  - siempre: writeAuditLog con metadata = { checklistSnapshot, force, reason }
```
Esto responde directamente al pedido del prompt: "cada override debe requerir permiso, motivo, usuario, timestamp y entrada de auditoría" — reutilizando el mecanismo de auditoría ya existente (`writeAuditLog`), sin inventar uno nuevo.

Un evento con checklist incompleto **no se elimina ni se oculta** — aparece en un reporte "eventos pendientes de cierre" (§12), que es justamente uno de los reportes pedidos.

---

## 12. Análisis de preparación para reportes (reporting-readiness)

| Reporte | Datos requeridos | Fuente actual | Falta | Confiabilidad hoy | Fase recomendada |
|---|---|---|---|---|---|
| Leads por origen | `Lead.source` | Existe | — | Alta | Ya reportable hoy (falta solo la pantalla) |
| Tasa de conversión | `Lead.status`, `convertedEventId` | Existe | — | Alta | Ya reportable hoy |
| Presupuestos aceptados/rechazados | `Quote.status` | Existe | — | Alta | Ya reportable hoy |
| Ingreso contratado | `Contract.totalAmount` | Existe | Corregir doble lógica de recálculo (G5) primero | Media | Fase 6 |
| Ingreso cobrado | `Payment` (paid, no refund) | Existe | Validación de monto (G2) primero, o los números no son confiables | Media | Fase 6 |
| Saldos pendientes | `Contract.balanceAmount` | Existe | Igual que arriba | Media | Fase 6 |
| Eventos por mes/salón/tipo | `Event.eventDate/salonId/eventType` | Existe | — | Alta | Reportable hoy |
| Estado de producción | `EventProduction.status`/tareas | **No existe hoy** | Construir la entidad (§6) | Nula | Fase 8 |
| Horas de personal | `EventStaffAssignment.shiftStart/End` + asistencia real | Parcial (sin fichaje real) | Fichaje real (móvil, fase 13) o al menos horas planificadas vs. reales | Baja | Fase 9 / 13 |
| Uso de inventario | `InventoryAdjustment` | Existe pero inalcanzable (G6) | Montar rutas + UI | Nula hasta conectar | Fase 9 |
| Gasto estimado vs. real | `Expense` | **No existe** | Construir la entidad (§10) | Nula | Fase 10 |
| Rentabilidad por evento/salón/servicio | Ingreso cobrado − gasto real | Depende de las dos filas anteriores | Ambas primero | Nula | Fase 12, después de 6/9/10 |
| Eventos cancelados | `Event.status='cancelled'/'lost'` | Existe | Agregar `cancellationReason` (G13) para que el reporte sea útil, no solo un conteo | Media | Fase 11 |
| Eventos pendientes de cierre operativo/financiero | Cierre (§11) | **No existe** | Construir cierre | Nula | Fase 11 |
| Cuentas por cobrar | `Contract.balanceAmount` con `dueDate` vencido | Parcial (`paymentSummary.overdueAmount` ya calcula esto) | Ya casi listo, exponer en un reporte | Media-Alta | Fase 6/12 |
| Cuentas por pagar | `Expense` con `dueDate` vencido | **No existe** | Depende de Expense | Nula | Fase 12 |

**Conclusión**: no iniciar ninguna pantalla de reportes antes de la Fase 12. Los reportes puramente comerciales (leads, conversión, presupuestos) podrían adelantarse porque sus datos ya son confiables, pero se recomienda esperar a que la Fase 6 (financiero) esté cerrada para no tener que rehacer el mismo dashboard dos veces.

---

## 13. Plan de implementación por fases

Cada fase es desplegable de forma independiente y no rompe lo anterior. Se respeta la secuencia sugerida en el prompt, ajustada a los hallazgos reales.

### Fase 1 — Auditoría y documentación (esta entrega)
Ya completada: este documento + `docs/MYM_EVENTOS_PROJECT_CONTEXT.md`. Sin cambios de código.

### Fase 2 — Normalización de estados e integridad financiera (la más urgente, no requiere features nuevas)
- **Objetivo**: cerrar G2, G3, G4, G5, G14 sin agregar ninguna funcionalidad nueva.
- **Archivos a modificar**: `payments.service.ts`, `event-to-contract.service.ts`, `payments.routes.ts`, `events.routes.ts`, `quotes.routes.ts`, `contracts.routes.ts`, `packages/shared/src/constants/permissions.ts` (solo para alinear, no para agregar permisos nuevos).
- **Cambios de BD**: ninguno estructural; agregar índice de soporte opcional.
- **Tests**: nuevos tests unitarios de `recalculateContractFinancials` unificada; test de rechazo de pago que excede el saldo; test de refund que marca `status='refunded'` en el original; test de que `PATCH /contracts/:id/status` con `status=cancelled` sea rechazado (forzando `/cancel`).
- **Riesgo**: bajo — es reparación de lógica existente, no schema nuevo.
- **Criterio de aceptación**: los tests de `payments-service.test.ts` siguen pasando + los nuevos casos (sobrepago rechazado, refund marca el original) pasan.
- **Rollback**: revertir el commit; no hay migración de datos que deshacer.

### Fase 3 — Ciclo Lead/Customer/Quote (ya sólido — solo cerrar brechas puntuales)
- **Objetivo**: agregar índice único de soporte para dedupe (opcional, a confirmar con el usuario si se desea forzar unicidad a nivel de BD o mantenerlo solo aplicativo), exponer `Quote.status='expired'` automático (depende del motor de cron de la Fase 7 — puede diferirse).
- **Riesgo**: bajo.

### Fase 4 — Conversión Quote→Event (ya implementada e idempotente)
- **Objetivo**: agregar el chequeo de disponibilidad de salón/fecha (G1) en el momento de transicionar a `reserved`/`confirmed` (no en `draft`/`quoted`, para no bloquear cotizaciones especulativas superpuestas).
- **Archivos**: `events.routes.ts` (función de transición de status).
- **BD**: agregar índice `{ salonId: 1, eventDate: 1, status: 1 }` (no único).
- **Tests**: dos eventos `confirmed` en el mismo salón/fecha → el segundo debe rechazarse con un código de error claro; un evento `draft` no bloquea a otro.
- **Riesgo**: medio — requiere decidir con el usuario si el bloqueo es solo por día completo o por franja horaria (`startTime`/`endTime`) dado que un salón podría, en teoría, alojar dos eventos chicos el mismo día en turnos distintos. **Ver pregunta en §15.**

### Fase 5 — Ciclo de Contrato y Addenda (ya sólido — cerrar G13/G14, agregar `signedAt`)
- **Objetivo**: motivo obligatorio en cancelación de contrato; unificar el camino de cancelación; agregar campo de firma si el negocio lo requiere (pendiente de confirmar, §15).
- **Riesgo**: bajo.

### Fase 6 — Obligaciones financieras y reconciliación de pagos
- **Objetivo**: `addendumId` en Payment; devolución de depósito de garantía vinculada al cierre (placeholder hasta Fase 11); exponer `paymentSummary` enriquecido para reportes.
- **BD**: campo nuevo opcional en `Payment`, sin migración de datos existentes necesaria.
- **Tests**: pago vinculado a una addenda específica se refleja correctamente en un futuro desglose "pagos del contrato base vs. pagos de addenda".
- **Riesgo**: bajo.

### Fase 7 — Calendario, recordatorios y tareas (la pieza de infraestructura nueva)
- **Objetivo**: implementar el motor de cron (Vercel Cron + endpoint interno protegido) y los generadores automáticos idempotentes de `CalendarItem` (tabla completa en §8).
- **Archivos nuevos**: `apps/api/src/jobs/calendar-tick.ts` (o similar), endpoint `internal.routes.ts`.
- **BD**: índice único parcial nuevo en `CalendarItem` (idempotencia).
- **Config**: `vercel.json` → `crons`, nueva variable de entorno `INTERNAL_CRON_SECRET`.
- **Tests**: ejecutar el tick dos veces seguidas sobre el mismo estado no debe duplicar entradas; cambiar la fecha de un evento actualiza (no duplica) sus `CalendarItem`.
- **Riesgo**: medio-alto — es la única infraestructura genuinamente nueva; probar exhaustivamente la idempotencia antes de habilitar en producción.

### Fase 8 — Planificación de producción
- **Objetivo**: crear `EventProduction`, migrar la siembra inicial desde `buildInitialResourcePlan()`, exponer CRUD de tareas/timeline/incidentes, conectar a la UI (`apps/web/src/features/events/event-operations.tsx`, hoy consumidor del blob libre).
- **BD**: nueva colección; script de migración **opcional** para eventos existentes (copiar `resourcePlanSnapshot` legado a la nueva estructura, en modo simulación por defecto, con `--apply` explícito — mismo patrón que `migrateIndependentDigitalModules.ts`).
- **Frontend**: reemplazar el editor de blob libre por formularios tipados.
- **Riesgo**: medio — toca una pantalla ya en uso; requiere convivir con datos legados durante la transición.

### Fase 9 — Personal e inventario
- **Objetivo**: montar `catalog.routes.ts`, `inventory.routes.ts`, `consumption-rules.routes.ts`; agregar permisos a `RolePresets`; agregar auditoría a las cuatro rutas de operaciones; construir las pantallas `admin/catalog`, `admin/inventory`, `admin/consumption-rules` (hoy carpetas vacías); conectar `InventoryAdjustment.eventId` a `EventProduction.tasks`.
- **Riesgo**: bajo técnico, pero **requiere confirmación del usuario** (G6) antes de invertir en frontend — podría ser código abandonado a propósito.

### Fase 10 — Gastos
- **Objetivo**: crear `Expense`/`ExpenseCategory`, CRUD + adjunto de comprobante (reutilizando Cloudinary), vínculo a `Supplier`, pantalla nueva en `admin/events/[id]` (tab de gastos) y opcionalmente un listado global `admin/expenses`.
- **Riesgo**: bajo — feature aditiva, sin dependencias de otras fases salvo Fase 9 si se quiere vincular gasto↔consumo de inventario.

### Fase 11 — Cierre y finalización del evento
- **Objetivo**: implementar `operationalClosedAt`/`financialClosedAt`/`administrativeClosedAt`, el checklist de cada uno, el mecanismo de override auditado, el nuevo permiso `EVENTS_CLOSE`/`EVENTS_CLOSE_OVERRIDE`, y la cascada de cancelación completa (G12) sobre `CalendarItem`/`EventStaffAssignment`.
- **Riesgo**: medio — depende de que Fases 6, 8 y 10 ya existan (el checklist los referencia).

### Fase 12 — Agregación lista para reportes
- **Objetivo**: construir las pantallas de reporte de la tabla en §12, ahora que los datos fuente son confiables.
- **Riesgo**: bajo, es solo lectura/agregación; usar pipelines de agregación de Mongo aquí sí se justifica (a diferencia del cálculo de balance, que se mantiene simple por su bajo volumen por contrato) porque los reportes agregan sobre todos los eventos/pagos/gastos de un período.

### Fase 13 — Integración móvil
- **Objetivo**: construir `apps/mobile` desde cero (hoy es un scaffold vacío) para: ver asignaciones de `EventStaffAssignment`, ver tareas de `EventProduction` asignadas al usuario, marcar tareas como completadas con evidencia (foto), reportar incidentes, registrar entrega/devolución de inventario, ver notificaciones. **No** mover aprobación de contrato, registro de pagos ni cierre administrativo al móvil (son operaciones sensibles, se mantienen en el backoffice web, coherente con el pedido explícito del prompt).
- **Riesgo**: alto en esfuerzo (es una app nueva), bajo en riesgo arquitectónico si reutiliza `@mym/shared` y llama a la misma API — nunca debe reimplementar reglas de negocio.

### Fase 14 — QA integral y validación de regresión
- **Objetivo**: recorrer los 8 escenarios end-to-end del prompt (§16 de la solicitud original) como suite de test de integración; revisión de seguridad final (permisos, idempotencia, cascadas).

---

## 14. Riesgos y consideraciones de migración

- **Ninguna fase requiere downtime**: todos los cambios de schema son aditivos (campos opcionales, colecciones nuevas). El único cambio de comportamiento con potencial de romper flujos existentes es la Fase 4 (bloqueo de disponibilidad de salón/fecha) — si hoy existen eventos ya `confirmed` superpuestos en la base de datos real, activar el bloqueo no los afecta retroactivamente (el chequeo es solo en la transición futura), pero conviene correr una consulta de auditoría previa para detectar superposiciones ya existentes y decidir qué hacer con ellas manualmente.
- **Migración de `resourcePlanSnapshot` a `EventProduction`** (Fase 8): debe ser copy-only, simulación por defecto, igual que `migrateIndependentDigitalModules.ts` ya establece como patrón aceptado en este proyecto. No borrar el snapshot legado.
- **Cron en Vercel**: confirmar el plan de Vercel contratado soporta la cantidad de crons/frecuencia necesaria antes de comprometerse a esa opción en la Fase 7.
- **Permisos nuevos** (`EVENTS_CLOSE`, `EVENTS_CLOSE_OVERRIDE`, `PAYMENTS_*` ajustados): requieren decidir a qué `RolePresets` se asignan por defecto — recomendabsolutamente involucrar al usuario de negocio antes de fijar esto, no asumir.
- **Doble configuración de Vercel** (G18) y **módulos de operaciones huérfanos** (G6): no tocar/eliminar sin confirmación explícita, ya señalado en el documento de contexto general.

---

## 15. Preguntas que genuinamente no se pueden responder solo inspeccionando el repositorio

1. **¿El negocio realmente requiere un estado de "firma formal" del contrato** (firma digital, firma en papel escaneada) **o la aprobación interna actual (`Contract.approved`) ya representa el compromiso real del cliente?** El código tiene un vestigio (`select('sentAt signedAt')` sobre campos inexistentes) que sugiere que alguna vez se planeó, pero no hay forma de saber si sigue siendo un requisito de negocio o fue descartado.
2. **¿El bloqueo de disponibilidad de salón/fecha debe ser por día completo o por franja horaria?** Un salón podría, en la práctica del negocio, alojar dos eventos pequeños el mismo día en turnos distintos (mediodía/noche) — esto cambia completamente el diseño del chequeo de conflicto de la Fase 4.
3. **¿Existe hoy algún proceso manual/externo (planilla, WhatsApp, papel) donde el equipo ya registra gastos, producción o fichaje de personal**, que debería inspirar los campos exactos de `Expense`/`EventProduction`/asistencia, más allá de lo que este documento propuso por analogía con el resto del sistema?
4. **¿Cuál es la política real de devolución del depósito de garantía** (plazo, condiciones de retención parcial por daños) — el contrato ya tiene una cláusula legal genérica ("se descontará el 70%...") pero no está claro si esa cifra/regla es la vigente o solo un texto de ejemplo.
5. **¿Debe permitirse sobrepago de un contrato en algún escenario legítimo** (cliente adelanta la cuota siguiente) **o todo excedente debe rechazarse siempre y tratarse como un pago nuevo separado?** Afecta el diseño exacto del `allowOverpayment` de la Fase 2.
6. **¿Qué plan de Vercel usa el proyecto en producción** (para confirmar que Vercel Cron con la frecuencia necesaria está disponible en ese plan, o si se prefiere una alternativa)?
7. **¿El módulo de catálogo/inventario/reglas de consumo (G6) fue abandonado deliberadamente o es trabajo en curso interrumpido?** Esto determina si la Fase 9 es "terminar algo" o "revivir código muerto que quizás debería eliminarse en su lugar".
8. **¿Qué alcance real tiene hoy `apps/mobile` en los planes del negocio a corto plazo?** El prompt la incluye como parte del circuito, pero como está completamente vacía, conviene confirmar si de verdad es prioridad en este ciclo de trabajo o puede diferirse por completo a la Fase 13 sin urgencia.

---

## Nota de alcance

Este documento no modifica código. Antes de comenzar la Fase 2, se recomienda validar con el usuario: (a) las respuestas a §15 que sean bloqueantes para el diseño exacto (en particular la 2 y la 5), y (b) confirmar el orden de fases propuesto o ajustarlo según prioridad de negocio (por ejemplo, si "gastos y reportes" son más urgentes que "producción y cierre" para el negocio, las fases 10/12 podrían adelantarse a la 8/11, ya que son mayormente independientes entre sí salvo por el cruce de rentabilidad).
