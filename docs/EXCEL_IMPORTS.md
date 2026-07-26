# Importaciones Excel

El asistente en `/admin/imports` soporta contratos, producción y gastos mediante plantilla, subida, mapeo, validación, vista previa y ejecución confirmada.

Límites: `.xlsx`, 5 MB y 5.000 filas. Cada trabajo conserva hash, nombre de archivo, mapeo, estado, totales y errores por fila. La ejecución es idempotente y deja auditoría.

Los procesos no crean automáticamente clientes o eventos faltantes: esas relaciones deben existir y cualquier inconsistencia se informa antes de ejecutar. Para planillas históricas irregulares se debe preparar un trabajo específico, revisar el informe en preproducción y conservar la referencia de archivo/fila.
