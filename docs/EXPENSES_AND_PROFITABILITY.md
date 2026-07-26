# Gastos y rentabilidad

Los gastos estructurados soportan categoría, proveedor, salón, evento, plan de producción, importes estimado/final/adicional/impuestos, estado y comprobante. Las categorías son configurables y su carga inicial es idempotente.

Fórmulas:

- costo real = final + adicional + impuestos;
- margen estimado = contratado − costo estimado;
- margen real = cobrado − costo real;
- porcentaje real = margen real / cobrado × 100;
- costo por invitado = costo real / invitados.

Si no existen gastos vinculados se indica “Rentabilidad incompleta por falta de gastos asociados”.
