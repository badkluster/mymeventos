# QA de reporting y operación

## Automatizado

- Build y typecheck de shared, API y web.
- Suite de API y paquete compartido.
- Fechas inclusivas en Buenos Aires y comparación previa.
- Separación de permisos y denegaciones.
- Normalización de productos.
- Whitelist y TTL de Analytics.

## Verificación manual antes de producción

1. Probar cada rol con uno y varios salones.
2. Comparar totales de un período conocido contra contratos, pagos y gastos fuente.
3. Generar dos veces la misma producción y confirmar que no aparecen duplicados.
4. Cerrar, reabrir y revisar auditoría de un ítem.
5. Validar una importación con filas correctas, repetidas y erróneas.
6. Aceptar/rechazar consentimiento y confirmar que nunca se envían valores de formulario.
7. Descargar CSV/Excel y probar impresión.
8. Verificar índices y TTL en la base destino.
