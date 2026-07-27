# Módulo de Liquidación de Sueldos

## Alcance

Payroll es una herramienta administrativa interna para liquidar horas, jornadas, eventos, conceptos manuales, adelantos y pagos. No es un sistema contable, fiscal ni emite recibos oficiales.

La zona horaria operativa es `America/Argentina/Buenos_Aires`. Todos los importes de payroll se almacenan como enteros de unidades menores, con el sufijo `Minor` (por ejemplo, `hourlyRateMinor`). En ARS, 100 representa $1,00. La interfaz convierte los importes de pesos a unidades menores antes de enviarlos; el backend nunca usa coma flotante para calcular dinero.

## Arquitectura y modelos

`WorkSession` sigue siendo la fuente de verdad de asistencia. Las marcaciones (`TimePunch`) permanecen inmutables y una corrección sigue el flujo existente de `AttendanceAdjustmentRequest`. Para payroll se agregan campos de aprobación y una referencia de reserva a la liquidación que incluye la jornada. No existe un modelo paralelo de fichadas.

| Modelo | Responsabilidad |
| --- | --- |
| `PayrollProfile` | Configuración salarial versionada, con vigencia y alcance opcional de salones. |
| `PayrollConcept` | Catálogo inactivable de haberes y descuentos. |
| `PayrollRun` | Lote colectivo para un período. |
| `PayrollSettlement` | Liquidación individual, sus snapshots e ítems explicables. |
| `PayrollAdjustment` | Concepto manual con motivo obligatorio y actor. |
| `SalaryAdvance` | Adelanto pendiente o descontado una única vez. |

El perfil antiguo `User.payrollProfile` se conserva sólo por compatibilidad histórica. No se usa ni se expone en los perfiles de usuario, porque no posee vigencia, historial ni importes seguros; la edición se realiza exclusivamente en Liquidación de Sueldos. La carga de un perfil nuevo no modifica usuarios ni liquidaciones preexistentes.

## Estados y flujo

1. Una jornada finalizada, sin revisión pendiente, queda `pending` para liquidación.
2. Un usuario con permiso revisa la jornada y la deja `approved` o `rejected`. Sólo `approved` entra al cálculo automático.
3. Se genera una liquidación individual o como borrador dentro de un lote. La jornada queda reservada por su `payrollSettlementId`.
4. En borrador o revisión se puede recalcular y agregar ajustes manuales con motivo.
5. Una liquidación aprobada es inmutable. Sólo entonces se puede registrar el pago y emitir su comprobante.

Los lotes usan `draft`, `calculated`, `under_review`, `approved`, `partially_paid`, `paid` o `cancelled`. Las liquidaciones usan `draft`, `under_review`, `approved` o `cancelled`; el pago es `unpaid` o `paid`.

Al marcar una liquidación como pagada se generan gastos automáticos con origen `payroll` y categoría `Sueldos y jornales`. Se imputan por salón y evento según los minutos aprobados de sus asistencias; para una liquidación mensual sin asistencias se usa el alcance del perfil salarial o del empleado. Los gastos usan la liquidación como identificador de origen, por lo que reintentar la acción no duplica importes y una liquidación ya pagada puede sincronizar sus gastos históricos.

Desde la pestaña Asistencias de Liquidación, las jornadas pendientes u observadas se abren directamente en Asistencia. El detalle de la jornada permite revisar y cambiar su estado cuando requiere revisión.

## Cálculo

El cálculo se ejecuta exclusivamente en el backend mediante el motor `payroll.calculation.ts`, versión `1.0.0`.

```text
bruto = base + haberes automáticos + haberes manuales
neto  = bruto - descuentos
```

Las horas se derivan de `approvedMinutes` y aplican redondeo y política de descanso del perfil. El tipo `hourly` paga horas normales y extra; `daily` paga jornadas; `monthly` usa el salario mensual acordado; `per_event` cuenta eventos distintos; `mixed` combina los componentes configurados. El adicional de fin de semana se determina con la fecha local. El adicional nocturno se aplica cuando la jornada comienza dentro de la franja configurada. No se infieren feriados: mientras no exista un calendario administrativo configurado, no se genera ese adicional automáticamente.

