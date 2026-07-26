# Módulo de reportes

El catálogo disponible para cada usuario se obtiene en `GET /api/reports`. `GET /api/reports/:key` ejecuta consultas paginadas y agregaciones en backend; `GET /api/reports/:key/export` genera CSV o una planilla compatible con Excel, hasta 10.000 filas.

Filtros, orden y paginación llegan por query string para que una vista pueda compartirse. Las vistas guardadas se conservan localmente en el navegador; no constituyen datos de negocio. Toda exportación requiere permiso y deja auditoría.

Reportes implementados: leads, presupuestos, eventos, contratos, pagos/cobranzas y gastos. La vista de rentabilidad está en `/admin/expenses/profitability`.
