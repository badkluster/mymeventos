# M&M Eventos — Problemas detectados durante el recorrido

Fecha de revisión: 10 de agosto de 2026  
Entorno: aplicación local  
Alcance: landing pública y backoffice con una cuenta administradora.

Este reporte está separado del Manual de Usuario. No contiene credenciales, secretos ni datos personales reales.

## Resumen

| Prioridad | Problema | Estado observado |
|---|---|---|
| Alta | El estado del evento no se sincroniza al aprobar el contrato | Reproducible en el flujo sintético del manual |
| Media | Un pago registrado puede no reflejarse hasta volver a cargar la pantalla | Reproducible en el flujo sintético del manual |
| Media | El formulario de proveedores depende de textos dentro de los campos | Visible en “Nuevo proveedor” y “Editar proveedor” |
| Baja | El botón “Aprobar” permanece visible después de aprobar un contrato | Visible en contratos aprobados |
| Baja | Se muestran códigos o términos internos en inglés al usuario final | Visible en eventos, contratos, staff y configuración |

## 1. El evento conserva “Contrato borrador” después de aprobar el contrato

Prioridad: Alta

### Recorrido

1. Se creó un lead sintético.
2. Se generó y convirtió un presupuesto.
3. Se completaron documento y domicilio del cliente.
4. El checklist del contrato quedó completamente en “OK”.
5. Se creó el contrato y se aprobó.
6. Al volver al evento, el contrato aparecía aprobado, pero el evento continuaba en “Contrato borrador”.

### Resultado esperado

El evento debería avanzar automáticamente a “Seña pendiente”, o la interfaz debería explicar claramente que el cambio de estado es manual.

### Impacto

- Puede bloquear o confundir el registro de la seña.
- El panel puede mostrar alertas que ya no representan el estado real.
- Un operador nuevo puede intentar aprobar el contrato nuevamente.

### Solución temporal

Verificar que el contrato figure Aprobado y cambiar manualmente el evento a “Seña pendiente”.

## 2. El pago se guarda, pero la pantalla puede seguir mostrando saldo sin cambios

Prioridad: Media

### Recorrido

1. Desde el evento de prueba se completó una seña por transferencia.
2. Se hizo clic en “Registrar pago”.
3. La misma vista continuó mostrando “No hay pagos registrados” y el total abonado en cero.
4. Al salir, volver al evento y abrir Pagos, el movimiento sí aparecía en el historial y el total abonado había aumentado.

### Resultado esperado

Después de guardar, los indicadores y el historial deberían actualizarse inmediatamente o mostrar un mensaje que pida recargar.

### Impacto

El operador puede cargar el mismo cobro por segunda vez creyendo que la primera operación falló.

### Solución temporal

No repetir el registro. Salir de la pestaña Pagos, volver a entrar y verificar el historial y el saldo.

## 3. Campos de proveedor sin rótulos permanentes

Prioridad: Media

### Observación

“Nuevo proveedor” y “Editar proveedor” muestran Nombre, Razón social, CUIT, Contacto, Teléfono, WhatsApp, Email y Notas como texto dentro del campo. Al escribir, ese texto desaparece.

### Resultado esperado

Cada campo debería conservar un rótulo visible por encima o al lado, especialmente para accesibilidad, impresión y revisión de formularios completos.

### Impacto

- Puede resultar difícil recordar qué dato se está editando.
- Reduce la accesibilidad para lectores de pantalla y herramientas de asistencia.
- Aumenta el riesgo de cargar teléfono y WhatsApp en campos equivocados.

## 4. “Aprobar” continúa visible en contratos ya aprobados

Prioridad: Baja

### Observación

El detalle de un contrato Aprobado continúa mostrando la acción “Aprobar”.

### Resultado esperado

La acción debería ocultarse, deshabilitarse con una explicación, o cambiar a una acción coherente con el estado actual.

### Impacto

Puede generar dudas o intentos redundantes, especialmente en personal nuevo.

## 5. Códigos internos visibles en pantallas para usuarios

Prioridad: Baja

### Ejemplos observados

- Tipos de evento como `baptism_communion`.
- Estados contractuales mostrados como `approved`, `draft` o `pending_approval` en algunos textos.
- Roles operativos como `WAITER`, `KITCHEN ASSISTANT` u `OTHER`.
- La clave `application` en Configuración.

### Resultado esperado

Mostrar nombres consistentes en español: “Bautismo/Comunión”, “Aprobado”, “Borrador”, “Pendiente de aprobación”, “Mozo/a”, “Ayudante de cocina”, etc.

### Impacto

El operador necesita interpretar términos que no pertenecen al lenguaje habitual del negocio y el manual debe explicar excepciones evitables.

## Observaciones que no se clasificaron como fallas

- Gastos no tenía registros para los filtros revisados.
- Marketing no tenía campañas enviadas o programadas.
- Asistencia no tenía jornadas activas.
- El plan de producción disponible se había generado sin ítems porque todavía no existían productos explícitos ni reglas aplicables.
- El cierre integral bloqueó correctamente las etapas posteriores cuando faltaban requisitos.

