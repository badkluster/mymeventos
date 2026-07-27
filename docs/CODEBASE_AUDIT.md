# Auditoría técnica de M&M Eventos

Fecha: 2026-07-27. Alcance: monorepo completo (`apps/api`, `apps/web`, `apps/mobile`, `packages/shared`, adaptador Vercel, CI y configuración de despliegue). Se aplicó un criterio conservador: solo se eliminó código que quedó desconectado mediante búsqueda global, grafo de imports y verificación de convenciones.

## Resumen ejecutivo

La línea base compilaba y sus pruebas pasaban, aunque web emitía 59 advertencias de ESLint. La auditoría encontró una vulnerabilidad de autorización en borrado/subida de assets y un deep link de recuperación generado por API sin consumidor móvil; ambos se corrigieron y quedaron cubiertos por cuatro pruebas nuevas. Turnos y Avisos móviles permanecen implementados pero deliberadamente fuera de la navegación por decisión comercial, hasta que se acuerde ese alcance. Se eliminó un módulo de datos de landing sin consumidores y código/invocaciones no representados en la pantalla de contratos.

La actualización de seguridad puntual `next`/`eslint-config-next` de `16.2.9` a `16.2.11` redujo el resultado de `pnpm audit --prod` de 35 a 24 advisories. Quedan 13 advisories altos, mayormente transitivos o que requieren un salto mayor de dependencia; no se forzaron overrides ni actualizaciones mayores durante esta limpieza.

## Arquitectura y dependencias observadas

```text
Visitante ──> Next.js web pública ──┐
Backoffice ─> Next.js /admin (cookie)├─> /api proxy / Vercel handler ─> Express ─> Mongoose/MongoDB
Staff ─────> Expo móvil (Bearer) ───┘                                  │
                                                                  Cloudinary (assets/PDF)
                                                                  Mercado Pago (entradas/webhooks)
                                                                  SMTP/Resend (correo/campañas)

GitHub Actions cada 10 min ──> /api/marketing/process (secreto)
Vercel Cron diario ──────────> mismo endpoint (respaldo)
```

- Workspaces pnpm: `@mym/api`, `@mym/web`, `@mym/mobile`, `@mym/shared`.
- API: Express, Zod, Mongoose, rutas de dominio y middlewares RBAC/alcance de salón.
- Web: Next.js App Router; el proxy de Pages Router y el handler Vercel mantienen el acceso a la API en despliegue.
- Móvil: Expo/React Navigation, sesión Bearer, fichaje offline y geolocalización.
- Dependencias externas sensibles: MongoDB, Cloudinary, Mercado Pago, SMTP/Resend, GitHub Actions y Vercel Cron.

El grafo estático de imports no encontró ciclos. Todos los archivos fuente de web quedaron alcanzables tras los cambios; los únicos módulos API fuera del grafo son scripts ejecutables, declaraciones de tipos, el servicio de notificaciones sin trigger y las tres rutas de Operaciones no montadas, documentadas como candidatos y no eliminadas. En móvil, los navegadores y pantallas de Turnos/Avisos se conservan sin referencias de runtime como funcionalidad diferida explícita.

## Línea base y validación

| Comando | Línea base | Resultado final |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | OK | OK |
| `pnpm lint` | OK, 59 warnings web | OK, 40 warnings web; 0 errores |
| `pnpm typecheck` | OK | OK en shared, API, web y móvil |
| `pnpm test` | 274 pruebas OK | 278 pruebas OK: API 246, móvil 15, shared 17 |
| `pnpm build` | API/web OK | API y web OK con Next 16.2.11 |
| `pnpm dlx expo-doctor` desde raíz | no aplicable (no detecta Expo) | se ejecutó correctamente dentro de `apps/mobile`: 20/20 checks OK |

El intento inicial de `pnpm --filter @mym/mobile exec expo-doctor` no era un script provisto por el paquete y falló por comando inexistente; no se atribuye a los cambios. También se intentaron `pnpm lint` y `pnpm build` desde `apps/mobile`: ese workspace no define esos scripts, como confirma su `package.json`. La validación correcta se ejecutó con `pnpm dlx expo-doctor` en `apps/mobile`.

