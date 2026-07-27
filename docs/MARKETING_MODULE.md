# Módulo de Marketing y Campañas

Módulo independiente para crear promociones, plantillas de email, audiencias segmentadas y campañas de email dirigidas a Leads y Clientes. No depende de `Event`/`Salon`/`Customer` de forma obligatoria (mismo principio de independencia que Invitaciones/Entradas digitales, ver `docs/INDEPENDENT_DIGITAL_MODULES_CORRECTION.md`), aunque una campaña puede opcionalmente asociarse a un salón o a una promoción.

## 1. Arquitectura

Backend: `apps/api/src/modules/marketing/`

| Archivo | Responsabilidad |
|---|---|
| `marketing.models.ts` | Todos los esquemas Mongoose: `MarketingSettings`, `MarketingTemplate`, `Promotion`, `MarketingAudience`, `MarketingCampaign`, `MarketingRecipient`, `MarketingUnsubscribe` (histórico), `MarketingSendLog`, `MarketingWebhookEvent` |
| `marketing-audience.service.ts` | Motor de segmentación: construye queries de Lead/Customer a partir de filtros, deduplica y excluye emails inválidos o exclusiones manuales |
| `marketing-variables.service.ts` | Sustitución de variables `{{var}}` / `{{var \| default: "..."}}`, con escape HTML y fallback |
| `marketing-sample-context.ts` | Datos ficticios para previsualización y envíos de prueba (nunca datos reales) |
| `marketing-email.provider.ts` | Abstracción `MarketingEmailProvider` (mock / Resend vía `fetch`, sin SDK) |
| `marketing-sanitize.service.ts` | Sanitización del HTML de campañas/plantillas (`sanitize-html`) antes de guardar/enviar |
| `marketing-campaign.service.ts` | Snapshots congelados, preparación idempotente de destinatarios, render por destinatario, envío de prueba, motor de procesamiento por lotes (locks Mongo), cancelación, reintentos |
| `marketing-settings.service.ts` | Configuración institucional (singleton) |
| `campaigns.routes.ts`, `templates.routes.ts`, `audiences.routes.ts`, `promotions.routes.ts`, `marketing-settings.routes.ts`, `dashboard.routes.ts` | CRUD y acciones, todas detrás de `requireAuth` + permisos granulares |
| `internal.routes.ts` | `GET/POST /process` (cron, protegido por secreto) y `POST /webhooks/:provider` (firma Svix) — **sin** `requireAuth` |

Frontend: `apps/web/src/app/admin/marketing/**` (Resumen, Campañas, Plantillas, Audiencias, Historial, Configuración) + `apps/web/src/features/marketing/` (editor visual de bloques, renderer HTML, tipos). Promociones se retiró de la navegación, el resumen y el editor de campañas; se conserva el modelo y las referencias históricas de campañas para no alterar datos existentes.

Al iniciar una campaña, el formulario inicial no crea ningún registro hasta confirmar **Guardar y continuar**. Las campañas en estado borrador, cancelada o fallida se pueden eliminar mediante borrado lógico, respetando el permiso `campaigns.delete` y el alcance por salón.

## 2. Modelos y snapshots congelados

Una `MarketingCampaign` congela, al prepararse (`freezeCampaignSnapshots`), una copia de `MarketingTemplate`, `Promotion`, `MarketingAudience` y del remitente en `templateSnapshot` / `promotionSnapshot` / `audienceSnapshot` / `senderSnapshot`. Editar la plantilla/promoción/audiencia original **después** de ese momento no altera una campaña ya preparada o enviada — mismo principio que presupuestos/eventos/contratos (ver `docs/MYM_EVENTOS_PROJECT_CONTEXT.md` §2).

`MarketingRecipient` es un documento por (campaña, contacto): guarda estado (`pending → processing → sent/failed/skipped/delivered/opened/clicked`) e intentos. Las columnas de baja se preservan solo para registros históricos creados antes de retirar ese circuito.

## 3. Segmentación de audiencias

`resolveAudienceContacts` (en `marketing-audience.service.ts`) combina:

- Filtros de **Lead**: estado, salón, fuente, tipo de evento, fecha de evento, cantidad de invitados, etiquetas (`tags`, campo nuevo agregado a `Lead`), responsable asignado, con/sin presupuesto, presupuesto enviado, convertido, email válido.
- Filtros de **Customer**: salón, fecha de alta, eventos pasados/futuros (agregación sobre `Event`), tipo de evento, cantidad mínima de eventos, cliente reciente/histórico, etiquetas (`tags`, campo nuevo agregado a `Customer`), email válido.
- Lista **manual** de contactos (source `manual`).

**Decisión de diseño** — Las campañas son comunicaciones comerciales directas a leads y clientes, no un newsletter. No se generan enlaces de baja ni se usa la lista histórica `MarketingUnsubscribe` para filtrar destinatarios nuevos. Ese modelo se conserva únicamente para no perder los registros ya existentes.

