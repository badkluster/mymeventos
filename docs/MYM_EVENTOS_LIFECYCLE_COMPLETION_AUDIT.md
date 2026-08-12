# M&M Eventos — Auditoría de alcance y estado actual

> **Actualizada el 2026-08-12.** Esta versión reemplaza la auditoría del 2026-07-22, cuyas conclusiones sobre disponibilidad, automatizaciones, producción, gastos, cierres, reportes y aplicación móvil quedaron superadas por implementaciones posteriores.
>
> La revisión compara el código actual con la propuesta comercial `propuesta-mym-eventos.pdf`. No consulta, inserta ni modifica datos. Por eso separa expresamente lo que está implementado en código de lo que requiere validación en el entorno productivo o de carga de contenidos.

---

## 1. Conclusión ejecutiva

El producto ya implementa el **paquete completo recomendado de la propuesta**: Plan Premium, invitaciones digitales, venta de entradas con QR y Mercado Pago. Además, excede de forma amplia el alcance inicial con módulos operativos, financieros, de personal, marketing, analítica y móvil.

No corresponde describirlo como un proyecto incompleto de CRM básico. El núcleo actual cubre el circuito comercial y operativo:

```text
Landing / consulta
  → Lead y solicitud de presupuesto
  → Presupuesto y cliente
  → Evento, disponibilidad de salón y contrato
  → Cobros, producción, proveedores, stock y gastos
  → Cierre integral, reportes y rentabilidad

Módulos independientes:
  → Invitaciones digitales y RSVP
  → Entradas digitales, QR y Mercado Pago
  → Asistencia y nómina del personal
```

Las diferencias funcionales reales frente a la propuesta son acotadas:

1. El RSVP público de la invitación no expone todavía la **cantidad de asistentes** ni teléfono/email; la propuesta sí los contempla. El modelo interno admite cupos, adultos, menores y acompañantes, pero el formulario y el esquema público no los reciben.
2. No se encontró una exportación CSV/Excel propia del listado de entradas/asistentes. La propuesta la deja como opcional, condicionada a definir formato.
3. Mercado Pago está implementado, pero una auditoría de código no puede certificar sus credenciales, URL pública de webhook ni una transacción de prueba real.
4. La propuesta define contenido y carga iniciales; el código permite administrarlos, pero esta revisión no determina cuáles están efectivamente cargados.

---

## 2. Evidencia y límites de la revisión

### Verificado en código

- Rutas web, API y módulos de dominio de `apps/web`, `apps/api`, `apps/mobile` y `packages/shared`.
- Registro efectivo de rutas del backend en `apps/api/src/routes/index.ts`.
- Implementaciones de invitaciones, entradas, Mercado Pago, automatizaciones, producción, gastos, cierres y reportes.
- `pnpm --filter @mym/api typecheck`, `pnpm --filter @mym/web typecheck` y `pnpm --filter @mym/mobile typecheck`: correctos.
- Suite focalizada de invitaciones y entradas: 6 archivos y 20 pruebas aprobadas.

### No verificable sin entorno y datos reales

- Credenciales y activación real de Mercado Pago, Cloudinary, correo y cron en producción.
- Entrega de correos, notificaciones o webhooks externos.
- Carga inicial de salones, servicios, promociones, imágenes, usuarios, eventos y templates aprobados.
- Calidad visual final con los contenidos reales y aprobación comercial de cada template.

---

## 3. Matriz de cumplimiento de la propuesta

