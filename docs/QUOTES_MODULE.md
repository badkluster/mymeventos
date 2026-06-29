# Módulo de Presupuestos

El flujo comercial actual es **Lead → Presupuesto → Cliente → Evento base**. La etapa de presupuestos permite convertir un presupuesto aceptado en cliente y evento base; contratos, reservas formales y pagos quedan fuera de esta fase.

## Endpoints

- `GET /api/quotes`: listado paginado con filtros por estado, salón y paquete.
- `POST /api/quotes`: crea uno o varios presupuestos. Cuando se indican varios salones, genera un presupuesto independiente por salón.
- `GET /api/quotes/:id`, `PATCH /api/quotes/:id`, `DELETE /api/quotes/:id`: detalle, edición y eliminación lógica.
- `POST /api/quotes/:id/duplicate` y `PATCH /api/quotes/:id/status`.
- `POST /api/quotes/:id/convert-to-event`: crea o reutiliza el cliente, crea el evento base y marca el lead como convertido.
- `GET /api/quotes/packages`: plantillas disponibles.
- `POST|PATCH|DELETE /api/quotes/packages`: gestión protegida de plantillas.
- `GET|PATCH /api/quotes/packages/:id/salons/:salonId`: resolución y regla comercial por salón.

Los estados técnicos se conservan en inglés para la API, pero la interfaz muestra sus equivalentes en español.

## Reglas de negocio

- Cada presupuesto tiene un único salón.
- Al cotizar varios salones, el sistema genera un presupuesto por cada uno.
- Si no existe un Lead, la creación genera uno y registra actividad comercial.
- El presupuesto guarda una copia de la plantilla y sus reglas aplicables. Editarlo no modifica la plantilla original.
- La eliminación es lógica y mantiene auditoría.
- La semilla crea las plantillas Magic Night, Platinum Night y Exclusive Night de forma idempotente.
- La conversión a evento es idempotente: si ya existe un evento para ese presupuesto, devuelve el existente.
- Al convertir, el presupuesto pasa a `converted`, el Lead pasa a `converted` y se guardan `convertedCustomerId`, `convertedEventId` y `convertedAt`.

## Verificación manual

1. Iniciar sesión con permisos de presupuestos y abrir `/admin/quotes`.
2. Crear un presupuesto desde un Lead y seleccionar uno o más salones.
3. Confirmar que se genera una fila por salón, con cálculos y seña independientes.
4. Crear uno para una persona nueva y comprobar que el Lead aparece en el listado de Leads.
5. Abrir el detalle, editar valores, duplicarlo y modificar el estado.
6. Convertir un presupuesto en evento desde el detalle.
7. Confirmar que se crea cliente, evento base y referencias cruzadas.
8. Comprobar la eliminación lógica desde la lista o el detalle.

La generación de contrato, reserva formal, pagos y señas queda explícitamente pendiente.
