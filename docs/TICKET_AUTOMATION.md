# Automatización de entradas digitales

El circuito financiero de una entrada nunca depende del navegador: Mercado Pago confirma mediante webhook firmado, el backend vuelve a consultar el pago real y sólo entonces emite las entradas. Los avisos de email son posteriores a esa transición; un fallo de correo no altera ni el pago, ni el stock, ni la validez de los QR.

## Avisos automáticos

Cada aviso se registra en `TicketDelivery` con una clave idempotente por orden y tipo de aviso. Un reintento de webhook o cron no duplica mensajes ya enviados.

| Momento | Canal registrado | Contenido |
| --- | --- | --- |
| Se crea el checkout | `payment_pending` | Enlace seguro al portal para retomar el pago. |
| Mercado Pago rechaza el pago | `payment_rejected` | Estado de la orden y enlace al portal. |
| Vence una reserva impaga | `checkout_abandoned` | Aviso de liberación de cupos y enlace para consultar la orden. |
| Se confirma el pago | `email` | Portal, detalle, códigos QR y PDF combinado si pesa hasta 7 MB. |
| Se aprueba un reembolso | `refund_confirmation` | Importe, estado y aviso de acreditación por parte del medio de pago. |
| Faltan 48 o 24 horas | `event_reminder_48h` / `event_reminder_24h` | Fecha, lugar y portal de entradas. |

Los avisos fallidos se conservan con error, fecha, destino enmascarado y próximo intento. Tanto los avisos del ciclo de vida como el correo de entradas emitidas se reintentan hasta tres veces, con espera exponencial de 1 h, 2 h y 4 h. El reenvío manual se conserva como acción separada del backoffice.

## Proceso programado

`GET|POST /api/tickets/process` ejecuta un tick idempotente que:

1. Expira reservas de pago vencidas y libera cupos.
2. Reintenta correos fallidos que ya cumplieron su espera.
3. Emite los recordatorios de 48 h y 24 h para órdenes pagadas.

No requiere una sesión de usuario. Está protegido por `Authorization: Bearer <secret>` o `x-cron-secret`.

La cadencia real es de **cada cinco minutos** mediante `.github/workflows/ticket-automation-cron.yml`, que llama `POST /api/tickets/process` con un tick. El workflow no se solapa consigo mismo y puede ejecutarse manualmente desde GitHub Actions para diagnóstico.

GitHub Actions es el único scheduler de este proceso. Configurar los siguientes valores antes de desplegar:

| Ubicación | Secret / variable | Valor |
| --- | --- | --- |
| GitHub Actions | `TICKET_AUTOMATION_APP_BASE_URL` | URL pública base, por ejemplo `https://www.mymsalones.com.ar`. |
| GitHub Actions | `TICKET_AUTOMATION_CRON_SECRET` | Secreto largo y privado compartido con el endpoint. |

```env
EMAIL_NOTIFICATIONS_ENABLED=true
SMTP_HOST=smtp.ejemplo.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=ventas@dominio.com
TICKET_AUTOMATION_CRON_SECRET=un-secreto-largo-y-privado
```

Si SMTP no está configurado, la operación financiera sigue siendo correcta y cada entrega queda en estado `failed` con `EMAIL_NOT_CONFIGURED`; al configurar SMTP, el cron retoma los reintentos pendientes.

## Límite operativo actual

El correo transaccional se envía por SMTP y registra el resultado de aceptación del servidor SMTP. La confirmación de entrega final, rebote o queja requeriría usar un proveedor con webhooks transaccionales (por ejemplo Resend) y asociar su `providerMessageId` a `TicketDelivery`. No se infiere una entrega real sólo porque el SMTP aceptó el mensaje.
