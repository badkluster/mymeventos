# Analytics first-party

El tracker público envía lotes a `POST /api/public/analytics/collect`. No se ejecuta en rutas privadas, invitaciones ni entradas y nunca captura valores de inputs.

Usa identificadores anónimos, consentimiento configurable, whitelist estricta, deduplicación, rate limit, filtro básico de bots y TTL. No almacena la IP completa. La administración permite consultar resumen, secciones, mapa normalizado, configuración y eliminar un visitante anónimo.

El `attributionId` y los UTM se adjuntan a la consulta comercial pública para unir la conversión web con el CRM sin cookies de terceros.
