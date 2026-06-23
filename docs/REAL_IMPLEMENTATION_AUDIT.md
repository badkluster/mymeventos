# Auditoría de implementación real

## Resumen ejecutivo

El monorepo compila y sus pruebas actuales pasan, pero no está listo para continuar con módulos nuevos. La base de autenticación y administración de usuarios/salones existe; CRM y landing no cumplen todavía un flujo funcional de punta a punta.

## Validación ejecutada

| Comando | Resultado |
|---|---|
| `pnpm install` | Correcto; lockfile al día. Advertencia: scripts de `bcrypt` ignorados por pnpm. |
| `pnpm lint` | Correcto. |
| `pnpm typecheck` | Correcto. |
| `pnpm build` | Correcto: web genera `/`, `/admin`, `/admin/login`, `/admin/[module]`, `robots.txt` y `sitemap.xml`. |
| `pnpm test` | Correcto: 15 pruebas (8 API y 7 shared). |

## Estado actual

### API foundation

| Elemento | Estado | Evidencia |
|---|---|---|
| Express, health, CORS, Helmet y cookies | DONE | `app.ts` |
| Configuración Zod y MongoDB desacoplado | DONE | `config/env.ts`, `db/connection.ts` |
| Error handler y validación | DONE | Mensajes principales en español; detalles de Zod genéricos. |
| Auth, refresh, logout y cookies httpOnly | DONE | `modules/auth` |
| RBAC y alcance de salón | PARTIAL | Existe middleware; el permiso `SALONS_READ` se usa como acceso global y necesita definición explícita de permisos globales. |
| Swagger | PARTIAL | Sólo documentación básica en desarrollo. |
| Seed / reset de contraseña | DONE | Scripts presentes; seed exige variables. |
| Auditoría | DONE | Modelo y servicio usados en auth/usuarios/salones/leads. |
| Notificaciones | PARTIAL | Modelo y lectura existen; no hay servicio ni creación desde quick quote. |

### Endpoints registrados

| Módulo | Endpoints | Estado |
|---|---|---|
| Health | `GET /health` | Implementado |
| Auth | `POST /api/auth/login`, `/logout`, `/logout-all`, `/refresh`; `GET /me` | Implementado |
| Users | CRUD, activar/desactivar | Implementado |
| Salons | CRUD | Implementado |
| Settings | GET/PATCH | Implementado |
| Notifications | GET, marcar una/todas | Implementado sin producción automática |
| Leads | listado, detalle, crear, editar, borrar, estado, actividades, perdido | Parcial: no asignación; validación inconsistente en PATCH; sin pruebas |
| Public | `POST /api/public/quick-quote` | Parcial: crea lead/actividad, sin notificación ni asignación; requiere ObjectId de salón |
| Customers, quotes, events | No registrados | Missing |

### Modelos Mongoose

`User`, `RefreshToken`, `Salon`, `SystemSetting`, `Notification`, `AuditLog` están usados por rutas. `Lead` y `LeadActivity` están usados por las rutas parciales. `Customer`, `ContactPerson`, `Quote`, `QuoteRevision` y `Event` están definidos en `crm.models.ts`, pero no tienen endpoints reales. Todos usan timestamps salvo las estructuras de auditoría/actividad que usan sólo `createdAt`; soft delete se aplica en User, Salon, Notification, Lead, Customer, Quote y Event. Índices explícitos son parciales.

### Shared

Incluye roles, permisos, estados de dominio, esquemas Zod comunes y helpers de permisos. Tiene 7 pruebas de helpers. Es suficiente para extender la base, pero los permisos de Leads no están cubiertos por pruebas de endpoint y falta una semántica clara de permiso global por salón.

### Web foundation

| Elemento | Estado |
|---|---|
| Cliente API con cookies | DONE |
| Cliente auth y proveedor de sesión | DONE |
| Login y protección `/admin` | DONE |
| Shell, tema, logout | DONE |
| Notificaciones | PARTIAL: sólo icono/placeholder |
| Dashboard | PARTIAL: métricas estáticas `—` |
| Módulos admin | PLACEHOLDER: `/admin/[module]` muestra “Módulo en preparación”. |

### Landing y cotización

`/` existe y contiene datos estructurados para salones, paquetes, servicios y FAQ. Usa gradientes como imágenes preparadas para reemplazo. No existen `/salones`, `/salones/[slug]`, `/promociones` ni `/contacto`. La cotización hace POST real, pero todas las opciones de salón envían `salonId` vacío; la API exige ObjectId, por lo que el flujo falla con validación. No hay JSON-LD de LocalBusiness/EventVenue. La metadata raíz y robots/sitemap básicos sí existen.

### Admin routes

Sólo `/admin`, `/admin/login` y el manejador genérico `/admin/[module]` existen. Todas las rutas de módulos solicitadas resuelven en este último y son placeholders; no muestran datos ni tienen CRUD/detalle.

### Leads

| Requisito | Estado |
|---|---|
| Modelo y actividades | DONE |
| API básica | PARTIAL |
| Scope de salón | PARTIAL |
| UI lista/crear/detalle/editar | MISSING |
| Estado, notas, perdido desde UI | MISSING |
| Quick quote útil end-to-end | BROKEN |
| Tests de Leads | MISSING |

### Pruebas

API: salud, mensajes españoles de auth/404/validación y utilidades de contraseña/token/scope. Shared: helpers de permiso. Faltan pruebas de Mongo/repositorio, auth exitoso, RBAC real, leads, quick quote, notificaciones y UI.

## Riesgo y siguiente paso inmediato

No es seguro continuar con nuevos módulos. El siguiente paso debe ser corregir y probar el flujo mínimo de Leads + quick quote, antes de eventos, pagos o inventario.