Comandos principales ejecutados: `git status --short`, `git branch --show-current`, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm --filter @mym/api test -- uploads-routes.test.ts`, `pnpm --filter @mym/web lint`, `pnpm --filter @mym/web typecheck`, `pnpm --filter @mym/web build`, `pnpm --filter @mym/mobile typecheck`, `pnpm --filter @mym/mobile test`, `pnpm dlx expo-doctor` (en `apps/mobile`) y `pnpm audit --prod`. Los comandos de calidad finales terminaron correctamente; los únicos diagnósticos pendientes son las 40 advertencias de ESLint y 24 advisories de dependencias.

## Cambios aplicados

### Seguridad y estabilidad

- `apps/api/src/modules/uploads/uploads.routes.ts`: los uploads de contexto `users` ahora se guardan obligatoriamente en `mym-eventos/users/<usuario>`; se ignora cualquier carpeta enviada por el cliente. El borrado valida el prefijo del asset y, para galerías, el `salonId` y su alcance.
- `apps/web/src/app/admin/salons/[id]/page.tsx`: envía el `salonId` al borrar una pieza de galería, preservando el flujo legítimo con la nueva validación.
- `apps/mobile/src/lib/deepLink.ts` y `apps/mobile/src/navigation/{RootNavigator,AuthNavigator}.tsx`: el enlace `mymeventos://reset-password?token=...` abre Restablecer contraseña con el token y cierra la sesión local de forma segura.
- `apps/mobile/src/navigation/AppNavigator.tsx`: Turnos y Avisos no se exponen en las pestañas actuales; sus navegadores, pantallas y rutas API se preservan para una futura negociación de alcance.
- `apps/web/package.json`, `package.json`, `pnpm-lock.yaml`: actualización acotada de Next.js y su configuración ESLint a `16.2.11`.

### Limpieza demostrable

- Eliminado `apps/web/src/features/landing/data/landing-data.ts`: no tenía imports, consumidores por nombre, imports dinámicos ni condición de framework; contenía datos hardcodeados duplicados.
- Eliminado de la pantalla de contratos un `GET /contracts/:id/payments`, estados y acciones de pago sin ninguna renderización o llamada posible. La funcionalidad de pagos real permanece en Eventos/Pagos y en la API.
- Eliminados nueve imports, funciones privadas o directivas ESLint sin uso. Se redujeron las advertencias de lint de 59 a 40 sin suprimir reglas; además se corrigieron dos efectos que el ESLint actualizado pasó a marcar como actualización síncrona de estado.

## Dependencias

Todas las dependencias declaradas tienen al menos un consumidor de código, script o configuración. No se eliminó ninguna dependencia.

- Corregido: `next` y `eslint-config-next` 16.2.11 (parche de seguridad, sin cambio de major).
- Pendiente: 24 advisories de producción tras el parche: 13 altos, 9 moderados y 2 bajos. Sobresalen `nodemailer` directo (la corrección completa requiere versión >=7.0.11 o >=9.0.1 según advisory), y cadenas de `swagger-jsdoc`, React Native/Expo y dependencias de Next. Requieren una tarea de actualización y smoke tests de correo, OpenAPI, Expo y build de producción.
- El gestor informó peer dependency no satisfecha en móvil: `react-dom@19.2.4` requiere `react@^19.2.4`, mientras Expo declara `react@19.2.3`. `expo-doctor` no detectó incompatibilidad; no se cambió React fuera de la matriz del SDK.

## Riesgos y pendientes

1. Las rutas de catálogo, inventario y reglas de consumo existen en API pero no están montadas en `src/routes/index.ts`; no se eliminaron porque pueden ser trabajo operativo en curso.
2. El rate limit público es por proceso y no cubre específicamente login/recuperación de contraseña. Antes de escalar Vercel horizontalmente se requiere un almacenamiento compartido/gateway y límites para auth.
3. La subida valida tamaño y extensión/MIME declarados, pero no inspecciona firma de contenido. Evaluar validación por magic bytes o transformación segura antes de habilitar archivos de terceros más allá de los usos actuales.
4. Turnos y Avisos móviles quedan intencionalmente inaccesibles. No deben reexponerse hasta que exista acuerdo comercial y alcance funcional aprobado; sus fuentes se listan como código diferido, no como eliminación segura.
5. Permanecen 40 warnings ESLint: predominan dependencias de hooks y `<img>` sin optimizar. No se añadieron dependencias a ciegas porque pueden provocar recargas en bucle o cambiar ciclos de datos; están enumerados en `BUG_AUDIT.md`.
6. La configuración Vercel duplicada bajo `apps/api` se conserva: la raíz es la usada por el despliegue actual, pero borrar el adaptador alternativo requiere confirmación de su historial de despliegue.

## Recomendaciones posteriores

1. Planificar una actualización de dependencias separada, empezando por Nodemailer y los árboles Swagger/Expo, con pruebas de correo y build móvil.
2. Decidir explícitamente si Operaciones se integra o se retira, luego montar rutas/UI o ejecutar una eliminación en una tarea dedicada.
3. Sustituir el limitador en memoria por uno distribuido y cubrir endpoints de auth.
4. Reducir warnings de hooks mediante revisión por flujo, no autofix masivo.
5. Mantener pruebas E2E de deep links en dispositivo/emulador; añadir pruebas de Turnos/Avisos recién cuando ese alcance se apruebe y se reexponga en navegación.
