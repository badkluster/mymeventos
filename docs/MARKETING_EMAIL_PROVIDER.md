# Proveedor de email de Marketing (Resend)

Este documento cubre solo el proveedor de envío masivo del módulo de Marketing (`apps/api/src/modules/marketing/marketing-email.provider.ts`). El SMTP existente (`apps/api/src/modules/email/email.service.ts`, Nodemailer) sigue reservado para emails transaccionales puntuales (notificaciones, RSVP de invitaciones, entradas) y no se tocó.

## Por qué Resend

No existía ningún proveedor de email con API en el proyecto — solo SMTP genérico, sin tracking de entregados/rebotes/aperturas/clics. Resend se eligió por: API simple vía `fetch` (mismo patrón "sin SDK" ya usado para Mercado Pago), webhooks firmados con un esquema estándar (Svix) fácil de verificar a mano, endpoint de envío por lote (`/emails/batch`, hasta 100 por llamada) y un nivel gratuito razonable para empezar.

## Configuración

Variables de entorno (`.env.example`, `apps/api/src/config/env.ts`):

```env
MARKETING_EMAIL_PROVIDER=mock       # "mock" (por defecto) o "resend"
RESEND_API_KEY=                     # API key de Resend (nunca en el frontend, nunca en la base)
RESEND_WEBHOOK_SECRET=              # secreto "whsec_..." del endpoint de webhooks configurado en Resend
MARKETING_FROM_EMAIL=               # email remitente por defecto si MarketingSettings no tiene uno cargado
MARKETING_FROM_NAME=                # nombre remitente por defecto
MARKETING_REPLY_TO=                 # reply-to por defecto
MARKETING_PUBLIC_URL=               # base pública usada para armar el enlace de baja ({{unsubscribeUrl}})
MARKETING_BATCH_SIZE=25             # emails procesados por tick de cron (tope defensivo: 500)
MARKETING_SEND_RATE_LIMIT=10        # reservado para ajustar velocidad de envío
MARKETING_CRON_SECRET=              # secreto compartido para /api/marketing/process
```

Sin `RESEND_API_KEY` (o con `MARKETING_EMAIL_PROVIDER=mock`), el sistema usa `MockMarketingEmailProvider`: simula el envío como exitoso y no llama a ninguna API externa — pensado para desarrollo/tests, nunca para producción (en producción con `MARKETING_EMAIL_PROVIDER=resend` sin `RESEND_API_KEY`, el arranque falla explícitamente en vez de enviar en modo simulado silenciosamente).

## Pasos manuales para producción

1. Crear una cuenta en Resend y verificar el dominio remitente (SPF/DKIM) que se vaya a usar en `MARKETING_FROM_EMAIL`.
2. Generar un API key y cargarlo como `RESEND_API_KEY` en las variables de entorno de Vercel (Production).
3. En el panel de Resend, configurar un webhook hacia `https://<dominio>/api/marketing/webhooks/resend` suscripto a los eventos: `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`.
4. Copiar el "Signing secret" (`whsec_...`) que Resend genera para ese webhook y cargarlo como `RESEND_WEBHOOK_SECRET`.
5. Setear `MARKETING_EMAIL_PROVIDER=resend`.
6. Confirmar que `MARKETING_PUBLIC_URL` apunte al dominio público real (se usa para el enlace `{{unsubscribeUrl}}`).

## Verificación de firma (sin SDK)

Resend firma sus webhooks con el esquema **Svix**: headers `svix-id`, `svix-timestamp`, `svix-signature`, HMAC-SHA256 sobre `${id}.${timestamp}.${rawBody}` usando el payload base64 del secreto `whsec_...`. Se implementó a mano en `ResendMarketingEmailProvider.verifyWebhookSignature` (mismo criterio "fetch + crypto, sin SDK" ya usado para Mercado Pago), incluyendo:

- Comparación en tiempo constante (`timingSafeEqual`), nunca `===`.
- Tolerancia de reintento de 5 minutos sobre el timestamp (protección de replay).
- Requiere que `apps/api/src/app.ts` capture el body crudo (`express.json({ verify })`) — ya está hecho a nivel global (`request.rawBody`), reutilizable por cualquier webhook futuro que necesite HMAC sobre el payload exacto.

Este endpoint fue cubierto con tests unitarios (`apps/api/tests/marketing-email-provider.test.ts`) que firman un payload de prueba y verifican aceptación/rechazo — durante el desarrollo, esos tests detectaron y permitieron corregir un bug real de comparación de encoding (ver `docs/MARKETING_CAMPAIGNS_OPERATIONS.md` §"Incidentes detectados por tests").

## Envío por lotes

`ResendMarketingEmailProvider.sendBatch` parte los destinatarios en bloques de máximo 100 (límite de la API de Resend) y llama a `POST https://api.resend.com/emails/batch`. Si la llamada HTTP falla completa (red o 5xx), todo el bloque queda marcado como fallido para reintento en el próximo tick; si Resend responde pero un destinatario puntual no tiene `id` en la respuesta, solo ese destinatario se marca fallido.

## Límites y consideraciones

- No se guarda nunca el `RESEND_API_KEY` ni el `RESEND_WEBHOOK_SECRET` en la base de datos ni se expone al frontend.
- `MarketingSendLog` guarda metadata de request/response por intento, nunca credenciales.
- Los eventos duplicados de Resend (reintentos propios del proveedor) se deduplican por `(provider, providerEventId)` en `MarketingWebhookEvent`, igual que `TicketPaymentWebhook`.
