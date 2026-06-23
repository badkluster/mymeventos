# Contexto del Proyecto: M&M Eventos

## Resumen del Proyecto
M&M Eventos es una empresa de eventos con múltiples salones: San Carlos, Villa Elisa y La Plata. La plataforma debe incluir una landing page pública orientada al SEO, un backoffice interno, gestión de leads (clientes potenciales), presupuestos, gestión de eventos, calendario, seguimiento de pagos, asignación de stock por fechas, gestión de personal, promociones, email marketing, invitaciones digitales, venta de entradas con QR y, en una fase posterior, una aplicación móvil en React Native para el control de asistencia del personal.

## Reglas de Negocio Centrales
- Toda persona que contacta a M&M se convierte en un **Lead** (Cliente Potencial).
- Un Lead puede provenir de formularios web, formularios de presupuesto rápido, promociones, WhatsApp, creación manual o flujos de entradas/invitaciones.
- Un Lead se convierte en **Customer** (Cliente) cuando se crea un Evento. El Evento puede crearse a partir de un presupuesto aceptado o directamente.
- Los Leads deben soportar estados, origen, usuario asignado, salón asignado, historial de actividad, notas y motivo de pérdida.

## Roles Principales
- ADMIN
- MANAGER
- SALON_MANAGER
- STAFF
- ACCOUNTING
- OPERATIONS
- SALES
- VALIDATOR

Los usuarios pueden pertenecer a uno o múltiples salones. La visibilidad dependerá de los permisos y los salones asignados.

## Requisitos de la Landing Page
- Landing page en Next.js optimizada para SEO.
- Identidad visual premium, elegante, con colores negro/gris/blanco y efectos de parallax.
- Secciones: salones, paquetes, servicios, catering, DJ/luces, galería, promociones, ofertas flash, ubicaciones, testimonios, FAQs, presupuesto rápido, contacto.
- Cotización rápida que genera precio estimado y crea un Lead notificando al responsable.
- Botón flotante de WhatsApp que redirige al número del responsable del salón seleccionado.

## Requisitos del Backoffice
- Dashboard con métricas.
- Gestión de salones, usuarios, roles, leads, clientes, presupuestos, eventos, pagos, stock, productos, proveedores, personal, campañas, invitaciones, entradas.
- Calendario con visibilidad basada en permisos de salón.

## Requisitos de Eventos
- Detalles: Cliente, contacto alternativo, salón, tipo, homenajeado, fecha, horarios.
- Invitados: adultos, niños, adolescentes (reglas de precios configurables).
- Servicios y menús detallados.
- Cronograma del evento.
- Asignación de stock por fecha.
- Gestión de pagos, tareas, archivos, notas e historial.
- Importación/exportación de lista de invitados (Excel/Word).

## Pagos
- Ingreso manual de pagos desde el backoffice (inicialmente).
- Soporte para transferencia, efectivo, futuro Mercado Pago.
- Planes de pago, depósitos, cuotas, saldo final.
- Intereses por mora configurables.

## Stock / Inventario
- El stock es global pero la disponibilidad se calcula por fecha del evento.
- Flujo de retorno: devuelto, roto, faltante, sucio, perdido.
- Generación de cargos por roturas o faltantes.

## Promociones, Invitaciones y Entradas
- Gestión de promociones, descuentos, email marketing (Nodemailer).
- Invitaciones digitales basadas en plantillas cerradas creadas desde el backoffice.
- Entradas con código QR de un solo uso validables desde dispositivo móvil.

## Aplicación Móvil (Fase Futura)
- React Native (Expo) para control de asistencia de empleados (Check-in/Check-out con geolocalización).
