# Reglas de Codificación

## Idiomas y Convenciones de Nombres
- **Inglés Exclusivo**: El código, nombres de variables, funciones, clases, archivos, carpetas y nombres técnicos en base de datos DEBEN estar en inglés.
- **Español Exclusivo**: Todos los textos de la interfaz de usuario (UI) y la documentación técnica del proyecto (archivos `.md` en la carpeta `docs`) DEBEN estar en español.

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

## Flujo de Trabajo del Asistente
Después de finalizar cada tarea o requerimiento, se DEBE reportar:
1. Archivos creados/modificados.
2. Comandos a ejecutar.
3. Tests agregados o pendientes.
4. Brechas o suposiciones (Gaps/assumptions) tomadas durante la tarea.
5. Siguiente paso recomendado.
