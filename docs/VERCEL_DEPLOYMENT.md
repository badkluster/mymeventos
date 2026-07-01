# Deploy en Vercel

Este repo se despliega como un solo proyecto de Vercel desde la raiz del monorepo.

## Estructura de deploy

- `apps/web`: frontend Next.js.
- `apps/api`: API Express publicada como Vercel Function.
- `api`: funciones raiz de Vercel que montan la API Express.
- `vercel.json`: configura el build de `apps/web`, la funcion `api/**/*.ts` y el rewrite `/health`.

## Configuracion del proyecto

1. Importar el repositorio en Vercel usando la raiz del repo como Root Directory.
2. Dejar que Vercel use `vercel.json`.
3. Usar pnpm. El repo declara `packageManager: pnpm@10.24.0`.
4. Configurar las variables de entorno del archivo `.env.example` en Vercel.

## Variables importantes

Para Production y Preview:

- `NEXT_PUBLIC_API_URL=/api`
- `MONGODB_URI`: usar MongoDB Atlas o una base accesible desde Vercel.
- `CORS_ORIGIN`: dominio publico del deploy, por ejemplo `https://tudominio.com`. En previews puede omitirse; la API usa `VERCEL_URL` como fallback.
- `ACCESS_TOKEN_SECRET`: secreto de 32+ caracteres.
- `REFRESH_TOKEN_SECRET`: secreto de 32+ caracteres.
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE=lax`
- `EMAIL_NOTIFICATIONS_ENABLED=true` solo si SMTP esta configurado.
- `CLOUDINARY_*` si se usan subidas de imagenes y PDFs.

No configurar `COOKIE_DOMAIN` salvo que se use un dominio propio y se necesite compartir cookies entre subdominios.

## Notas operativas

- La web llama a la API por `/api`, por lo que frontend y backend comparten origen y las cookies httpOnly funcionan sin CORS cruzado.
- El logo de los emails se adjunta inline; `vercel.json` incluye el asset necesario en las funciones `api/**/*.ts`.
- La API mantiene una conexion MongoDB reutilizable por instancia serverless para evitar reconexiones innecesarias.

## Verificacion local

```bash
pnpm install --frozen-lockfile
pnpm --filter api typecheck
pnpm --filter web typecheck
pnpm --filter @mym/api build
pnpm --filter @mym/web build
```

Para probar el deploy local con Vercel CLI:

```bash
vercel dev
```
