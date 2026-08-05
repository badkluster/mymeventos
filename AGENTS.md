# Protección de datos — regla obligatoria

Esta regla aplica a toda persona y agente de IA que trabaje en este repositorio, sin excepción de entorno.

- No ejecutar, crear, alterar ni sugerir scripts, comandos o pruebas que inserten, actualicen, reemplacen, borren, siembren, restauren o reinicialicen datos en ninguna base de datos: local, testing, staging o producción.
- No ejecutar `seed`, fixtures, datos demo, importaciones masivas, migraciones de datos, `upsert` por lote, reseteos ni restauraciones sin una autorización explícita del usuario en la conversación actual. La autorización debe indicar el entorno y el alcance concreto; una aprobación previa no se reutiliza.
- Las consultas de sólo lectura para diagnóstico están permitidas. Nunca exponer secretos, cadenas de conexión ni credenciales al informar el resultado.
- Las pruebas no deben conectarse a una base de datos persistente/remota ni limpiarla. Usar mocks o recursos aislados que no contengan datos de usuarios.
- Ante cualquier duda sobre si una operación puede modificar datos, detenerse y pedir autorización antes de ejecutarla.

El producto puede seguir modificando datos mediante sus flujos normales solicitados por usuarios autenticados. Esta regla se refiere a intervenciones directas de desarrollo, mantenimiento, scripts y pruebas.
