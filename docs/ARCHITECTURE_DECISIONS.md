# Decisiones de Arquitectura

## Estructura del Repositorio
- **Monorepo**: Se utilizará una estructura de monorepo para facilitar la gestión de dependencias y el código compartido entre el frontend, backend y futura app móvil.

## Stack Tecnológico
- **Frontend Web**: Next.js App Router con TypeScript.
- **Backend API**: Node.js con Express y TypeScript.
- **Aplicación Móvil**: Expo React Native con TypeScript (en una fase posterior).
- **Base de Datos**: MongoDB con Mongoose.
- **Validación de Datos**: Zod.
- **Interfaz de Usuario (UI)**: TailwindCSS y shadcn/ui.
- **Animaciones**: Framer Motion.
- **Almacenamiento de Archivos**: Cloudinary.
- **Envío de Correos**: Nodemailer con SMTP de Gmail (abstraído para permitir reemplazo a futuro).

## Temática y Diseño
- **Estilo**: Premium, elegante, moderno.
- **Paleta de Colores**: Negro, gris, blanco. Visuales sutiles de lujo.
- **Backoffice**: Soporte para modos claro y oscuro (Light/Dark mode).
- **Efectos**: Parallax donde sea útil y transiciones modernas.

## Autenticación y Autorización
- **Autenticación**: Login con usuario y contraseña. Flujo de tokens de acceso (corto tiempo de vida) y actualización (refresh token) utilizando cookies `httpOnly` seguras para mitigar XSS y diseño consciente de CSRF.
- **Almacenamiento de Tokens**: Los refresh tokens deben guardarse hasheados en la base de datos.
- **Autorización**: Control de acceso basado en roles (RBAC) con permisos granulares y control de visibilidad de datos basado en la asignación de salones.

## Restricciones
- **Infraestructura**: NO se utilizará Docker, Dockerfile ni docker-compose.
- **WhatsApp**: Se utilizarán enlaces `wa.me` con mensajes pre-llenados. La integración con la API oficial de WhatsApp Business queda para el futuro.

## Calidad y Documentación
- **Documentación de API**: Swagger / OpenAPI.
- **Testing**: Pruebas unitarias para reglas críticas (pagos, intereses por mora, disponibilidad de stock por fecha, unicidad y uso de QR).
