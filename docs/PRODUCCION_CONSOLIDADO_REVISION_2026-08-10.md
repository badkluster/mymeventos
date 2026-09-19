# M&M Eventos - Revisión del reporte de Producción Consolidada

Fecha: 10 de agosto de 2026  
Archivos revisados: `reporte.xls` y `reporte.pdf`  
Comparación: salida actual del módulo Producción vs. operatoria histórica documentada de M&M Eventos.

## Conclusión ejecutiva

La información base ya está bastante cerca de lo que M&M necesita, pero la **salida exportada todavía no reemplaza de forma natural las planillas históricas**.

Evaluación cualitativa:

- Cobertura funcional/datos en pantalla: **85-90%**.
- Excel exportado respecto del uso histórico: **65-70%**.
- PDF exportado como documento operativo: **55-65%**.
- Preparación global para sustituir las planillas habituales sin cambiar la forma de trabajo: **70-75%**.

La mayor diferencia no está en que falten datos: está en **cómo se presentan, cómo se interpretan las columnas de necesidad y qué información se pierde al exportar**.

## 1. Observación inmediata: el reporte no es sólo julio

Los dos archivos indican el rango:

`2026-07-01 al 2026-08-31`

Por lo tanto, aunque se haya solicitado como reporte de julio, la exportación incluye julio y agosto. El encabezado es correcto respecto del filtro recibido, pero antes de usarlo como reporte mensual debe revisarse el selector `Hasta`.

Recomendación:

- Presets `Este mes`, `Mes anterior` y `Próximos 30 días`.
- Mostrar el período aplicado también en el nombre del archivo.
- Para exportación mensual, sugerir automáticamente el último día del mes seleccionado.

## 2. Lo que hoy está bien

### Agrupación por rubro

El PDF y el Excel separan:

- Producción salada
- Producción dulce
- Bebidas
- Tortas
- Panadería
- Cocina
- Barra
- Otros

Esto es mucho más útil que un único listado mezclado.

### Excel

El archivo tiene una hoja `Total consolidado` y una hoja por sección. Es una buena base para compras y planificación central.

### Estado de ejecución

El reporte diferencia:

- Planificado
- Completado
- Disponible
- Faltante
- A comprar
- A producir
- Pendientes

La intención es correcta: el usuario puede analizar necesidad, cobertura y avance desde el mismo lugar.

### Pantalla web

La pantalla actual es incluso mejor que los archivos exportados porque muestra **una columna por evento** dentro de cada sección antes de los totales. Esa matriz es muy parecida al tipo de lectura histórica de M&M.

## 3. Diferencia con la producción histórica de M&M

La operatoria histórica documentada para `Producción mayo.xlsx` utiliza:

- una pestaña por evento del mes;
- encabezado con salón, fecha, invitados y cliente;
- tabla `producto | cantidad | listo | chequeo | observación`.

La salida actual cubre muy bien el **consolidado general**, pero no reemplaza todavía esa **hoja operativa por evento**.

No conviene elegir uno u otro. El sistema debería ofrecer ambos:

1. **Consolidado de producción** para compras, cocina central y planificación mensual/semanal.
2. **Orden de producción por evento** para ejecutar y chequear cada evento.

## 4. Problema semántico principal: Faltante / A comprar / A producir

Actualmente el backend calcula aproximadamente:

- `Faltante = max(Planificado - Stock disponible, 0)`
- `A comprar = max(Planificado - Stock disponible, 0)`
- `A producir = max(Planificado - Completado, 0)`

Esto genera resultados visualmente contradictorios cuando un producto ya está completado.

Ejemplos reales del reporte:

- Agua mineral: Plan 4.108 / Hecho 4.108 / Disponible 0 / Faltante 4.108 / Comprar 4.108 / Producir 0.
- Cerveza botella: Plan 1.930 / Hecho 1.930 / Faltante 1.930 / Comprar 1.930.
- Gaseosa: Plan 1.866 / Hecho 1.866 / Faltante 1.866 / Comprar 1.866.
- Hielo: Plan 728 / Hecho 728 / Faltante 728 / Comprar 728.

Para un operador, esto se lee como “ya está hecho pero todavía tengo que volver a comprar todo”.

### Cambio recomendado

Separar conceptos:

- **Necesidad planificada**: cantidad total requerida.
- **Completado / cubierto**: cantidad ya resuelta.
- **Pendiente de ejecución**: lo que todavía falta resolver.
- **Stock libre**: disponibilidad real que puede aplicarse al pendiente.
- **Faltante neto**: necesidad pendiente que no cubre stock.
- **Origen de cobertura**: Stock / Comprar / Producir / Externo / Mixto.

`A comprar` no debería ser automáticamente igual a `Faltante`. Debe depender del modo de abastecimiento del producto o de la regla de producción.

Sugerencia de dominio:

`fulfillmentMode = stock | purchase | produce | external | mixed`

Así, por ejemplo:

- agua, gaseosa, cerveza -> normalmente `purchase`;
- empanadas elaboradas -> `produce`;
- vajilla/insumo existente -> `stock`;
- servicio tercerizado -> `external`;
- casos combinados -> `mixed`.

## 5. “Pendientes” necesita otro nombre

La columna actual cuenta **ítems** cuyo estado es pending / in_progress / blocked. No representa cantidad pendiente.

Renombrar:

`Pendientes` -> **Ítems pendientes**

Y agregar, si se desea:

**Cantidad pendiente = max(Planificado - Completado, 0)**

Esto evita interpretar `0` como “no falta ninguna unidad”.

## 6. Identidad de productos y duplicados

El reporte muestra posibles fragmentaciones del catálogo:

