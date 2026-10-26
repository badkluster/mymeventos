# Trazabilidad comercial y objetivos por salón

## Auditoría del flujo existente

- El alta de leads exige nombre, apellido, teléfono, tipo de evento, invitados y salón. Esa validación y el formulario se mantienen.
- `Lead.source` describe el canal de entrada. Los estados y `LeadActivity` ya registraban parte del recorrido. La cotización registra `quote_created` y `quote_sent`; la conversión conecta lead, presupuesto, cliente y evento.
- Una cotización aceptada puede crear un evento con estado `quoted`. Un contrato comienza en `pending_approval`; `approveContract` asigna `approvedAt`, cambia el estado a `approved` y, si hay revisión, marca la versión previa `superseded`. El evento pasa de `contract_draft` a `deposit_pending`.
- `Payment.paidAt` es la fecha de cobro real. La seña y las cuotas pueden registrarse antes o después de la aprobación contractual. Por eso un pago aislado no demuestra aprobación formal. El calendario existente usa `CalendarItem` con tipo `meeting`; los recordatorios de leads desatendidos se limitan a estado `new`.

## Regla exacta del KPI

La unidad es **un evento**, no un documento contractual ni un pago. Cuenta en el mes de la **primera aprobación formal** (`Contract.approvedAt`) en `America/Argentina/Buenos_Aires` cuando:

1. El evento existe, pertenece al salón y no está eliminado, cancelado ni perdido.
2. Hay exactamente una versión contractual vigente con `status='approved'`.
3. La primera versión aprobada sigue en estado `approved` o `superseded` y todas las versiones usadas pertenecen al mismo evento y salón.

Los borradores, pendientes, versiones canceladas, señas aisladas, cuotas posteriores y pagos múltiples no aumentan el numerador. Una revisión aprobada conserva el mes de la primera aprobación. Una cancelación posterior del evento o del contrato vigente quita el cierre del mes original; el dashboard es una vista **actual** del historial, no una foto congelada. El detalle lista cada evento y contrato que contribuye al conteo.

Los pagos del mes ligados a eventos sin contrato aprobado vigente se muestran como **inconsistencias para revisión**, fuera del numerador. Esto evita presentar una seña como contrato formal. La carga de una reserva histórica no cuenta por `createdAt`; sólo podría contar si conserva un `approvedAt` verificable. El esquema actual no tiene una marca inequívoca de importación histórica ni un registro inmutable de "primera aprobación". Si una importación asignó `approvedAt` artificialmente, el KPI necesita reconciliación manual antes de darse por validado.

## Reconciliación pendiente

El caso reportado de Villa Elisa de octubre de 2026 (cinco contrataciones con pago, una con contrato cancelado y evento/pagos contradictorios) **no se modifica**. La base M&M no estuvo disponible para una consulta de sólo lectura en esta sesión: el Atlas conectado contiene otra aplicación. Por ello no se puede afirmar que el numerador sea cinco ni compararlo con el libro que usa administración. Hay que revisar, con acceso autorizado de lectura, las cinco cadenas `Event → Contract (todas las versiones) → Payment`, sus `approvedAt`, `paidAt`, `status`, `cancelledAt`, salón y evidencia comercial externa. Administración debe confirmar si "contrato cerrado" significa aprobación formal o reserva con seña. Si incluyen ambas categorías, debe acordarse una métrica separada de **reservas con seña pendientes de aprobación**; no se suman silenciosamente a contratos formales. No se debe corregir ni migrar el registro anómalo sin una decisión específica.

## Objetivos y cambios de esquema

`SalonMonthlyGoal` usa clave única `(salonId, year, month)`, meta positiva e historial embebido de cambios con responsable, fecha, valor anterior y motivo. Sólo administradores configuran objetivos; los períodos anteriores al mes actual están bloqueados. No hay meta retroactiva implícita. Los tres objetivos de **noviembre de 2026: 10 por salón** se cargan desde la interfaz de administración por una persona autorizada; este cambio no ejecuta scripts ni escrituras directas de desarrollo sobre bases de datos.

`Lead` incorpora origen comercial separado de `source`, atribución manual, códigos de campaña/anuncio, último/próximo contacto y metadatos de pérdida. El calendario existente guarda las visitas y un recordatorio estable por lead; `LeadActivity` conserva oferta, agenda, confirmación, realización, ausencia, cancelación y reprogramación con datos anteriores. No hay migración de escritura de datos históricos.

## Límites del reporte de conversión

La sección de conversión agrupa por lead creado en el mes y salón interesado. Presupuestos y visitas asociados se deduplican por lead y reflejan el avance conocido al momento de consultar. No se infieren orígenes ni visitas pasadas. Las cifras de actividad bajo cada objetivo son acciones fechadas en ese mes y **no** son una cohorte; no se calculan tasas cruzándolas. Los registros históricos incompletos se muestran como "Sin registrar" o "No medible".
