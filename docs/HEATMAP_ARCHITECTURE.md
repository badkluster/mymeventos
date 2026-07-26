# Arquitectura de mapas de interacción

La landing usa `IntersectionObserver` para registrar vistas y permanencia por sección sin enviar eventos por cada movimiento. Los clics guardan versión de página, sección, elemento, dispositivo y coordenadas normalizadas.

`/admin/analytics/heatmap` filtra por período, página, versión, dispositivo, fuente y campaña. La visualización usa una representación controlada del layout; no toma capturas ni graba sesiones.

Los agregados por sección contienen vistas, interacciones, clics, tiempo de interacción y conversiones posteriores.