- `Hielo (kg)` aparece en dos filas distintas dentro de Otros.
- `Cerveza` aparece como unidad y como botella.
- `Gaseosa` y `Gaseosas (Coca-Cola / Sprite)` aparecen separadas.
- `Empanadas de carne` y `Empanadas` aparecen separadas.

Algunas diferencias son válidas (por ejemplo, unidades o productos realmente distintos), pero `Hielo kg` duplicado merece auditoría.

Recomendación:

- cada producto operativo debe tener una identidad canónica;
- normalizar unidad de medida;
- detectar catálogo duplicado por nombre normalizado + unidad;
- impedir que un mismo concepto se cargue una vez como catálogo y otra como ítem legacy/manual sin advertencia;
- permitir variantes cuando realmente sean productos diferentes.

## 7. El mayor gap de exportación: se pierden las columnas por evento

La pantalla web actual sí muestra:

`Producto | Evento A | Evento B | Evento C | ... | Total | Completado | Disponible | ...`

Pero el PDF y el XLS exportados entregados muestran sólo:

`Producto | Unidad | Eventos | Plan | Hecho | Disp. | Falta | Comprar | Producir | Pend.`

Es decir: el dato existe, pero la exportación lo resume demasiado.

### Excel recomendado

El Excel debería tener como mínimo:

#### Hoja 1 - Resumen

- período;
- salón/es;
- cantidad de eventos;
- invitados totales;
- productos distintos;
- ítems pendientes/bloqueados;
- fecha y hora de generación.

#### Hoja 2 - Consolidado por evento

Matriz:

`Producto | Unidad | 03/07 - Evento A | 03/07 - Evento B | ... | Total | Completado | Pendiente | Stock | Faltante neto | Comprar | Producir`

#### Hojas por rubro

Mantener Salado, Dulce, Bebidas, etc., pero conservar las columnas por evento.

#### Hoja Compras

Sólo productos cuyo abastecimiento requiera compra:

`Producto | Unidad | Necesidad | Stock aplicable | Ya cubierto | A comprar | Proveedor sugerido | Observación`

#### Hoja Producción

Sólo lo que deba elaborarse:

`Producto | Unidad | Total a producir | Hecho | Pendiente | Responsable | Fecha límite`

#### Orden por evento

Opción adicional compatible con la forma histórica:

una pestaña por evento con:

- salón;
- fecha/hora;
- cliente;
- invitados;
- producto;
- cantidad;
- listo;
- chequeo;
- observación;
- responsable.

## 8. PDF: hoy es legible, pero desperdicia páginas

El PDF usa 8 páginas, una por sección. Algunas páginas contienen una sola fila:

- Tortas;
- Panadería;
- Barra.

Para impresión operativa es demasiado espacio en blanco.

Recomendación:

- agrupar secciones pequeñas dinámicamente en una misma página;
- iniciar una nueva página sólo cuando la tabla no entra;
- repetir encabezado si una sección continúa;
- incluir pie con `Generado el ...` y período/salón;
- agregar resumen inicial de una página;
- permitir versión `Compacta` y versión `Detallada`.

El PDF consolidado debería quedar normalmente en **3-4 páginas** para un período como éste, no 8.

## 9. Totales y unidades

No debe mostrarse un “gran total de cantidades” mezclando litros, botellas, unidades, porciones y kilos.

Los totales deben calcularse:

- por producto;
- por unidad compatible;
- por sección cuando las unidades sean homogéneas;
- o como cantidad de ítems/productos, no como suma física.

## 10. Datos que conviene agregar a la salida

Para acercarse al uso real diario:

- salón;
- fecha y hora del evento;
- cliente / homenajeado;
- cantidad de invitados;
- responsable de producción;
- proveedor habitual/sugerido;
- estado/bloqueo;
- observaciones;
- hora/fecha límite;
- marca de “urgente”;
- timestamp del stock utilizado para el cálculo.

El timestamp de stock es importante: el valor Disponible es una foto del inventario y puede cambiar entre planificación y ejecución.

## 11. Prioridades de implementación

### P0 - Corrección de significado

1. Renombrar `Faltante` a `Faltante contra stock` mientras conserve la fórmula actual.
2. Renombrar `Pendientes` a `Ítems pendientes`.
3. Revisar la fórmula de `A comprar` para que no recomiende volver a comprar cantidades ya cubiertas.
4. Incorporar estrategia de abastecimiento `stock/purchase/produce/external/mixed`.
5. Auditar productos duplicados/canónicos, especialmente `Hielo kg`.

### P1 - Igualar/mejorar la planilla histórica

6. Mantener columnas por evento en Excel.
7. Agregar exportación “Orden por evento” con formato similar a la planilla histórica.
8. Agregar hoja Resumen, Compras y Producción.
9. Mejorar encabezados con salón, fechas, eventos e invitados.

### P2 - Calidad de impresión y operación

10. PDF compacto con varias secciones por página.
11. Responsable, observaciones, fecha límite y proveedor.
12. Presets mensuales y nombre de archivo con período.
13. Indicadores de bloqueos y avance.

## Resultado esperado

Con P0 + P1, el módulo puede superar claramente a las planillas históricas: conservaría la lectura a la que está acostumbrado M&M, pero agregaría stock, reglas, trazabilidad, filtros y consolidación automática.

El objetivo no debería ser copiar exactamente Excel, sino conservar sus dos virtudes principales:

- saber **qué necesita cada evento**;
- saber **cuánto hay que preparar/comprar en total**.

Hoy el sistema ya tiene gran parte de esos datos; el siguiente trabajo es hacer que la exportación los exprese sin ambigüedades.
