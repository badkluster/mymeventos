# Pruebas operativas: invitaciones y entradas digitales

## Automatizadas

Desde la raíz del repositorio:

```powershell
pnpm --filter @mym/shared run build
pnpm --filter @mym/api run test -- invitations.service.test.ts tickets-models.test.ts tickets-service.test.ts
pnpm --filter @mym/api run typecheck
pnpm --filter @mym/web run typecheck
```

Las pruebas de entradas verifican que dos reservas concurrentes no exceden el último cupo, que un QR sólo se consume una vez y que una entrada gratuita se convierte inmediatamente en vendida. Las pruebas de invitaciones cubren la resolución del enlace individual y RSVP.

## Recorrido manual de invitación

1. Abrir un evento y navegar a **Invitaciones digitales**.
2. Crear o editar la configuración; guardar y publicar.
3. Agregar un invitado con cupos de adultos/menores.
4. Copiar su enlace individual y abrirlo en una sesión privada.
5. Confirmar asistencia, indicar acompañantes dentro del máximo y guardar.
6. Volver al backoffice: validar estado y métricas. Probar un rechazo y confirmar que se registra sin eliminar al invitado.
7. Abrir el enlace general: debe ser sólo informativo y no permitir un RSVP anónimo.

## Recorrido manual de entradas y check-in

1. En el mismo evento, crear una venta con slug único, capacidad y tipos de entrada.
2. Publicar la venta y abrir `/entradas/:slug` en sesión privada.
3. Reservar una entrada paga con una `idempotencyKey`; repetir la misma solicitud y validar que no duplica la orden.
4. En administración, marcar la orden como pagada con una referencia de pago. Abrir la entrada emitida y comprobar que muestra QR.
5. Para una entrada gratuita, confirmar que se emite inmediatamente tras reservar.
6. Abrir **Check-in**, seleccionar el evento y escanear o pegar el token QR. El primer intento debe aceptar; el segundo debe rechazar como ya utilizado.
7. Crear reservas en paralelo hasta el último cupo y verificar que ninguna pantalla ofrece cupos negativos ni emite más entradas que la capacidad.

## Límites conocidos a validar antes de producción

- Configurar una limitación distribuida (Redis o gateway) si la API corre en más de una instancia.
- Conectar y probar los webhooks reales de Mercado Pago antes de habilitar confirmación automática.
- Confirmar el dominio público definitivo, HTTPS y la política de retención de auditoría.
- Realizar una prueba de carga de reserva y check-in con la capacidad esperada del salón.
