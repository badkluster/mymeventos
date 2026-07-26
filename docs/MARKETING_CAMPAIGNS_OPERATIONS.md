# Operación de campañas de Marketing

## 1. Ciclo de vida de una campaña

```
draft → scheduled → preparing → sending → completed
                                        ↘ completed_with_errors
                 ↘ cancelled (desde cualquier estado no terminal)
```

- **draft**: editable libremente (wizard de 5 pasos).
- **scheduled**: tiene `scheduledAt` fijado (inmediato o futuro); ya no admite edición de audiencia/contenido salvo reprogramar.
- **preparing**: el motor de lotes está congelando snapshots (`freezeCampaignSnapshots`) y generando `MarketingRecipient` (`prepareCampaignRecipients`) — paso idempotente, se puede repetir sin duplicar destinatarios.
- **sending**: hay destinatarios `pending`/`processing` por enviar; cada tick de cron procesa un lote (`MARKETING_BATCH_SIZE`, default 25).
- **completed** / **completed_with_errors**: no quedan destinatarios `pending`/`processing` ni `failed` reintentable; el segundo estado indica que al menos un envío falló definitivamente.
- **cancelled**: los destinatarios `pending`/`processing` pasan a `skipped` (`skipReason: campaign_cancelled`); los ya enviados no se revierten.

## 2. Motor de procesamiento por lotes

No hay cola de trabajos ni proceso residente — el patrón es **tick corto e idempotente**, invocado por Vercel Cron o manualmente:

```
GET/POST /api/marketing/process
Headers: Authorization: Bearer <MARKETING_CRON_SECRET>   (o x-cron-secret: <MARKETING_CRON_SECRET>)
```

Cada llamada (`processMarketingTick` en `marketing-campaign.service.ts`) hace, como máximo, **una unidad acotada de trabajo**:

1. Reclama una campaña vencida (`scheduledAt <= now` o con `nextAttemptAt <= now`) con `findOneAndUpdate` + lock (`lockedAt`/`lockExpiresAt`, 2 minutos) — evita que dos ticks solapados procesen la misma campaña.
2. Si es la primera vez, congela snapshots y prepara destinatarios.
3. Reclama un lote de destinatarios `pending`/`failed` (con intentos restantes) con el mismo patrón de lock atómico por documento, uno por uno (`findOneAndUpdate` con filtro de estado — mismo criterio que `refundTicketOrder` en el módulo de tickets).
4. Envía el lote vía el proveedor configurado, actualiza estado/contadores por destinatario y agregados de la campaña (`$inc`, sin recalcular todo en cada tick).
5. Si no queda nada pendiente, marca la campaña `completed`/`completed_with_errors`; si queda trabajo, libera el lock y deja `nextAttemptAt` para el próximo tick.

`POST /api/marketing/campaigns/:id/send` además dispara **un tick síncrono** al confirmar el envío, para que el usuario vea progreso inmediato sin esperar al próximo disparo de cron.

## 3. Automatización 100% gratuita (sin plan pago de Vercel)

El plan Hobby (gratuito) de Vercel solo permite cron jobs con frecuencia **diaria** — no soporta `*/5 * * * *`. Para no depender de un plan pago, la cadencia real del procesamiento por lotes corre por **GitHub Actions** (gratis, tanto en repos públicos como privados dentro de la cuota de minutos incluida — un `curl` de unos segundos cada corrida cuesta prácticamente nada de esa cuota) y Vercel Cron queda solo como **red de seguridad diaria**, dentro de lo que el plan gratuito permite.

**Capa 1 — GitHub Actions (principal, cada 10 minutos)**: `.github/workflows/marketing-cron.yml`. Llama `POST /api/marketing/process` con `{"maxTicks": 20}` (cada corrida drena hasta 20 campañas/lotes, no solo una, así que no hace falta una frecuencia mayor). Requiere dos **secrets** del repositorio en GitHub (Settings → Secrets and variables → Actions):

| Secret | Valor |
|---|---|
| `MARKETING_APP_BASE_URL` | URL pública de producción, ej. `https://mymeventos.vercel.app` (sin barra final) |
| `MARKETING_CRON_SECRET` | El mismo valor cargado como `MARKETING_CRON_SECRET` en las variables de entorno de Vercel |

También se puede disparar manualmente desde la pestaña "Actions" del repo (`workflow_dispatch`) para probarlo sin esperar al próximo horario.

**Capa 2 — Vercel Cron (red de seguridad, una vez al día)**: `vercel.json` ya incluye

```json
"crons": [{ "path": "/api/marketing/process", "schedule": "0 6 * * *" }]
```

