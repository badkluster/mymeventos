# M&M Eventos Staff — APK local

La aplicación móvil se compila directamente en Windows, sin EAS Build, sin login de Expo y sin subir el código a un servicio externo.

## Requisitos locales

Antes del primer build deben estar instalados:

- Node.js y PNPM/Corepack.
- Java JDK 17 o compatible con la versión de Android Gradle Plugin utilizada por Expo SDK 57.
- Android Studio con Android SDK instalado.

El script detecta automáticamente el SDK en `ANDROID_SDK_ROOT`, `ANDROID_HOME` o `%LOCALAPPDATA%\Android\Sdk`.

## Instalar dependencias

Desde la raíz del monorepo:

```powershell
corepack enable
pnpm install
```

## Generar la APK

Desde `apps/mobile`:

```powershell
yarn build
```

El comando realiza automáticamente:

1. Compilación de `@mym/shared`.
2. `expo prebuild --platform android --clean`.
3. `gradlew app:assembleRelease`.
4. Copia del resultado final a:

```text
apps/mobile/release/mym-eventos-staff.apk
```

También puede ejecutarse desde la raíz:

```powershell
pnpm build:mobile:apk
```

## Cambiar rápidamente el backend

Editar una sola línea:

```text
apps/mobile/.env.production
```

Ejemplo:

```env
EXPO_PUBLIC_API_URL=https://www.mymsalones.com.ar/api
```

La URL debe usar HTTPS y no terminar en `/`. Después de modificarla, volver a ejecutar:

```powershell
yarn build
```

También se puede sobrescribir solamente para una ejecución:

```powershell
yarn build -ApiUrl "https://otro-backend.example.com/api"
```

## Yarn dentro del monorepo

La raíz continúa usando PNPM. `apps/mobile/package.json` declara Yarn de forma local para que Corepack permita ejecutar `yarn build` dentro de esa carpeta sin modificar el gestor del resto del proyecto.

## Sobre la firma

Esta APK release es autónoma e instalable directamente en un teléfono Android. El proyecto nativo generado por Expo utiliza la clave de desarrollo local para firmarla.

Para publicar una versión definitiva en Google Play debe configurarse una upload key propia y generarse un AAB firmado. Esa credencial debe conservarse para todas las actualizaciones futuras de `com.mymeventos.staff`.
