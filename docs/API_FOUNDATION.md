# Base de API

La API se ejecuta desde `apps/api` y exporta la aplicación Express desde `src/app.ts`. La conexión a MongoDB y el servidor HTTP se inician exclusivamente desde `src/index.ts`, por lo que las pruebas pueden importar la aplicación sin conectarse a una base de datos. Las rutas funcionales usan el prefijo `/api`; por ejemplo, `/api/auth/login`.

Los códigos de error se mantienen en inglés como identificadores técnicos estables. Todos los mensajes visibles para usuarios y administradores se devuelven en español.

## Autenticación y cookies

`POST /api/auth/login` recibe usuario y contraseña. Si son válidos, emite un access token de corta duración y un refresh token de larga duración en cookies `httpOnly`. El refresh token se almacena solamente como hash en MongoDB. `POST /api/auth/refresh` lo rota y revoca el anterior. `POST /api/auth/logout` revoca la sesión actual, `POST /api/auth/logout-all` revoca todas las sesiones, y `GET /api/auth/me` devuelve el usuario actual.

Las cookies usan `httpOnly`, `secure`, `sameSite`, `path` y duración según entorno. En producción se debe configurar `COOKIE_SECURE=true`; si se usa `COOKIE_SAME_SITE=none`, HTTPS es obligatorio.

## RBAC y alcance de salón

Las rutas protegidas requieren autenticación y permisos de `@mym/shared`. Un usuario puede tener varios roles, sobrescrituras explícitas de permisos y uno o más salones. `ADMIN` tiene alcance global; los demás usuarios quedan restringidos a sus salones asignados salvo que cuenten con el permiso global de lectura de salones. Los accesos denegados responden `403`.

## Variables de entorno

Copiar `apps/api/.env.example` a `apps/api/.env` y definir al menos `MONGODB_URI`, `CORS_ORIGIN`, `ACCESS_TOKEN_SECRET` y `REFRESH_TOKEN_SECRET`. Los secretos deben tener 32 caracteres o más. También se documentan configuración SMTP, Cloudinary, cookies y credenciales de seed.

## Ejecución y seed

Ejecutar `pnpm --filter @mym/api dev` para desarrollo y `pnpm --filter @mym/api seed` para crear el administrador, los salones San Carlos, Villa Elisa y La Plata, y la configuración inicial. El seed exige `SEED_ADMIN_USERNAME`, `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`; no incorpora credenciales de producción.

Para restablecer localmente la contraseña de un administrador, definir `RESET_ADMIN_USERNAME` y `RESET_ADMIN_PASSWORD` (mínimo 12 caracteres) y ejecutar `pnpm --filter @mym/api reset:admin-password`. El script se bloquea si `NODE_ENV=production` y no expone un endpoint HTTP.

## Endpoints

- `GET /health`
- Autenticación: `/api/auth/login`, `/logout`, `/logout-all`, `/refresh`, `/me`
- Usuarios: `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id`, `PATCH /:id/activate`, `/:id/deactivate`
- Salones: `GET/POST /api/salons`, `GET/PATCH/DELETE /api/salons/:id`
- Configuración: `GET/PATCH /api/settings`
- Notificaciones: `GET /api/notifications`, `PATCH /:id/read`, `/read-all`

En desarrollo, OpenAPI se publica en `/docs`.

## Limitaciones conocidas

No hay módulos de negocio en este alcance. Las pruebas de rutas que requieren MongoDB deben usar una instancia local o una capa de repositorio simulada; las pruebas actuales cubren salud y utilidades sin una base remota.