El perfil se exige vigente durante todo el período. Si un cambio de perfil divide el período, se deben generar liquidaciones separadas; esto evita mezclar valores históricos sin trazabilidad.

## Idempotencia, consistencia y límites

MongoDB puede ejecutarse sin replica set, por lo que la reserva de asistencia se hace con una actualización condicional atómica de `WorkSession`. Si no se pueden reservar todas las jornadas, la liquidación no se completa y se informa el conflicto. Un adelanto pasa de `pending` a `deducted` al quedar incluido en una liquidación y no puede volver a incluirse.

Las liquidaciones no se eliminan físicamente. Los conceptos utilizados no se eliminan: pueden desactivarse. Cada liquidación guarda el snapshot del perfil, los conceptos y los importes usados. Un cambio de perfil o catálogo posterior no altera el comprobante histórico.

## Permisos

- `payroll.view`: consulta de datos habilitados por alcance.
- `payroll.manage_profiles`: crea versiones de perfiles.
- `payroll.manage_attendance`: revisa asistencias para liquidación.
- `payroll.create` y `payroll.calculate`: crea y calcula borradores.
- `payroll.approve` y `payroll.pay`: aprueba y registra pagos.
- `payroll.export` y `payroll.audit`: exporta información sensible y consulta su auditoría.
- `payroll.self.read`: autoservicio móvil de liquidaciones aprobadas propias.

El administrador tiene acceso completo. Los managers reciben los permisos operativos definidos por el preset. Los encargados de salón sólo obtienen capacidades si se les conceden de forma explícita y las rutas filtran jornadas, empleados y liquidaciones al alcance de sus salones. Staff sólo puede consultar sus propios datos aprobados desde la API móvil.

## API

Rutas de backoffice bajo `/api/payroll`:

- `GET/POST/PATCH /profiles` y `GET /profiles/:employeeId`.
- `GET /attendance`, `PATCH /attendance/:id`, `POST /attendance/:id/approve`, `POST /attendance/:id/reject` y `POST /attendance/bulk-approve`.
- `GET/POST/PATCH /concepts`.
- `GET/POST /runs`, `GET /runs/:id`, y transiciones `calculate`, `submit-review`, `approve`, `mark-paid`.
- `GET/POST /settlements`, detalle, recálculo, aprobación, pago, ítems manuales y comprobante.
- `GET/POST/PATCH /advances`, `GET/POST /adjustments`, resumen y exportaciones.

La app móvil usa `/api/mobile/payroll`: resumen, liquidaciones aprobadas propias, detalle propio y URL de comprobante propio. Nunca devuelve borradores ni datos de otro empleado.

## Comprobantes y exportaciones

El comprobante individual se genera con PDFKit, se guarda como PDF raw en el almacenamiento Cloudinary ya usado por el proyecto y muestra la aclaración administrativa obligatoria. Las exportaciones incluyen CSV, Excel XML compatible con Microsoft Excel y PDF consolidado. Exportar queda auditado.

## Casos límite cubiertos

- No hay perfil vigente o el período atraviesa un cambio de perfil.
- Jornada incompleta, observada, rechazada o ya reservada.
- Jornadas superpuestas, negativas o excesivas: se muestran como inconsistencias, no entran al cálculo.
- Reintento de cálculo, doble inclusión de jornada, doble descuento de adelanto y doble pago.
- Intento de recalcular, editar ítems o pagar una liquidación en estado inválido.

## Futuro

Quedan fuera del alcance: impuestos, aportes, reglas fiscales, recibos oficiales, calendario de feriados, conciliación bancaria y reglas legales. La separación entre motor, perfiles y conceptos permite incorporarlos sin reescribir liquidaciones históricas.
