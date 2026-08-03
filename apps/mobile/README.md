# M&M Eventos Staff - APK local

La aplicacion movil se compila directamente en Windows, sin EAS Build, sin login de Expo y sin subir el codigo a un servicio externo.

## Requisitos locales

Antes del primer build deben estar instalados:

- Node.js y PNPM/Corepack.
- Java JDK 17 o compatible con Android Gradle Plugin.
- Android Studio con Android SDK instalado.

El script detecta automaticamente el SDK en `ANDROID_SDK_ROOT`, `ANDROID_HOME` o `%LOCALAPPDATA%\Android\Sdk`.

## Generar la APK

Desde `apps/mobile`:

```powershell
yarn build
```

El comando realiza automaticamente:

1. Instala/verifica las dependencias PNPM con estructura hoisted.
2. Compila `@mym/shared`.
3. Ejecuta `expo prebuild --platform android --clean`.
4. Ejecuta `gradlew app:assembleRelease`.
5. Copia el resultado final a:

```text
apps/mobile/release/mym-eventos-staff.apk
```

Tambien puede ejecutarse desde la raiz:

```powershell
pnpm build:mobile:apk
```

## Solucion aplicada para Windows y PNPM

React Native, CMake y algunas dependencias nativas pueden superar el limite de longitud de rutas de Windows cuando PNPM usa su instalacion aislada dentro de una carpeta profunda.

El proyecto utiliza `nodeLinker: hoisted` y el script monta temporalmente la raiz del repositorio en una letra de unidad corta mediante `subst`. La unidad se elimina automaticamente cuando termina el build, incluso si ocurre un error.

Expo SDK 52+ configura Metro automaticamente para monorepos, por lo que `metro.config.js` no modifica manualmente `watchFolders` ni `nodeModulesPaths`.

## Primer build despues de cambiar la estrategia PNPM

El primer `yarn build` puede tardar mas porque PNPM debe reorganizar `node_modules`. Los siguientes builds reutilizan las dependencias instaladas.

Si PNPM informa que `node_modules` fue creado con otra estrategia, ejecutar desde la raiz:

```powershell
Remove-Item node_modules -Recurse -Force
pnpm install --frozen-lockfile
```

Luego volver a ejecutar:

```powershell
cd apps\mobile
yarn build
```

## Cambiar rapidamente el backend

Editar una sola linea:

```text
apps/mobile/.env.production
```

Ejemplo:

```env
EXPO_PUBLIC_API_URL=https://www.mymsalones.com.ar/api
```

La URL debe usar HTTPS y no terminar en `/`. Despues de modificarla, volver a ejecutar:

```powershell
yarn build
```

Tambien se puede sobrescribir solamente para una ejecucion:

```powershell
yarn build -ApiUrl "https://otro-backend.example.com/api"
```

## Sobre la firma

Esta APK release es autonoma e instalable directamente en un telefono Android. El proyecto nativo generado por Expo utiliza la clave de desarrollo local para firmarla.

Para publicar una version definitiva en Google Play debe configurarse una upload key propia y generarse un AAB firmado. Esa credencial debe conservarse para todas las actualizaciones futuras de `com.mymeventos.staff`.
