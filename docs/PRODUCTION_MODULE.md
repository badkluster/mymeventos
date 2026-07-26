# Módulo de producción

Los modelos `ProductionPlan`, `ProductionSection`, `ProductionItem` y `ProductionRule` reemplazan progresivamente las planillas manuales.

La generación es idempotente por evento y plan vigente. Guarda snapshots del contexto comercial, aplica reglas por invitados/salón/tipo, normaliza producto y unidad y evita duplicados. Las correcciones manuales y las transiciones de estado guardan usuario, fecha, estado previo, estado nuevo y motivo.

Rutas web: `/admin/production`, `/admin/production/[id]`, `/admin/production/consolidated` y `/admin/production/rules`.

Un plan cerrado no admite cambios y sólo `production.reopen` permite reabrirlo.