| Bloque de la propuesta | Estado | Evidencia principal | Observación |
|---|---|---|---|
| Landing administrable: salones, servicios, galería, promociones, testimonios, CTA WhatsApp/formulario | **Implementado** | `landing`, `salons`, landing pública y rutas SEO | Incluye más contenido administrable que el mínimo pedido: FAQs, tipos de evento y pasos comerciales. |
| Captación, clientes y consultas con historial | **Implementado** | `crm/leads`, `quote-requests`, `customers` | Incluye deduplicación, actividades, responsables y seguimiento. |
| Calendario, eventos, visitas, reuniones y recordatorios | **Implementado** | `calendar-items`, `calendar-tick`, alertas de evento | El tick está programado diariamente en `vercel.json`. |
| Salones: disponibilidad, capacidad y ocupación | **Implementado** | `salons`, `events`, `assertVenueAvailable` | Bloquea superposiciones horarias de eventos reservados o confirmados y cuenta con índice de soporte. |
| Servicios, combos, menús, precios y adicionales | **Implementado** | presupuestos, catálogo, reglas comerciales y edición de evento | Supera el mínimo con PACKAGE/CUSTOM/HYBRID, snapshots y recálculo en backend. |
| Presupuestos y conversión a evento | **Implementado** | `quotes`, `quote-to-event` | Conversión idempotente, historial de revisiones y PDFs. |
| Personal por evento | **Implementado** | asignaciones de evento, asistencia y app móvil | Incluye turnos, estados de asignación, fichaje, incidencias y correcciones. |
| Stock e inventario básico | **Implementado y ampliado** | stock por salón, asignación de vajilla, catálogo, inventario y producción | La reserva de vajilla valida disponibilidad por fecha. |
| Pagos manuales, señas, saldos y vencimientos | **Implementado** | `payments`, contratos y recordatorios | Incluye recibos PDF, cobranzas y seguimiento de vencidos. |
| Archivos e imágenes | **Implementado** | `uploads`, Cloudinary y galerías por módulo | Disponible para landing, salones, invitaciones, entradas y documentos. |
| Dashboard, reportes y permisos | **Implementado y ampliado** | `dashboard`, `reports`, usuarios y permisos | Reportes exportables CSV/Excel y control granular por permisos. |
| Seguimiento comercial, promociones y recordatorios | **Implementado** | `marketing`, automatizaciones CRM y dashboard | Incluye campañas de email, audiencias, plantillas e historial. |
| Invitaciones digitales básicas y premium | **Implementado con una diferencia** | `invitations`, renderer público y editor visual | Falta exponer cantidad/teléfono/email en el RSVP público. |
| Entradas digitales con QR | **Implementado** | `tickets`, páginas públicas, scanner y check-in | Incluye cupos, órdenes, PDFs, QR, validación y estados. |
| Exportación de entradas/asistentes | **Pendiente opcional** | No se encontró endpoint/UI de export específico | La propuesta sólo lo incluye si se define el formato. |
| Mercado Pago | **Implementado en código; pendiente validación operativa** | provider, checkout, webhook firmado y reembolsos | Requiere credenciales y prueba controlada en el entorno objetivo. |
| Carga inicial incluida | **No auditable desde código** | Administración disponible en los módulos | Requiere contrastar datos actuales con los límites de la propuesta. |

---

## 4. Invitaciones digitales — contraste específico

### Implementado

- Templates administrables, de nivel basic y premium, con contenido y apariencia acotados por capacidades de template.
- 18 definiciones de templates de sistema; el catálogo supera los 6 básicos y 3 premium incluidos en la propuesta.
- Editor visual controlado: secciones, colores, tipografías, imágenes, galerías, mapa, cuenta regresiva, dress code, contacto, RSVP y cierre.
- Enlaces públicos, publicación/despublicación, borrador, duplicado, regeneración de token y envío manual por correo o WhatsApp.
- Invitados con enlace individual, apertura personalizada y listado/estado interno de confirmaciones.
- RSVP con fecha límite, restricciones, mensaje, dieta y pedido de música; métricas de confirmaciones desde el panel.
- Vista responsive y renderer público separado del backoffice.

### Diferencias y decisiones pendientes

| Requisito de la propuesta | Estado actual | Acción sugerida |
|---|---|---|
| Nombre, cantidad de asistentes, teléfono/email y mensaje en RSVP | Parcial: nombre y mensaje están; cantidad/teléfono/email no se solicitan públicamente | Exponer `adults`, `minors`/acompañantes, teléfono y email en el esquema API y formulario público. |
| 3 templates premium: quince, boda y evento premium/social | Funcionalmente hay más de 3, pero el tercer template explícito es infantil | Confirmar si hace falta una plantilla identificada comercialmente como “evento premium/social”. |
| Alcance sin música ni efectos especiales personalizados | Se excedió deliberadamente: el nivel premium admite música, galería ampliada, agenda y regalos | Definir si se mantiene como diferencial comercial o se limita por plan/permiso. |

---

## 5. Entradas digitales y Mercado Pago — contraste específico

### Implementado

