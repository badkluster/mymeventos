# Corrección de cotización pública

`GET /api/public/salons` publica únicamente `_id`, `name`, `address` y `active` de salones activos no eliminados. No requiere autenticación y no expone configuración interna ni auditoría.

La landing carga esa lista y usa el `_id` seleccionado al enviar `POST /api/public/quick-quote`. Sin selección muestra “Seleccioná un salón para continuar.”

Prueba manual: iniciar API y web, verificar opciones en el selector, enviar el formulario y confirmar respuesta 201 y un Lead nuevo en MongoDB.
