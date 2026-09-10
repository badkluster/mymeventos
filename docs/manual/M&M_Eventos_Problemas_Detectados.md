# M&M Eventos - Problemas detectados durante el recorrido

Fecha de revisión inicial: 10 de agosto de 2026  
Última actualización: 10 de agosto de 2026  
Entorno revisado: aplicación local  
Alcance: landing pública y backoffice con una cuenta administradora.

Este reporte está separado del Manual de Usuario. No contiene credenciales, secretos ni datos personales reales.

## Estado actual

Los problemas encontrados durante el primer recorrido fueron corregidos y el Manual de Usuario v1.1 ya no indica workarounds para ellos.

| Prioridad | Problema | Estado actual |
|---|---|---|
| Alta | El estado del evento no se sincronizaba al aprobar el contrato | **Corregido** - la aprobación sincroniza el evento al estado comercial correspondiente |
| Media | Un pago registrado podía no reflejarse hasta recargar la pantalla | **Corregido** - indicadores e historial se actualizan en la misma vista |
| Media | El formulario de proveedores dependía de placeholders | **Corregido** - alta/edición usan rótulos persistentes |
| Baja | “Aprobar” permanecía visible en contratos ya aprobados | **Corregido** - las acciones respetan el estado contractual |
| Baja | Códigos internos en inglés llegaban al usuario final | **Corregido en las vistas relevadas** - se usan rótulos de presentación en español |
| Alta | Staff confirmado no podía finalizarse desde la UI y bloqueaba el cierre operativo | **Corregido** - se implementó el ciclo de estados y las acciones de finalización |

## 1. Sincronización contrato -> evento

### Problema original

Al aprobar un contrato, el contrato quedaba Aprobado pero el evento podía permanecer en “Contrato borrador”.

### Estado actual

La aprobación del contrato sincroniza el evento al siguiente estado comercial cuando corresponde. Para el flujo estándar, el operador ya no debe cambiar manualmente el evento a “Seña pendiente”.

El comportamiento repetido de aprobación debe mantenerse controlado e idempotente.

## 2. Actualización de pagos

### Problema original

El pago se guardaba en backend pero la pestaña Pagos podía seguir mostrando saldo e historial anteriores hasta abandonar y volver a la vista.

### Estado actual

Después de un registro exitoso, la vista vuelve a consultar/actualiza los datos relacionados y muestra en la misma pantalla:

- total abonado;
- saldo restante;
- historial del movimiento;
- estado relacionado cuando corresponda.

No debe utilizarse una recarga manual como parte normal del procedimiento.

## 3. Formularios de proveedores

### Problema original

Nombre, Razón social, CUIT, Contacto, Teléfono, WhatsApp, Email y Notas utilizaban el placeholder como única identificación visual.

### Estado actual

Los formularios de alta y edición conservan rótulos visibles y la asociación correspondiente con sus controles. El placeholder, cuando existe, funciona como ejemplo y no como reemplazo del rótulo.

## 4. Acción Aprobar en contratos aprobados

### Problema original

Un contrato ya aprobado continuaba mostrando “Aprobar”.

### Estado actual

La interfaz condiciona las acciones al estado real del contrato y el backend continúa siendo la autoridad para validar transiciones.

## 5. Rótulos de estados, tipos y roles

### Problema original

Se observaban valores como:

- `baptism_communion`;
- `approved`, `draft`, `pending_approval`;
- `WAITER`, `KITCHEN_ASSISTANT`, `OTHER`;
- claves técnicas de configuración.

### Estado actual

Las vistas relevadas utilizan helpers/rótulos de presentación y conservan los enums internos únicamente como valores del dominio. Los filtros y formularios deben seguir enviando los valores internos al backend aunque el usuario vea sus nombres en español.

## 6. Ciclo de Staff y Cierre Integral

### Problema detectado posteriormente

Cierre Integral exigía que cada `EventStaffAssignment` estuviera en un estado final (`completed`, `cancelled` o `no_show`), pero la pestaña Staff sólo permitía confirmar, cancelar o eliminar. Un evento con personal `confirmed` quedaba sin camino correcto para cerrar.

### Estado actual

La interfaz y el backend contemplan el ciclo de vida del personal. Los estados visibles se presentan en español y permiten registrar lo que realmente ocurrió.

Flujo operativo esperado:

- Asignado -> Confirmado;
- Confirmado -> Ingresó, Completado, Cancelado o Ausente según corresponda;
- Ingresó -> Completado;
- Completado / Cancelado / Ausente son terminales para el cierre operativo.

No se considera `Confirmado` como finalizado solamente para evitar el blocker: debe registrarse el resultado real de la asignación.

## Observaciones que no se clasificaron como fallas

- Gastos podía no tener registros para determinados filtros.
- Marketing podía no tener campañas enviadas o programadas.
- Asistencia podía no tener jornadas activas.
- Un plan de producción puede generarse sin ítems si el evento no tiene productos explícitos ni reglas aplicables; la interfaz debe explicar esta situación.
- Cierre Integral bloquea correctamente las etapas posteriores cuando faltan requisitos.
- Las capturas del Manual v1.0 fueron tomadas antes de algunas de estas correcciones. El Manual v1.1 identifica las capturas históricas que no pudieron recapturarse y documenta el comportamiento vigente.