- Publicación pública de eventos, visibilidad, descripción, fechas, lugar, capacidad, imagen, estado y ventana de venta.
- Reserva concurrente de cupos, vencimiento de reservas, órdenes idempotentes, datos de comprador/asistente y emisión de entradas QR.
- Estados de orden, pago y entrada; panel de órdenes, compradores, cupos, check-in, reversión y auditoría de accesos.
- PDF individual y combinado, portal público de compra y envío de correos de compra/recordatorios.
- Checkout de Mercado Pago, webhook con validación HMAC, conciliación del estado, emisión después de aprobar y reembolsos.
- El simulador de pago sólo se permite fuera de producción; producción exige Mercado Pago configurado.

### Funciones que exceden lo presupuestado para el adicional de USD 50

- Múltiples tipos de entradas por publicación, en lugar de precio único.
- Precios promocionales y ventanas de promoción.
- Códigos de descuento, reglas de descuento y atribución de la comisión al organizador o comprador.
- Datos de asistente por entrada, no sólo del comprador.
- Reembolsos totales/parciales y trazabilidad de reembolsos.
- Emails de ciclo de vida: pago pendiente/rechazado, reserva vencida, reembolso y recordatorios de 48/24 horas.
- Documentos PDF, portal de compra protegido y reintentos de entrega.

### Pendiente operacional

Antes de comercializar el cobro real, validar en un entorno autorizado: credenciales, `TICKET_PAYMENT_PROVIDER=mercado_pago`, firma del webhook, URL de notificación, retorno del checkout, aprobación, rechazo, expiración y reembolso. Esa verificación debe evitar el uso de datos reales salvo autorización expresa.

---

## 6. Ciclo operativo actual

| Etapa | Estado actual |
|---|---|
| Consulta / lead | Formulario público, alta manual, deduplicación, asignación y timeline. |
| Solicitud y presupuesto | QuoteRequest, presupuestos PACKAGE/CUSTOM/HYBRID, revisiones, PDF y estados comerciales. |
| Cliente y evento | Conversión idempotente, snapshots, ficha integral y trazabilidad. |
| Reserva de salón | Control de solapamiento por horario para estados `reserved` y `confirmed`; índice `salonId + eventDate + status`. |
| Contrato y cobro | Contratos versionados, adendas, cuotas, recibos, recordatorios y gestión de cobranzas. |
| Planificación y ejecución | Producción estructurada por ítems y estados, proveedores, stock/vajilla, tareas y documentos operativos. |
| Gastos y rentabilidad | Categorías, gastos, asignaciones, proveedores, rentabilidad por evento y reportes. |
| Cierre | Checklist operativo, financiero y administrativo, bloqueos y reapertura con permisos. |
| Reportes | Comercial, eventos, contratos, pagos, control de cuotas y gastos; exportación CSV/Excel. |
| Personal | Usuarios, staff, asistencia, geolocalización, cola offline, incidencias, ajustes, liquidaciones y app móvil. |

---

## 7. Funcionalidades fuera de la propuesta original

La siguiente lista es **alcance adicional ya construido**, no una lista de faltantes.

### Comercial, contractual y financiero

- Solicitudes de presupuesto separadas de leads y presupuestos, deduplicación y trazabilidad de contactos.
- Revisiones versionadas de presupuesto y snapshots comerciales.
- Contratos versionados, addendas, generación e impresión de PDF.
- Planes de cuotas, recibos PDF, gestión de cobranzas vencidas y recordatorios financieros.
- Gastos, categorías, comprobantes, proveedores, asignaciones y rentabilidad por evento.

### Operación del evento

- Validación de disponibilidad horaria de salones para evitar dobles reservas confirmadas.
- Planes de producción, ítems con estados, consolidación de producción, catálogo y reglas de consumo.
- Reserva de vajilla/stock por fecha, con control de cantidad disponible frente a otros eventos.
- Gestión de proveedores por evento, documentos operativos, alertas y checklist de cierre integral.
- Cierre operativo, financiero y administrativo; reapertura controlada por permisos.

### Personal y app móvil

- Gestión de staff, turnos y asistencia.
- Fichaje móvil con geolocalización, validación de geocerca, biometría local, modo offline e incidencias.
- Historial de jornadas, solicitudes de corrección y control administrativo.
- Liquidación de sueldos, perfiles salariales, conceptos, adelantos y liquidaciones aprobadas.

