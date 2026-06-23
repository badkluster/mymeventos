# Base web

La URL de API se configura con `NEXT_PUBLIC_API_URL=http://localhost:3001/api`. El cliente usa `credentials: 'include'`; las cookies httpOnly nunca se guardan en localStorage. El proveedor de sesión consulta `/auth/me` y protege `/admin` redirigiendo a `/admin/login`.

El backoffice incluye shell, tema claro/oscuro, menú de usuario, notificaciones de marcador y páginas preparatorias. La navegación de permisos es una estructura inicial: requiere la futura definición completa de permisos por módulo.

La landing contiene hero, selector conceptual de salón, servicios, paquetes, promociones, ofertas, galería, ubicaciones, testimonios, FAQ y cotización como marcadores. Para iniciar: `pnpm dev:web` y `pnpm dev:api`.
