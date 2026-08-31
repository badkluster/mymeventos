# Publicación en App Store — M&M Eventos Staff

Este documento reúne los datos verificables del primer envío. No reemplaza la carga final en App Store Connect ni la revisión en un iPhone real.

## Distribución

La aplicación está dirigida únicamente al personal autorizado. Elegir una de estas modalidades antes de crear el registro de la app:

- **No listada**: para distribuir mediante enlace directo a personal, franquicias o colaboradores.
- **Privada (Custom App)**: si la organización administra Apple Business Manager y debe limitar la descarga a organizaciones concretas.

No seleccionar distribución pública sin esa decisión, ya que Apple no permite cambiar una app privada aprobada a pública sin crear un registro nuevo.

## Metadatos sugeridos

| Campo | Valor |
| --- | --- |
| Nombre | M&M Eventos Staff |
| Subtítulo | Asistencia y jornada laboral |
| Categoría principal | Negocios |
| URL de soporte | https://www.mymsalones.com.ar/privacidad#soporte |
| URL de privacidad | https://www.mymsalones.com.ar/privacidad |
| URL de opciones de privacidad | https://www.mymsalones.com.ar/privacidad#eliminar-cuenta |
| Copyright | © 2026 M&M Eventos |

Descripción breve sugerida:

> M&M Eventos Staff permite al personal autorizado registrar su jornada, consultar su actividad y gestionar su perfil de forma segura. La ubicación se solicita sólo al fichar y las funciones biométricas se procesan en el dispositivo.

## Etiqueta de privacidad

Completar las respuestas en App Store Connect tomando como fuente el código y los proveedores realmente activos en el build enviado. Para esta versión, declarar los siguientes datos como vinculados al usuario y usados para funcionalidad de la app, sin tracking:

- Información de contacto: nombre, email, teléfono, dirección y contacto de emergencia, cuando el usuario los carga o actualiza en su perfil.
- Ubicación precisa: coordenadas enviadas únicamente al registrar entrada o salida.
- Fotos o videos: foto seleccionada voluntariamente como avatar.
- Identificadores: ID de usuario e identificador de instalación/dispositivo usados para autenticación y seguridad.
- Otros datos de uso: registros de jornada, horarios e incidencias operativas.
- Datos de diagnóstico: revisar el informe de privacidad del archivo generado; Expo recomienda declarar datos de crash cuando se usa `expo-updates`.

No declarar tracking ni mostrar un diálogo de App Tracking Transparency salvo que se incorpore un proveedor que vincule datos con información de terceros para publicidad o medición publicitaria.

## Material de revisión

Antes de enviar a revisión, el responsable de App Store Connect debe completar estos elementos fuera del repositorio:

1. Crear el registro con el bundle ID `com.mymeventos.staff`.
2. Cargar capturas hechas desde el build iOS real. No usar maquetas ni capturas Android; deben mostrar el flujo real de login, inicio/fichaje y perfil.
3. Proporcionar una cuenta demo activa y las instrucciones necesarias para probar login, fichaje y ubicación. No incluir credenciales en este repositorio.
4. Mantener la API de producción disponible durante la revisión y explicar que la ubicación se solicita sólo al iniciar o cerrar una jornada.
5. Completar el cuestionario de clasificación por edad, disponibilidad y export compliance. La configuración iOS declara que la app usa únicamente cifrado exento estándar del sistema.

## Verificación de entrega

Ejecutar después de instalar dependencias alineadas y antes de enviar el binario:

1. `pnpm --filter @mym/mobile typecheck`
2. `pnpm --filter @mym/mobile test -- --runInBand`
3. `npx expo-doctor@latest`
4. Build de producción iOS mediante el perfil `production` de EAS.
5. Instalar el archivo en TestFlight y probar en un iPhone real: login, Face ID, selección de avatar, permisos de fotos/ubicación/notificaciones, fichaje, deep link de recuperación y actualización OTA.

El archivo iOS debe construirse con el SDK mínimo vigente exigido por Apple en el momento del envío.
