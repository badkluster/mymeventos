# Módulo de Solicitudes de Presupuesto

## Diferencia entre Lead, Solicitud y Presupuesto

- **Lead**: representa a la persona interesada. Se deduplica por email o teléfono antes de crear un registro nuevo.
- **Solicitud de Presupuesto**: representa una consulta entrante pendiente de revisión comercial. Puede venir de web, cotización rápida, WhatsApp, oficina, teléfono o carga manual.
- **Presupuesto**: representa una propuesta comercial real, con salón, paquete, importes, condiciones y PDF generado.

El flujo estable es:

1. Entra una consulta.
2. El sistema busca o crea el Lead.
3. Se crea una Solicitud de Presupuesto en estado `new`.
4. Se notifica al responsable del salón o a un fallback comercial.
5. Un operador toma la solicitud.
6. Desde la solicitud se generan uno o más Presupuestos.
7. La solicitud queda `converted` y guarda `convertedQuoteIds`.

## Flujo web

El endpoint público `POST /api/public/quick-quote` ya no crea presupuestos definitivos ni leads duplicados directamente.

Ahora:

1. Valida salón activo.
2. Crea o reutiliza Lead con deduplicación centralizada.
3. Crea `QuoteRequest` con `source = quick_quote`.
4. Registra actividad en el Lead.
5. Crea notificación interna.
6. Intenta email si está configurado.
7. Responde: “Recibimos tu solicitud. Un asesor de M&M Eventos se contactará para enviarte el presupuesto.”

## Deduplicación

La lógica vive en `apps/api/src/modules/crm/lead-dedupe.service.ts`.

Normalización:

- Email: `trim` y lowercase.
- Teléfono: remueve espacios, guiones, puntos y paréntesis.
- Nombre y apellido: `trim` y lowercase para comparación.

Reglas:

- Si coincide email normalizado, reutiliza Lead.
- Si coincide teléfono normalizado, reutiliza Lead.
- Si hay coincidencias menos concluyentes por nombre/apellido más email/teléfono, guarda `possibleDuplicateLeadIds`.
- Si no hay coincidencia fuerte, crea Lead nuevo.
- Si reutiliza Lead, completa sólo campos vacíos seguros y agrega salones sin duplicar.

## Endpoints

Base autenticada: `/api/quote-requests`.

- `GET /api/quote-requests`
- `POST /api/quote-requests`
- `GET /api/quote-requests/:id`
- `PATCH /api/quote-requests/:id`
- `DELETE /api/quote-requests/:id`
- `PATCH /api/quote-requests/:id/status`
- `PATCH /api/quote-requests/:id/take`
- `PATCH /api/quote-requests/:id/discard`
- `PATCH /api/quote-requests/:id/mark-duplicated`
- `POST /api/quote-requests/:id/convert-to-quotes`

Filtros soportados en listado:

- `status`
- `source`
- `salonId`
- `assignedToUserId`
- `leadId`
- `search`
- `dateFrom`
- `dateTo`
- `page`
- `limit`
- `sortBy`
- `sortOrder`

## Notificaciones

Al crear una solicitud se crea una notificación interna con:

- `type = quote_request_created`
- título “Nueva solicitud de presupuesto”
- `actionUrl = /admin/quotes/requests/:id`
- metadata con `quoteRequestId`, `leadId`, `salonIds`, `relatedEntityType` y `relatedEntityId`

Resolución de destinatarios:

1. Managers asignados por `managerUserId` en salones interesados.
2. Si no hay managers, usuarios con rol `ADMIN`, `MANAGER` o `SALES`.

## Email

El servicio reutiliza Nodemailer en `apps/api/src/modules/email/email.service.ts`.

Variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `EMAIL_NOTIFICATIONS_ENABLED`

Si `EMAIL_NOTIFICATIONS_ENABLED` está apagado o faltan credenciales, el email se omite y el flujo no falla.

## UI

En `/admin/quotes` hay dos pestañas:

- Solicitudes
- Presupuestos

El listado de Solicitudes permite:

- Ver detalle.
- Tomar solicitud.
- Generar presupuesto.
- Abrir WhatsApp con mensaje precargado.
- Marcar duplicada.
- Descartar.

El detalle `/admin/quotes/requests/:id` muestra datos recibidos, Lead asociado, posibles duplicados, solicitudes anteriores, presupuestos anteriores y actividad del Lead.

En detalle de Lead se muestran Solicitudes de Presupuesto y Presupuestos asociados.

## Conversión

`POST /api/quote-requests/:id/convert-to-quotes`:

1. Valida que la solicitud no esté descartada ni duplicada.
2. Usa datos de la solicitud y el Lead asociado.
3. Genera un presupuesto por salón seleccionado.
4. Usa reglas comerciales por salón cuando se elige plantilla.
5. Genera PDF con el servicio actual de presupuestos.
6. Guarda `convertedQuoteIds`.
7. Marca la solicitud como `converted`.
8. Registra actividad en el Lead.

## Gaps

- La granularidad completa de permisos por rol comercial se apoya en los permisos existentes de Presupuestos; no se creó un permiso nuevo específico para Solicitudes.
- El envío real de email depende de variables SMTP y `EMAIL_NOTIFICATIONS_ENABLED=true`.
- No se implementó integración oficial de WhatsApp; se usa `wa.me`.
- La UI de notificaciones existente mostrará el registro si consume el modelo actual; no se rediseñó ese módulo.
- No se implementaron contratos, eventos, pagos, Mercado Pago ni PDF avanzado.