### Marketing, analítica y canales públicos

- Audiencias, campañas de email, plantillas, métricas de campaña, bajas y promociones.
- Automatizaciones diarias: seguimiento de leads, cuotas, alertas de evento, producción, cierre y nómina.
- Analítica anónima del sitio, eventos/clics, heatmap y configuración de consentimiento.
- Páginas SEO por salón/contenido, `robots.ts`, `sitemap.ts` y metadatos estructurados.

### Seguridad, operación y administración

- Roles, permisos granulares, ámbito por salón, historial de accesos y registro de auditoría.
- Notificaciones de backoffice, configuración del sistema y health/readiness endpoints.
- Gestión de archivos con Cloudinary y URLs firmadas para documentos privados.

---

## 8. Brechas y prioridades actuales

| Prioridad | Brecha | Impacto | Próximo paso |
|---|---|---|---|
| Alta para cumplimiento literal | RSVP no captura cantidad, teléfono ni email | La invitación no satisface por completo el formulario definido en la propuesta | Completar API, UI y pruebas unitarias/funcionales. |
| Media | Exportación de entradas/asistentes no identificada | Falta la opción condicional del adicional de tickets | Acordar columnas y exportar CSV/Excel desde el panel. |
| Alta antes de cobro real | Integración Mercado Pago no validada en un entorno real | No puede certificarse el cobro ni webhook sólo leyendo código | Ejecutar plan de prueba autorizado, con datos de prueba. |
| Media de contenido | Template premium “social” no está nombrado como tal | Posible diferencia comercial/visual, no de arquitectura | Confirmar diseño aprobado o agregar/renombrar template. |
| Media de entrega | Carga inicial y configuración externa sin evidencia | El código puede estar completo y la entrega comercial seguir incompleta | Auditar una checklist de contenidos y configuración, en modo lectura. |

---

## 9. Estado de automatizaciones y despliegue

La afirmación histórica “no hay cron ni tareas programadas” es incorrecta. `vercel.json` programa:

- `/api/marketing/process` todos los días a las 06:00 UTC.
- `/api/internal/calendar-tick` todos los días a las 08:00 UTC.

El tick de calendario procesa dominios de recordatorios financieros, alertas de evento, resumen diario, revisión posterior al evento, seguimiento de cuotas, seguimientos comerciales, producción, cierres, jornadas abiertas, nómina y cumpleaños. Las entradas digitales además disponen de una ruta de automatización propia para expirar reservas y procesar reintentos/recordatorios.

La presencia del código y de la configuración no prueba que los secretos requeridos estén cargados ni que Vercel haya ejecutado el cron; ambos puntos son validaciones operativas posteriores.

---

## 10. Historial de conclusiones superadas

Las siguientes afirmaciones de la auditoría del 2026-07-22 no deben volver a usarse como estado actual:

- “No existe bloqueo de disponibilidad de salón/fecha”.
- “El calendario es manual y no hay automatizaciones”.
- “No existe gasto, producción, cierre ni reportes”.
- “El módulo de catálogo/inventario no está montado en la API”.
- “La app móvil es un scaffold sin pantallas”.
- “No hay estado/circuito de finalización y cierre”.
- “Los permisos de cancelación y borrado están declarados pero no aplicados”.

La corrección no significa que no queden mejoras: las brechas vigentes están concentradas en el formulario RSVP, la exportación opcional de tickets, las decisiones de template/contenido y la validación real de integraciones externas.

---

## 11. Recomendación de cierre comercial

Para declarar el alcance de la propuesta como entregado, priorizar:

1. Completar el RSVP con cantidad y datos de contacto, o acordar formalmente una reducción de alcance.
2. Definir si el listado de entradas necesita exportación y qué columnas debe contener.
3. Validar Mercado Pago, correo, almacenamiento y cron con una checklist de preproducción autorizada.
4. Revisar la carga inicial contra los límites acordados: 2 salones, 15 servicios/combos, 5 promociones, 30 imágenes, 5 usuarios, 5 eventos, 6 templates básicos, 3 premium, una invitación de ejemplo y un evento de entradas de ejemplo.
5. Acordar qué funcionalidades adicionales quedan como diferencial del producto y cuáles se mostrarán u ocultarán en la oferta comercial para evitar prometer un alcance distinto al vendido.
