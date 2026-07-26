# Arquitectura del dashboard

El inicio del backoffice es `/admin/dashboard`. La UI consume exclusivamente `GET /api/dashboard/summary`; los cálculos permanecen en `DashboardService` y MongoDB.

El request acepta período y salón. La API transforma días de Buenos Aires a límites UTC, aplica el alcance del usuario y compara con el período inmediatamente anterior. Las métricas financieras no se serializan sin `dashboard.view_financial`.

La respuesta agrupa encabezado, definiciones de KPI, valores, comparación, funnel, desgloses, agenda, alertas y acciones autorizadas. Cada KPI y alerta incluye un enlace operativo. Los estados sin base calculable se representan como información no disponible, no como una cifra inventada.

Ver también [documentación integral](./REPORTING_PRODUCTION_ANALYTICS.md).
