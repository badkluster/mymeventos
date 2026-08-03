# Candidatos de código muerto

Fecha: 2026-07-27. Las decisiones se basan en búsqueda global, grafo de imports locales, rutas registradas, imports dinámicos, scripts, CI, configuración y convenciones de Next/Expo. Un candidato no se elimina solo por falta de una coincidencia textual.

## Alta confianza

| Archivo / símbolo | Motivo y evidencia | Riesgo / consumidores revisados | Decisión |
| --- | --- | --- | --- |
| `apps/web/src/features/landing/data/landing-data.ts` | Archivo de datos estático sin import, export consumido, import dinámico, ruta Next ni referencia de configuración. Sus strings estaban duplicados en SEO, no era una fuente de verdad. | Se buscaron nombre, exports, strings, docs, CI y configuración; ningún consumidor. Riesgo bajo. | Eliminado. |
| `apps/web/src/app/admin/contracts/[id]/page.tsx`: estados/acciones de pagos y `GET /contracts/:id/payments` | ESLint identificó los símbolos privados sin uso; no existía tab ni JSX que los renderizara. | Se revisó el archivo completo, tipos y endpoint. El flujo real de pagos permanece en evento/pagos. Riesgo bajo. | Eliminado. |
| Imports/directivas sin uso en 9 archivos web | ESLint y búsqueda de símbolo confirmaron cero lecturas. | Sin export público ni convención de framework. Riesgo bajo. | Eliminados. |

## Confianza media

| Archivo / símbolo | Motivo y evidencia | Riesgo / consumidores revisados | Decisión |
| --- | --- | --- | --- |
| `apps/api/src/modules/operations/{catalog,inventory,consumption-rules}.routes.ts` | No se importan ni se montan desde `src/routes/index.ts`; el grafo los deja fuera. | Endpoints potencialmente esperados en trabajo operativo futuro; docs y carpetas de UI vacías los describen como módulo pendiente. | Conservar; requiere decisión de producto. |
| `apps/api/src/modules/notifications/notification.service.ts#createNotifications` | No tiene import de runtime; la única referencia adicional es un mock de test. | Servicio de email/notificaciones reutilizable y documentación lo propone para futuros triggers. | Conservar como candidato de reactivación. |
| `apps/mobile/src/index.ts` | Barril de tokens sin import de runtime. | Su propio comentario reserva uso de tooling/tests; no es entrypoint Expo. | Conservar. |
| `apps/mobile/src/navigation/{ScheduleNavigator,NotificationsNavigator}.tsx` y sus pantallas | No están registrados en `AppNavigator`; por lo tanto el grafo de imports los deja fuera del runtime actual. | Turnos y Avisos pueden reactivarse si se acuerda ese alcance con el cliente; también cuentan con rutas API existentes. | Conservar como funcionalidad diferida por decisión comercial; no eliminar ni reexponer aún. |
| `apps/api/api/[...path].ts` y `apps/api/vercel.json` | Duplican en apariencia el adaptador raíz, que es el configurado por `vercel.json` raíz. | Posible proyecto Vercel histórico/alternativo. | Conservar hasta verificar configuración remota. |
| Assets estáticos de Next sin referencia textual (`public/*.svg`, `favicon.ico`) | No fueron encontrados por nombre en source. | Navegadores, URLs externas, manifest y convenciones estáticas pueden solicitarlos directamente. | Conservar. |

## Baja confianza

| Archivo / símbolo | Motivo y evidencia | Riesgo / consumidores revisados | Decisión |
| --- | --- | --- | --- |
| 40 advertencias ESLint web, mayormente `react-hooks/exhaustive-deps` | Señalan closures/dependencias potencialmente incompletas, pero añadir dependencias puede modificar ciclos de request/render. | Rutas admin y flujos digitales; no hay prueba de inutilidad. | Conservar y revisar por pantalla. |
| Modelos/campos legacy documentados (`allowedGeoLocations`, estados antiguos) | Algunos no tienen lector activo. | Datos Mongo persistidos, migraciones y compatibilidad móvil. | No eliminar. |

## Críticos: no eliminar

| Elemento | Motivo | Consumidores/riesgo | Decisión |
| --- | --- | --- | --- |
| Modelos Mongoose y scripts operativos | Pueden requerirse por datos persistidos o ejecución manual. No se incluyen seeds, fixtures ni cargadores de datos; cualquier operación directa sobre datos está sujeta a `AGENTS.md`. | MongoDB, operaciones y despliegue. | Conservar solo con autorización explícita. |
| Auth, roles, permisos, tokens, pagos, QR, webhooks, PDFs, correo, uploads | Son contratos públicos o controles de seguridad. | Web, móvil, Mercado Pago, Cloudinary, SMTP/Resend y clientes externos. | Conservar; solo se corrigió autorización de uploads con pruebas. |
| `.github/workflows/*`, `vercel.json`, variables de entorno | Activan cron/despliegue fuera del build local. | GitHub Actions, Vercel y producción. | Conservar. |