Esto corre gratis en el plan Hobby y garantiza que, aunque GitHub Actions esté pausado (se desactiva automáticamente si el repositorio no tiene commits en 60 días — hay que reactivarlo manualmente desde la pestaña Actions si eso pasa) o falle, ninguna campaña programada quede sin procesar más de un día. Vercel Cron llama automáticamente con `Authorization: Bearer <valor-de-la-env-var-CRON_SECRET>` si en el proyecto existe una env var llamada exactamente `CRON_SECRET` — cargarla en Vercel con el mismo valor que `MARKETING_CRON_SECRET` para aprovechar ese mecanismo sin configuración adicional.

**No se requiere ningún plan pago** (ni de Vercel, ni de GitHub, ni de Resend en su nivel gratuito) para que el envío por lotes funcione con una cadencia razonable.

## 4. Reintentos, cancelación y exportación

- `POST /api/marketing/campaigns/:id/retry-failed` — vuelve a `pending` (con `attemptCount: 0`) todos los destinatarios `failed` de la campaña; si la campaña estaba `completed_with_errors`, vuelve a `sending` para que el próximo tick los retome.
- Cada destinatario individual reintenta automáticamente hasta 3 veces (`MAX_RECIPIENT_ATTEMPTS`) antes de quedar en `failed` permanente (requiere retry manual).
- `POST /api/marketing/campaigns/:id/cancel` — requiere `CAMPAIGNS_CANCEL`; los destinatarios sin enviar quedan `skipped`.
- `GET /api/marketing/campaigns/:id/export` — CSV con nombre, apellido, email, origen, estado, fechas de envío/entrega/apertura/clic, intentos, error, motivo de omisión, salón.

## 5. Webhooks de Resend

`POST /api/marketing/webhooks/:provider` (sin sesión, protegido por firma). Eventos manejados: `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`. Deduplicados por `(provider, providerEventId)` en `MarketingWebhookEvent`, igual que el webhook de Mercado Pago en Entradas Digitales. Configuración paso a paso en `docs/MARKETING_EMAIL_PROVIDER.md`.

## 6. Baja de comunicaciones

`GET/POST /api/public/marketing/unsubscribe/:token` (rate-limited, sin sesión). El token vive en `MarketingRecipient.unsubscribeToken` (UUID aleatorio generado al preparar destinatarios, no predecible). Confirmar la baja: crea/activa una fila en `MarketingUnsubscribe` por email normalizado, marca el destinatario como `unsubscribed` y excluye ese email de **toda campaña futura** (ver `resolveAudienceContacts`), sin importar la fuente original.

## 7. Diagnóstico de errores

| Síntoma | Dónde mirar |
|---|---|
| Una campaña "scheduled" nunca avanza | Confirmar que el cron esté realmente llamando `/api/marketing/process` (ver §3) y que `MARKETING_CRON_SECRET` coincida |
| Destinatarios quedan en `failed` | Revisar `MarketingSendLog` (por `campaignId`+`recipientId`) — guarda `errorMessage`/`errorCode` del intento, nunca credenciales |
| Aperturas/clics siempre en 0 | Confirmar `MARKETING_EMAIL_PROVIDER=resend` (con `mock` esas métricas son legítimamente 0, no un bug) y que el webhook esté configurado en Resend |
| Un webhook no actualiza nada | Revisar `MarketingWebhookEvent.processingStatus` — `ignored` significa que no se encontró un `MarketingRecipient` con ese `providerMessageId` (normal para eventos de prueba fuera de una campaña real); `failed` significa firma inválida |

## 8. Incidentes detectados por los tests durante el desarrollo

Los tests automatizados (`apps/api/tests/marketing-*.test.ts`) encontraron y permitieron corregir, antes de llegar a producción:

1. **Verificación de firma de webhook siempre fallaba**: el código comparaba el HMAC esperado (decodificado como texto UTF-8) contra la firma recibida (decodificada como base64) — nunca iban a coincidir en longitud, por lo que ningún webhook real de Resend se habría aceptado nunca. Corregido para decodificar ambos lados como base64 antes de comparar.
2. **Salón inválido podía tirar un 500**: si un filtro de audiencia incluía un `salonId` mal formado (no hexadecimal de 24 caracteres), la construcción de la query lanzaba una excepción de BSON no controlada. Corregido para descartar silenciosamente cualquier id que no tenga forma de `ObjectId` válido en vez de propagar el error.

Ambos casos quedaron cubiertos con tests de regresión (`marketing-email-provider.test.ts`, `marketing-audience-service.test.ts`).
