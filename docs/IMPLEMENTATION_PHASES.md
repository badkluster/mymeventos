# Fases de Implementación

Para asegurar un desarrollo iterativo y no implementar todo a la vez sin validación real, el proyecto se dividirá en las siguientes fases:

## Fase 1: Fundaciones y Arquitectura
- Configuración del monorepo (Frontend y Backend).
- Configuración de base de datos (MongoDB).
- Implementación de Autenticación Segura (JWT, Cookies httpOnly).
- Sistema de Roles, Permisos y gestión de Salones.

## Fase 2: Landing Page y Captación de Leads
- Desarrollo de la página pública en Next.js (SEO friendly).
- Diseño premium, animaciones, componentes estáticos.
- Formularios de contacto y presupuesto rápido.
- Creación de Leads en la base de datos a partir de la web.
- Enlaces de WhatsApp.

## Fase 3: CRM y Gestión de Clientes (Backoffice)
- Dashboard base.
- CRUD de Leads, visualización de historial, notas.
- Conversión de Lead a Cliente (Customer).
- Gestión de presupuestos (Quotes).

## Fase 4: Gestión de Eventos y Calendario
- Creación y edición de Eventos.
- Reglas de invitados y cálculos de precios.
- Cronograma del evento, menús, servicios.
- Visualización de calendario respetando los permisos de salón.
- Importación/exportación de lista de invitados.

## Fase 5: Finanzas: Pagos y Productos
- Registro de pagos manuales.
- Planes de pago, señas, cuotas e intereses por mora.
- Gestión de Productos y Proveedores con historial de precios.

## Fase 6: Inventario y Stock Basado en Fechas
- CRUD de ítems de stock.
- Lógica de asignación de stock y cálculo de disponibilidad por rango de fechas.
- Flujo de devolución y control de faltantes/roturas pos-evento.

## Fase 7: Marketing, Promociones e Invitaciones
- Módulo de promociones y ofertas (aplicables globalmente o por salón).
- Módulo de envíos de email con Nodemailer.
- Generador de invitaciones digitales (plantillas configurables).

## Fase 8: Venta de Entradas y Códigos QR
- Configuración de eventos con venta de entradas.
- Generación de QR único y envío por correo electrónico.
- Interfaz móvil en el backoffice para escaneo y validación de QR.

## Fase 9: Aplicación Móvil para Personal
- Desarrollo de App en Expo React Native.
- Login, control de asistencia (check-in/check-out) con geolocalización.
- Historial de asistencia y reporte de horas trabajadas para nómina.
