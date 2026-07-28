# Contacto de cobro ante pagos vencidos

## Objetivo

Cuando una obligación está pendiente y vencida, el backoffice permite preparar
rápidamente un recordatorio de pago para el cliente con un tono profesional,
gentil y respetuoso. La persona operadora puede editar el texto antes de usar
cualquier canal.

La acción está disponible para:

- pagos manuales pendientes con vencimiento en `/admin/payments` y en el detalle
  del pago;
- cuotas vencidas de `Event.paymentPlanSnapshot` (o, si el evento no conserva
  el plan, del snapshot del contrato aprobado) en la pestaña **Pagos** del
  evento.

No se ofrece para compras de entradas digitales, obligaciones cobradas,
canceladas, reembolsadas, con saldo cero, que vencen hoy o en el futuro, ni
eventos cancelados/perdidos. El backend vuelve a validar todo esto al enviar,
por lo que no depende sólo de la interfaz.

## Canales y experiencia

La persona con permiso `PAYMENTS_CREATE` ve **Contactar al cliente**. Al abrir
la acción, el sistema resuelve cliente, monto pendiente, vencimiento y evento;
después presenta dos mensajes prearmados y editables.

El texto predeterminado saluda cordialmente, identifica el monto y el
vencimiento, ofrece desestimar el mensaje si ya se pagó, solicita el
comprobante cuando corresponda y deja abierta la coordinación de una
alternativa de pago o consultas.

| Canal | Comportamiento |
|---|---|
| Email | Al confirmar **Enviar email ahora**, se envía de inmediato con el SMTP transaccional existente. Requiere email del cliente y SMTP habilitado. |
| WhatsApp | **Abrir borrador de WhatsApp** abre `wa.me` con el texto editado y precompletado. La persona revisa y envía desde WhatsApp; no hay proveedor de WhatsApp ni se afirma que el mensaje haya sido enviado. |

Para que el enlace de WhatsApp funcione de forma fiable, el teléfono del
cliente debe incluir código de país y área en su registro.

## API y controles

Las rutas autenticadas están bajo `/api/payment-collections`:

- `POST /preview`
- `POST /send-email`
- `POST /open-whatsapp`

Todas requieren `PAYMENTS_CREATE`, validan el alcance de salón del usuario y
resuelven nuevamente la obligación antes de actuar. Los mensajes se limitan a
5.000 caracteres; el asunto de email no admite saltos de línea.

Los datos de contenido editado no se guardan en la auditoría. Se registran los
eventos `PAYMENT_COLLECTION_EMAIL_SENT` y
`PAYMENT_COLLECTION_WHATSAPP_DRAFT_PREPARED`, con origen de la obligación,
cliente, monto y vencimiento. Esto conserva trazabilidad sin presentar un
borrador de WhatsApp como entrega confirmada.

## Dependencia de email

El email usa la configuración SMTP existente (`EMAIL_NOTIFICATIONS_ENABLED`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y opcionalmente
`SMTP_FROM`). Si falta, la API responde que el envío no está configurado; no
simula una entrega.
