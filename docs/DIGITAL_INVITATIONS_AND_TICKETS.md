# Invitaciones digitales y entradas digitales

## Alcance

Se incorporaron dos dominios independientes vinculados a un evento:

- **Invitaciones digitales**: configuración editable, invitados, RSVP individual y métricas.
- **Entradas digitales**: venta o reserva por tipo de entrada, cupos atómicos, QR por entrada y check-in.

No se alteraron datos existentes ni se ejecutaron migraciones, seeds o acciones contra producción.

## Rutas

Backoffice (requiere sesión y permisos):

- `/admin/events/:id/invitations`: invitación, invitados, venta, tipos, órdenes y check-in.
- `/admin/events/:id/tickets`: acceso directo a la gestión de entradas.
- `/admin/events/:id/check-in`: acceso directo al control de acceso.

Públicas y sin indexación:

- `/invitacion/:token`: vista general o enlace personalizado para RSVP.
- `/entradas/:slug`: tipos de entrada y reserva/compra.
- `/entrada/:token`: entrada individual con QR.

## API

### Invitaciones

Las rutas administrativas se encuentran bajo `/api/invitations` y respetan permisos `invitations.*`.

- `POST|GET /events/:eventId`
- `GET|PATCH|DELETE /:id`
- `POST /:id/publish`, `/:id/unpublish`, `/:id/regenerate-token`
- `GET|POST /:id/guests`, `PATCH|DELETE /:id/guests/:guestId`
- `GET /:id/guests/:guestId/link` (devuelve el token individual a usuarios autorizados)
- `GET /:id/metrics`

Las rutas públicas son `/api/public/invitations/:token` y `/rsvp`. El token individual resuelve al invitado y permite confirmar, rechazar, declarar acompañantes y restricciones. El token general sólo expone la información pública: no puede utilizarse para registrar un RSVP sin identidad de invitado.

### Entradas

Las rutas administrativas se encuentran bajo `/api/tickets` y usan permisos `tickets.*`:

- ventas por evento, CRUD de ventas y tipos, activación/publicación;
- órdenes, confirmación manual de pago, cancelación/liberación de reserva;
- consulta y validación de QR/check-in.

API pública:

- `GET /api/public/tickets/:slug`
- `POST /api/public/tickets/:slug/orders`
- `GET /api/public/ticket/:token`

La creación pública recibe comprador, selecciones e `idempotencyKey`. Las órdenes pagas quedan en `payment_pending`; las gratuitas se confirman como `paid` y generan entradas válidas de inmediato. Con Mercado Pago configurado, el webhook firmado consulta el pago real, compara importe y moneda y confirma la orden de forma automática e idempotente. El pago manual permanece disponible para las operaciones que no usan un proveedor online.

## Seguridad, capacidad y auditoría

- Tokens públicos de invitación y entrada se generan con aleatoriedad criptográfica y nunca se exponen desde endpoints administrativos salvo el enlace individual solicitado.
- Las rutas públicas se limitan en memoria por IP, ruta y método. Para despliegues multiinstancia debe reemplazarse por Redis o un límite en el proxy/API gateway.
- Las reservas incrementan cupos mediante actualizaciones condicionales atómicas en venta y tipo. Si una actualización falla, se revierte la reserva previa.
- La validación QR realiza una transición condicional `valid -> used`; dos escaneos simultáneos sólo pueden aceptar uno.
- `TicketAccessAttempt` guarda aceptaciones y rechazos de check-in. Invitaciones y cambios administrativos generan auditoría mediante la infraestructura existente.
- El QR contiene un token opaco; no incluye datos sensibles del comprador.

## Permisos

Se agregaron `tickets.update` y los permisos se aplican por acción. Los perfiles manager reciben gestión de invitaciones y entradas; el perfil de salón sólo puede leer invitaciones/entradas y validar acceso. Personal conserva el mínimo privilegio y sólo puede validar si se le asigna explícitamente `tickets.validate`.

## Pagos y avisos

El flujo conserva `paymentMethod` y `paymentReference` para asociar una orden con la infraestructura de pago existente. Con las credenciales y webhook de Mercado Pago configurados, la confirmación es automática: se valida firma, se deduplica la notificación, se consulta el pago real y se verifica importe/moneda antes de emitir entradas, registrar el movimiento contable y enviar el correo.

El proceso programado de entradas agrega avisos de pago pendiente o rechazado, abandono de checkout, reembolso confirmado, recordatorios de 48 h/24 h y reintentos automáticos de correo. La operación y las variables necesarias están documentadas en [TICKET_AUTOMATION.md](./TICKET_AUTOMATION.md).

## Operación y reversión

No hay variables de entorno nuevas ni scripts de carga requeridos. Para detener la venta se despublica o inactiva la venta; las entradas ya emitidas se conservan para auditoría. Para revertir la funcionalidad, retirar las rutas públicas/administrativas del router no modifica registros preexistentes; antes de hacerlo, exportar órdenes y accesos si se necesita conservar la operación histórica.
