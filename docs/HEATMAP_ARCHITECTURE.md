# Arquitectura del informe de interacciones

La landing usa `IntersectionObserver` para registrar vistas y permanencia por sección sin enviar eventos por cada movimiento. Los clics guardan versión de página, sección, elemento y dispositivo. Las coordenadas normalizadas se recolectan solo como dato técnico y no se presentan como una captura o una réplica del sitio.

La ruta administrativa `/admin/analytics/heatmap` conserva su URL por compatibilidad, pero se muestra como **Interacciones**. Filtra por período, página, versión y dispositivo, y resume los clics por sección y por botón o enlace. No toma capturas ni graba sesiones.

Los agregados por sección contienen vistas, interacciones, clics, tiempo de interacción y conversiones posteriores.
