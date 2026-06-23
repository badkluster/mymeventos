# Resumen del Modelo de Dominio

Las principales entidades y sus relaciones se describen a continuación:

## Entidades de Configuración y Seguridad
- **User**: Representa a los usuarios del sistema. Se relaciona con `Role` y `Salon`.
- **Role**: Define los roles (ADMIN, MANAGER, etc.).
- **Permission**: Permisos granulares asignados a Roles.
- **Salon**: Representa cada sucursal (San Carlos, Villa Elisa, La Plata).

## Entidades Comerciales (CRM)
- **Lead**: Cliente potencial con historial, origen, estado y salón asignado.
- **Customer**: Un Lead que concretó al menos un evento.
- **Quote**: Presupuesto enviado a un Lead. Contiene detalles estimados.

## Entidades de Operación de Eventos
- **Event**: Entidad central. Relacionada con `Customer`, `Salon`, `Package`, menús, servicios, invitados y cronograma.
- **Package**: Paquete de servicios predefinido contratado para el evento.
- **GuestList**: Lista de invitados asociados al evento.
- **Task / Alert**: Tareas o recordatorios vinculados a un evento.

## Entidades Financieras
- **PaymentPlan**: Plan de pago acordado para un evento (seña, cuotas).
- **Payment**: Registro individual de un pago realizado (transferencia, efectivo).

## Entidades de Inventario y Catálogo
- **Product**: Producto comercializable o insumo, con historial de precios.
- **Supplier**: Proveedor de productos o servicios.
- **StockItem**: Artículo de inventario (vajilla, equipos).
- **StockAllocation**: Registro de asignación temporal de un `StockItem` a un `Event` (reserva por fechas).

## Entidades de Marketing y Comunicación
- **Promotion**: Reglas de descuento u ofertas especiales.
- **Campaign**: Campañas de email marketing o segmentación.
- **DigitalInvitation**: Invitación basada en plantillas asociada a un `Event`.

## Entidades de Entradas (Tickets)
- **TicketEvent**: Evento abierto al público o formato boliche.
- **TicketType**: Categorías de entradas disponibles y sus precios.
- **Ticket**: Entrada individual emitida, contiene un código QR único e historial de validación.

## Entidades de Recursos Humanos
- **AttendanceRecord**: Registro de fichada del personal (check-in/check-out, coordenadas GPS).
- **PayrollReport**: Resumen de horas trabajadas.