No se agregaron los filtros "fecha de último contacto" ni "mes de cumpleaños" porque **no existe ese dato** en `Lead`/`Customer` hoy (`lastContactedAt`, `birthDate`) — agregarlos habría requerido tocar el modelo de Lead/Customer sin necesidad real y generar un filtro que no puede alimentarse con datos reales. Si se necesitan, es una tarea aparte que primero debe agregar el campo al CRM.

La resolución de contactos nunca devuelve la lista completa al navegador: `POST /audiences/estimate` devuelve solo conteos, `POST /audiences/preview` devuelve una muestra acotada (`sampleSize`, máx. 50).

## 4. Editor visual de bloques de email

No existía ningún editor de bloques/drag-and-drop en el proyecto. Se construyó uno propio (`apps/web/src/features/marketing/email-block-editor.tsx`) siguiendo el mismo patrón ya usado por `InvitationVisualWorkspace` (secciones con orden/habilitado/duplicar, panel de edición, toggle desktop/mobile) en vez de sumar una dependencia externa de email builder.

- El contenido se guarda como JSON (`contentJson: { blocks, settings }`) — nunca solo HTML, para poder reeditarlo.
- `email-html-renderer.ts` convierte ese JSON a HTML apto para email (tablas anidadas, estilos inline) y a texto plano, **dejando los tokens `{{variable}}` sin resolver** — la sustitución real ocurre en el backend, por destinatario, al momento del envío (o con datos de ejemplo, en la previsualización).
- Tipos de bloque: logo, título, texto, imagen, botón, separador, espaciado, columnas, bloque de promoción, redes sociales, datos de contacto y pie institucional.
- El HTML se sanitiza en el backend (`marketing-sanitize.service.ts`, librería `sanitize-html`) antes de guardarse, tanto en plantillas como en campañas — nunca se confía en el sanitizado del cliente.

## 5. Variables dinámicas

Ver `packages/shared/src/constants/marketing.ts` (`MARKETING_DYNAMIC_VARIABLES`). Sintaxis: `{{variable}}` o `{{variable | default: "texto"}}`. `renderMarketingVariables` escapa HTML por defecto (protege contra inyección vía nombre de Lead/Customer) y permite desactivar el escape para el HTML ya sanitizado del cuerpo del email.

## 6. Envío por lotes (ver `docs/MARKETING_CAMPAIGNS_OPERATIONS.md` para el detalle operativo)

No existía ningún motor de cron en el proyecto. Se agregó el primero, siguiendo exactamente el patrón que ya proponía `docs/MYM_EVENTOS_LIFECYCLE_COMPLETION_AUDIT.md` para el futuro motor de calendario: endpoint interno protegido por secreto + Vercel Cron, sin colas en memoria ni estado global no persistente. El lock de campaña y de destinatario usa el mismo patrón de `findOneAndUpdate` con filtro de estado que ya usan `TicketOrder`/`TicketRefund`.

## 7. Permisos

Se extendieron los permisos `campaigns.*`/`promotions.*` ya reservados en `packages/shared/src/constants/permissions.ts` (existían en el enum y en `RolePresets[MANAGER]` sin ningún backend detrás) y se agregaron `marketingTemplates.*`, `marketingAudiences.*`, `marketingSettings.*`. Ver §22 del brief original y `RolePresets` para el detalle por rol — `SALON_MANAGER` puede crear/editar campañas y audiencias de su propio salón pero no enviarlas ni tocar la configuración global salvo que se le otorgue el permiso puntual vía `permissionOverrides`.

## 8. Auditoría

Cada mutación relevante llama a `writeAuditLog` (creación/edición/envío/programación/cancelación/eliminación/reintento de campañas, cambios de promoción/plantilla/audiencia/configuración, exportaciones). No se audita el HTML completo, solo metadata.

## 9. Limitaciones conocidas

- El tracking de apertura/clic depende de que el proveedor sea Resend (con tracking propio activado) — con el proveedor `mock` esas métricas quedan en 0, nunca simuladas.
- No hay UI para editar `excludedMembers` de una `MarketingAudience` (exclusión de un Lead/Customer puntual dentro del segmento reutilizable); sí existe "excluir destinatarios específicos por email" a nivel de campaña (paso 2 del asistente).
- El "Historial de envíos" reutiliza el listado de campañas filtrado por estado (no hay una colección de historial separada); `MarketingSendLog` guarda el detalle técnico por intento pero no tiene una pantalla propia todavía.
- El disparo del procesamiento por lotes corre en dos capas gratuitas: GitHub Actions cada 10 minutos (cadencia real) + Vercel Cron una vez al día como red de seguridad (compatible con el plan Hobby gratuito, que no admite una frecuencia mayor). Ninguna requiere plan pago — ver `docs/MARKETING_CAMPAIGNS_OPERATIONS.md` §3 para la configuración de los secrets de GitHub Actions.
