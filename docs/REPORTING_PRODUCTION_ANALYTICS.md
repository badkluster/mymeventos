# Dashboard, reportes, producción, gastos y Analytics

## Alcance y arquitectura

La solución mantiene a MongoDB como fuente de verdad y calcula los indicadores en la API. El frontend solamente aplica filtros, presenta resultados y enlaza cada indicador con el módulo que permite investigarlo.

- Dashboard: `GET /api/dashboard/summary`.
- Reportes: catálogo en `GET /api/reports`, datos en `GET /api/reports/:key` y exportación en `GET /api/reports/:key/export`.
- Producción: `/api/production`.
- Gastos y rentabilidad: `/api/expenses`.
- Analytics propio: recolección pública en `/api/public/analytics` y consultas administrativas en `/api/analytics`.
- Importaciones controladas: `/api/imports`.

Todos los períodos usan `America/Argentina/Buenos_Aires`. `from` y `to` son fechas `YYYY-MM-DD`, ambos días son inclusivos para el usuario y la API transforma el final a un límite exclusivo. El período máximo sin proceso diferido es de 370 días. La comparación del dashboard usa el período inmediatamente anterior de igual duración.

## Definiciones de negocio

| Indicador | Fuente y fórmula |
| --- | --- |
| Leads | Leads creados dentro del período. |
| Conversión comercial | Leads convertidos / leads creados; el funnel expone cada etapa y evita presentar una suma monetaria como conversión. |
| Cotizado | Revisión vigente de presupuestos no eliminados. |
| Contratado | Total de contratos vigentes, excluyendo cancelados y reemplazados. |
| Cobrado | Pagos que afectan saldo con estado pagado, menos devoluciones. |
| Saldo pendiente | Contratado menos cobrado, nunca menor que cero. |
| Gastos estimados | Suma de `initialEstimatedAmount` de gastos no cancelados. |
| Gastos reales | `finalAmount + additionalAmount + taxAmount`, persistido como `amount`. |
| Margen estimado | Contratado menos gasto estimado. |
| Margen real | Cobrado menos gasto real. |
| Rentabilidad completa | Existe al menos un gasto asociado al evento; cuando no existe se muestra explícitamente como incompleta. |
| Producción pendiente | Planes vigentes y sus ítems estructurados, no textos o snapshots de UI. |
| Sesión Analytics | Identificador anónimo de primera parte con actividad agregada; no se guarda la IP completa. |
| Conversión web | `form_success` y su atribución anónima, enlazada con la consulta comercial cuando está disponible. |

Las métricas financieras sólo son devueltas a usuarios con `dashboard.view_financial`. El alcance por salón se aplica en la API, nunca únicamente en la interfaz.

## Permisos

Los permisos están declarados en `packages/shared/src/constants/permissions.ts`.

- `ADMIN`: acceso total.
- `MANAGER`: dashboard, reportes, exportaciones, producción, gastos, rentabilidad, Analytics e importaciones según el preset.
- `SALON_MANAGER`: operación y producción limitada a sus salones; no recibe visibilidad financiera global.
- `STAFF`: sin acceso a estos módulos salvo una excepción explícita.

Las capacidades sensibles están separadas: ver/exportar reportes, ver finanzas, ver todos los salones, completar/reabrir producción, administrar reglas, borrar gastos, administrar Analytics y ejecutar importaciones.

## Producción

`ProductionPlan`, `ProductionSection`, `ProductionItem` y `ProductionRule` constituyen el modelo operativo. Al generar:

1. Se valida el evento y el alcance de salón.
2. Se reutiliza el plan vigente si ya existe; generar dos veces no duplica filas.
3. Se toma un snapshot auditable de evento, contrato, menú, servicios y reglas.
4. Se calculan cantidades por invitados, merma y modalidad de redondeo.
5. Los productos se normalizan por acentos, mayúsculas y espacios; la clave producto/unidad evita duplicados.
6. Cada cambio de estado conserva usuario, fecha y motivo.

Un plan cerrado no admite edición. Sólo usuarios autorizados pueden completar, retroceder estados o reabrirlo. La vista consolidada agrupa producto y unidad y compara la necesidad con inventario para señalar faltantes.

## Gastos y rentabilidad

Las categorías son configurables y se inicializan de forma idempotente con categorías operativas comunes. Un gasto puede vincularse a salón, evento, proveedor, plan de producción y comprobante. Los cambios y eliminaciones lógicas quedan auditados.

La rentabilidad muestra por separado:

- ingreso contratado y cobrado;
- costo inicial estimado y costo final real;
- adicionales e impuestos;
- margen estimado y real;
- desviación, costo por invitado e ingreso por invitado.

No se inventa costo para eventos sin gastos: se informa que el dato está incompleto.

## Analytics de primera parte

El tracker global sólo se ejecuta en rutas públicas y excluye backoffice, invitaciones y tickets. Captura una whitelist cerrada de eventos, secciones estables, CTA, scroll, interacción y resultado de formularios. Nunca captura valores escritos en campos.

Controles implementados:

- consentimiento configurable;
- identificadores anónimos propios;
- lotes y `sendBeacon` al abandonar la página;
- deduplicación por `eventId`;
- límites de lote y rate limit público;
- descarte básico de bots;
- hash corto y salado de solicitud, sin almacenar IP completa;
- TTL configurable para eventos y sesiones;
- agregados diarios y por sección;
- eliminación por visitante anónimo.

Los mapas de interacción usan coordenadas normalizadas y versión de página. No dependen de una captura histórica que pueda quedar desalineada con el diseño actual.

## Importaciones Excel

Tipos soportados: contratos, producción y gastos. El flujo obligatorio es:

1. descargar la plantilla;
2. subir `.xlsx` de hasta 5 MB y 5.000 filas;
3. mapear columnas;
4. validar y revisar la vista previa;
5. ejecutar con permiso separado.

Cada trabajo conserva hash del archivo, mapeo, totales, estado y errores por fila. Contratos usan `importJobId + importRowIndex` para no duplicarse al reintentar. Las demás cargas usan referencias estables del trabajo y la fila, además de las restricciones únicas del dominio.

Para migraciones históricas se recomienda crear trabajos separados por archivo y período, validar primero en un entorno de preproducción y conservar el archivo fuente fuera de la base. No se debe insertar directamente en colecciones porque se perderían validación, permisos y auditoría.

## Operación, índices y despliegue

Los modelos agregan índices para rango/estado/salón, claves idempotentes, consultas de Analytics y TTL. Mongoose crea índices según la configuración del entorno; en producción se recomienda desplegarlos previamente con el procedimiento habitual de base de datos y verificar:

- claves únicas de planes vigentes, filas importadas y eventos Analytics;
- índices TTL sobre `expiresAt`;
- índices compuestos de períodos y salón;
- ausencia de duplicados previos antes de activar una restricción única.

Variables necesarias para la aplicación existente (base de datos, tokens y correo) no cambian. Analytics permite configurar una sal adicional para el hash de solicitud desde el entorno. La exportación sincrónica está limitada a 10.000 filas para evitar bloquear la API.

## Validación

Las pruebas específicas verifican:

- límites de período y zona horaria;
- permisos de módulos y denegaciones explícitas;
- normalización de nombres de producción;
- whitelist y TTL de Analytics.

Antes de publicar se deben ejecutar:

```bash
pnpm --filter @mym/shared run build
pnpm --filter @mym/shared run test
pnpm --filter @mym/api run typecheck
pnpm --filter @mym/api run test
pnpm --filter @mym/web run typecheck
pnpm --filter @mym/web run build
```
