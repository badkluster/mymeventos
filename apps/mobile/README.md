# M&M Eventos Staff — builds móviles

La aplicación usa Expo SDK 57 y EAS Build. Los comandos de EAS deben ejecutarse desde `apps/mobile`, porque esta aplicación vive dentro de un monorepo PNPM.

## Preparación inicial

Instalar las dependencias desde la raíz del repositorio:

```bash
corepack enable
pnpm install
```

Luego ingresar a la aplicación móvil e iniciar sesión en Expo:

```bash
cd apps/mobile
npx eas-cli@21.3.0 login
```

En la primera ejecución, EAS solicitará crear o vincular el proyecto y agregará un `projectId` válido a la configuración Expo. También puede hacerse de forma explícita:

```bash
yarn eas:init
```

Cuando EAS pregunte por las credenciales Android, se recomienda permitir que Expo genere y administre el keystore remoto. Ese mismo keystore debe conservarse para todas las actualizaciones futuras publicadas con `com.mymeventos.staff`.

## Generar una APK productiva instalable

Desde `apps/mobile`:

```bash
yarn build
```

El comando usa el perfil `apk`, compila en EAS Cloud y devuelve un enlace para descargar una APK release firmada, instalable directamente en un teléfono Android.

Comando equivalente:

```bash
yarn build:apk
```

## Cambiar rápidamente la URL del backend

Para APK, AAB e iOS, editar una sola propiedad en `apps/mobile/eas.json`:

```json
{
  "build": {
    "base": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://www.mymsalones.com.ar/api"
      }
    }
  }
}
```

Los perfiles `preview`, `apk` y `production` heredan esta URL. Debe incluir `/api`, no terminar en `/` y usar HTTPS para builds productivas.

Para desarrollo local, copiar `.env.example` como `.env.local`:

```bash
cp .env.example .env.local
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

En un teléfono físico, reemplazar la URL local por la IP LAN de la computadora:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.20:3001/api
```

## Builds para las tiendas

Google Play requiere AAB, no APK:

```bash
yarn build:android:store
```

iOS / App Store Connect:

```bash
yarn build:ios:store
```

Ambas plataformas:

```bash
yarn build:stores
```

El perfil `production` usa incremento remoto automático de `versionCode` y `buildNumber` para que cada entrega sea aceptada como una versión nueva.

## Envío a las tiendas

Luego de configurar las credenciales de Google Play Console o App Store Connect:

```bash
yarn submit:android
yarn submit:ios
```

Android queda configurado para subir inicialmente al track interno como borrador, evitando una publicación pública accidental.

## Nota sobre Yarn y PNPM

El monorepo está administrado por PNPM. `yarn build` es un alias solicitado para ejecutar la compilación móvil desde `apps/mobile`; no debe ejecutarse desde la raíz. Si Corepack impide usar Yarn porque detecta el gestor del monorepo, el comando nativo equivalente es:

```bash
pnpm run build
```

También puede iniciarse desde la raíz con:

```bash
pnpm build:mobile:apk
```
