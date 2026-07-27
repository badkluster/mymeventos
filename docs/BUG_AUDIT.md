# Auditoría de bugs

Fecha: 2026-07-27. Las severidades describen el impacto actual; los riesgos de dependencia se registran también en `CODEBASE_AUDIT.md`.

## HIGH — autorización de Cloudinary insuficiente

- Área / archivo: API, `apps/api/src/modules/uploads/uploads.routes.ts`.
- Reproducción previa: con cualquier Bearer/cookie válido, enviar `DELETE /api/uploads?context=users&publicId=<asset-ajeno>&resourceType=image`; el contexto `users` autorizaba a todo usuario y no comprobaba propiedad. El upload también aceptaba un `folder` arbitrario.
- Causa raíz: autorización basada solo en contexto, sin vincular `publicId` o carpeta a identidad/alcance de salón.
- Impacto: borrado de avatar ajeno o de assets conocidos; uso de carpetas Cloudinary fuera del alcance del usuario.
- Solución: carpeta fija `mym-eventos/users/<userId>`; borrado por prefijo de usuario; para `salons`, `salonId`, prefijo y `canAccessSalon` obligatorios; para otros contextos se valida su prefijo.
- Prueba agregada: `apps/api/tests/uploads-routes.test.ts` (2 casos: carpeta cliente ignorada y borrado ajeno 403).
- Estado: corregido y probado.

## Alcance diferido — Turnos y Avisos móviles

- Área / archivo: móvil, `apps/mobile/src/navigation/{ScheduleNavigator,NotificationsNavigator}.tsx` y sus pantallas.
- Estado actual: Inicio, Historial y Perfil son las únicas pestañas expuestas. Turnos y Avisos quedan fuera del árbol de navegación y del runtime por decisión comercial.
- Decisión: conservar código, pantallas y rutas API sin eliminarlos ni reexponerlos hasta que el cliente acuerde favorablemente ese alcance.
- Seguimiento: figura como candidato de funcionalidad diferida en `DEAD_CODE_CANDIDATES.md`; no se clasifica como bug a corregir en esta entrega.

## MEDIUM — enlace de restablecimiento móvil sin consumidor

- Área / archivo: móvil, `apps/mobile/src/navigation/RootNavigator.tsx`; API ya generaba el enlace en `mobile-auth.routes.ts`.
- Reproducción previa: abrir `mymeventos://reset-password?token=<token>`; la app no observaba URLs ni navegaba a `ResetPassword`.
- Causa raíz: faltaba manejo de `Linking.getInitialURL`/evento URL y navegación inicial con parámetros.
- Impacto: recuperación por email obligaba a copiar el código manualmente; el enlace prometido no funcionaba.
- Solución: parser estricto de scheme/host, observador de URL inicial y en ejecución, limpieza de sesión local y entrada inicial a ResetPassword con token.
- Prueba agregada: `apps/mobile/src/lib/__tests__/deepLink.test.ts` (URL válida y tres casos inválidos).
- Estado: corregido y probado unitariamente; falta prueba manual en dispositivo para asociación de scheme del SO.

## MEDIUM — rutas de Operaciones implementadas pero no expuestas

- Área / archivo: API, `catalog.routes.ts`, `inventory.routes.ts`, `consumption-rules.routes.ts`; `apps/api/src/routes/index.ts`.
- Reproducción: solicitar sus prefijos esperados bajo `/api`; no hay `router.use` que monte esos routers. No existen páginas web correspondientes.
- Causa raíz: módulo interrumpido/no integrado.
- Impacto: catálogo, inventario y reglas de consumo son inaccesibles por API normal; mantenimiento de código sin función actual.
- Solución sugerida: decisión explícita de integrar (rutas, RBAC, alcance y UI) o retirar en una tarea de producto con migración/validación.
- Prueba: grafo local y revisión de registro de rutas; no se agregó prueba por no modificar el módulo.
- Estado: pendiente, conservado por precaución.

## MEDIUM — limitación de tasa no distribuida y sin cobertura específica de auth

- Área / archivo: API, `middlewares/publicRateLimit.ts`, rutas auth/móvil.
- Reproducción: ejecutar en múltiples instancias; cada proceso mantiene su propio Map. Login y recuperación móvil no usan el middleware.
- Causa raíz: limitador local diseñado para rutas públicas concretas.
- Impacto: protección insuficiente frente a fuerza bruta o abuso al escalar horizontalmente.
- Solución sugerida: rate limit compartido (gateway/Redis) y presupuesto específico para login/forgot-password, con monitorización.
- Prueba: revisión estática y documentación del propio middleware.
- Estado: pendiente; no se cambió para no introducir una dependencia operativa nueva sin infraestructura.

## LOW — request y acciones de pago de contrato sin interfaz

- Área / archivo: web, `apps/web/src/app/admin/contracts/[id]/page.tsx`.
- Reproducción previa: abrir un contrato; la página hacía un request de pagos, pero no renderizaba resultado, formulario ni acciones.
- Causa raíz: remanente de una versión incompleta de pagos en contrato.
- Impacto: request innecesario y código confuso; no afectaba el flujo real de pagos.
- Solución: se retiraron request, estados, funciones y tipos privados inalcanzables.
- Prueba: lint, typecheck y build web; el endpoint y flujo real de pagos no se modificaron.
- Estado: corregido.

## LOW — advertencias de calidad web pendientes

- Área: 40 warnings ESLint, principalmente dependencias de hooks y uso de `<img>`.
- Causa: callbacks definidos por render y optimización de imágenes no uniforme.
- Impacto: potenciales cierres stale, requests innecesarios y LCP subóptimo; no se confirmó un fallo concreto para cada warning.
- Solución sugerida: revisar cada flujo y extraer callbacks estables con pruebas de interacción; evaluar `next/image` solo donde no cambie requisitos de hosting/costo.
- Estado: pendiente, no silenciado.
