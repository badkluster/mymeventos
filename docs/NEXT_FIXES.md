# Siguientes Arreglos (Next Fixes)

Este es el orden recomendado para arreglar los problemas identificados en la auditoría y construir el sistema sin romper dependencias:

## 1. Arreglar la instalación de dependencias (Bloqueante)
- **Problema:** `pnpm install` falla por la política de seguridad `minimumReleaseAge` de pnpm (ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION).
- **Acción:** Deshabilitar temporalmente o ajustar el valor de `minimumReleaseAge` en `.npmrc` o ejecutar `pnpm install --config.minimumReleaseAge=0`.
- **Razón:** Sin las dependencias, Next.js y Express no pueden ser compilados (typecheck/build/test).

## 2. Desarrollar la Fundación de la API (Prompt 4)
- **Problema:** El backend actual es un esqueleto vacío sin autenticación ni middlewares.
- **Acción:**
  1. Configurar carga de variables de entorno (Config loader).
  2. Añadir middleware de manejo de errores globales (Error Handler).
  3. Crear middleware de validación Zod.
  4. Implementar endpoints de autenticación y middleware RBAC / Salon scope.

## 3. Desarrollar la Fundación Web (Prompt 5 y 6)
- **Problema:** El frontend tiene dependencias base pero no tiene la estructura de shadcn/ui inicializada ni layout del Backoffice protegido.
- **Acción:**
  1. Ejecutar `npx shadcn-ui@latest init` y agregar componentes base (button, input, form, table).
  2. Instalar y configurar `framer-motion`.
  3. Crear `/app/admin/layout.tsx` protegido que redirija si no hay token de autenticación.
  4. Diseñar la Landing Page con placeholders de SEO.

## 4. Completar Modelos de Base de Datos (Prompt 3 y 7-13)
- **Problema:** Faltan los modelos críticos como `Lead`, `Customer`, `Quote`, `Ticket`, plantillas de invitaciones y campañas de marketing. Además faltan índices explícitos y campos `deletedAt`.
- **Acción:** Escribir todos los modelos en `apps/api/src/models` siguiendo el Domain Model.

## 5. Implementar Módulos y Lógica de Negocio (Prompt 7-13)
- **Orden Sugerido:**
  1. CRM (Leads, Customers).
  2. Eventos y Calendario.
  3. Finanzas (Planes de Pago y Pagos manuales).
  4. Inventario (Reserva por fechas).
  5. Productos y Proveedores (Historial de Precios).
  6. Ticketing (Validación QR).
  7. Marketing e Invitaciones Digitales.

## 6. Escribir y Pasar los Tests
- **Problema:** Faltan los tests unitarios requeridos por cada módulo.
- **Acción:** A medida que se avance con el Paso 5, crear los archivos `.test.ts` correspondientes validando la lógica aislada de base de datos.
