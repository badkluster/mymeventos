# Reglas de Codificación

## Idiomas y Convenciones de Nombres
- **Inglés Exclusivo**: El código, nombres de variables, funciones, clases, archivos, carpetas y nombres técnicos en base de datos DEBEN estar en inglés.
- **Español Exclusivo**: Todos los textos de la interfaz de usuario (UI) y la documentación técnica del proyecto (archivos `.md` en la carpeta `docs`) DEBEN estar en español.
- **Sin códigos técnicos visibles**: La interfaz pública y el backoffice NO DEBEN mostrar valores técnicos, enums, códigos de API, nombres de rutas, claves internas ni texto en inglés. Por ejemplo, `new` debe renderizarse como “Nuevo”, `quick_quote` como “Cotización rápida” y `follow_up` como “Seguimiento”. Los identificadores técnicos permanecen en inglés sólo en código, API, base de datos y logs.
- **Mapeo de etiquetas**: Cada enum o estado que pueda aparecer en UI DEBE tener un mapa centralizado de etiquetas en español. Los componentes deben renderizar la etiqueta, nunca el valor crudo recibido desde API. Los mensajes de error muestran el mensaje español del API; el `error.code` sólo se usa internamente para lógica, telemetría o depuración.

## Lenguajes y Frameworks
- **TypeScript**: Debe utilizarse TypeScript en todo el proyecto (Frontend, Backend, Mobile). No se permite el uso de JavaScript sin tipado.
- **Validaciones**: Se debe utilizar `Zod` para validar datos tanto en el cliente como en el servidor.
- **Estilos**: TailwindCSS junto con los componentes de `shadcn/ui`.

## Restricciones de Infraestructura
- **Docker**: NO SE DEBE utilizar Docker, `Dockerfile` ni `docker-compose`.

## Principios de Desarrollo
- **Desarrollo por Fases**: No intentar implementar todo el sistema a la vez. Completar características paso a paso de acuerdo a las fases de implementación.
- **Sin Falsas Integraciones**: No crear código o integraciones simuladas que parezcan listas para producción si no lo están.
- **Manejo de Errores**: Toda implementación debe incluir un manejo de errores claro, validaciones estrictas y consideraciones de seguridad.
- **Abstracción**: Elementos clave como correos (Nodemailer) y pasarelas de pago deben abstraerse en servicios para permitir cambios futuros de proveedor.
- **Formularios de alta**: Toda alta o creación breve (hasta aproximadamente 10-12 campos, sin pasos ni dependencias complejas) DEBE abrirse en un modal moderno, accesible y responsive construido con `Dialog` de `shadcn/ui`. El listado o detalle debe permanecer visible detrás del modal. Los formularios extensos, con múltiples secciones, carga de archivos o pasos deben usar una página dedicada o un flujo por pasos; no se deben forzar dentro de un modal.
- **Comportamiento de modales**: Los modales de alta deben incluir título en español, acción de cierre, validación visible, estado de envío, mensajes de éxito/error en español y cierre automático sólo después de una creación exitosa. No deben borrar datos ingresados ante un error.
- **Acciones en tablas**: Las columnas de acciones de todos los listados DEBEN usar botones iconográficos consistentes de `lucide-react`, no texto repetitivo. Cada botón debe tener `aria-label` en español y `Tooltip` de `shadcn/ui` con una explicación al hacer hover o recibir foco de teclado. Usar iconos semánticos: ver/detalle, editar, eliminar, duplicar o acciones específicas. Las acciones destructivas deben pedir confirmación mediante `AlertDialog`.
- **Detalle y navegación padre-hijo**: Toda pantalla de detalle debe mostrar una acción visible “Volver a [listado]” en el encabezado, antes del título o como breadcrumb. Por ejemplo, un detalle de Lead debe volver a `/admin/leads`. Esta navegación debe preservar, cuando sea posible, los filtros y la posición del listado. Las acciones de editar/eliminar pertenecen al detalle o a su menú de acciones; eliminar exige confirmación y, al finalizar, redirige al listado padre con un mensaje en español.
- **Estándar global de tablas administrativas**: Toda tabla de negocio debe incluir, cuando aplique, acciones de ver detalle, editar y eliminar. Se usan únicamente iconos con tooltip y `aria-label` en español. Las ediciones breves se resuelven mediante modal; eliminar siempre usa `AlertDialog`, ejecuta borrado lógico, refresca el listado y redirige al listado padre desde la pantalla de detalle.

## Flujo de Trabajo del Asistente
Después de finalizar cada tarea o requerimiento, se DEBE reportar:
1. Archivos creados/modificados.
2. Comandos a ejecutar.
3. Tests agregados o pendientes.
4. Brechas o suposiciones (Gaps/assumptions) tomadas durante la tarea.
5. Siguiente paso recomendado.
