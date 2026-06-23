# Brechas de implementación

| Prioridad | Área | Brecha | Impacto | Arreglo recomendado | ¿Antes de continuar? |
|---|---|---|---|---|---|
| P0 | Quick quote | El selector envía `salonId` vacío y la API lo rechaza | No hay conversión pública real | Obtener salones reales del API y enviar su ObjectId; probar flujo completo | Sí |
| P0 | Leads | No existe UI funcional de lista, alta, detalle ni actividades | CRM no es usable | Implementar `/admin/leads` y `/admin/leads/[id]` contra API | Sí |
| P0 | Tests | No hay pruebas de Leads ni quick quote con base simulada | Regresiones no detectadas | Añadir pruebas de rutas/modelos y scope | Sí |
| P1 | CRM API | Asignación, notificaciones de quick quote y validación uniforme faltan | Flujo incompleto | Completar sólo Leads antes de otros módulos | Sí |
| P1 | Landing | Faltan rutas públicas solicitadas y JSON-LD | Navegación/SEO incompletos | Completar después del flujo quick quote | No |
| P2 | Admin | El resto de módulos son placeholders | No son funcionalidades reales | Mantenerlos explícitamente como no implementados | No |
