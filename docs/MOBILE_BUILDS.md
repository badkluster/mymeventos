# Builds de la app móvil

> No se publicó ningún build ni se usaron credenciales reales de tienda/EAS en esta tarea (explícitamente fuera de alcance). Este documento deja preparado y documentado lo necesario para que el equipo lo haga cuando corresponda.

## 1. Identidad de la app (`apps/mobile/app.json`)

| Campo | Valor |
|---|---|
| `name` | M&M Eventos Staff |
| `slug` | `mym-eventos-staff` |
| `scheme` (deep links) | `mymeventos` |
| iOS `bundleIdentifier` | `com.mymeventos.staff` |
| Android `package` | `com.mymeventos.staff` |
| Ícono / splash / adaptive icon | `apps/mobile/assets/*.png` (reutilizan el logo ya existente en `apps/web/public/brand/mym-icon-512.png`, copiado — no se generó arte nuevo) |

Estos identificadores (`com.mymeventos.staff`) son **provisorios** — hay que confirmarlos con quien gestione las cuentas de Apple/Google antes de un build real, ya que no se puede cambiar el bundle id/package después de publicar.

## 2. Permisos nativos declarados

- **Ubicación** (`expo-location`, foreground únicamente — no se pidió ni declaró permiso de ubicación en segundo plano): textos de justificación en español ya cargados en `app.json` (`NSLocationWhenInUseUsageDescription`, `locationWhenInUsePermission`).
- **Biometría** (`expo-local-authentication`): `NSFaceIDUsageDescription` (iOS) + `USE_BIOMETRIC`/`USE_FINGERPRINT` (Android).
- **Fotos/cámara** (`expo-image-picker`, para el avatar): permisos declarados con texto en español.

## 3. Variables de entorno

`apps/mobile/.env.example` — todas con prefijo `EXPO_PUBLIC_*` (Expo las incluye en el bundle JS en tiempo de build; **no poner secretos acá**, esta app no maneja ningún secreto — toda autorización es usuario/contraseña + tokens Bearer emitidos por el backend):

```
EXPO_PUBLIC_API_URL=http://localhost:3001/api      # en Android físico, usar la IP de LAN de tu máquina
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_DEEP_LINK_SCHEME=mymeventos            # debe coincidir con app.json#scheme y con MOBILE_DEEP_LINK_SCHEME del backend
```

Del lado del backend (`.env.example` raíz), nuevas variables agregadas por esta tarea:

```
MOBILE_ACCESS_TOKEN_TTL=30m
MOBILE_REFRESH_TOKEN_TTL=30d
MOBILE_DEEP_LINK_SCHEME=mymeventos
ATTENDANCE_DEFAULT_TIMEZONE=America/Argentina/Buenos_Aires
ATTENDANCE_DEFAULT_LOCATION_ACCURACY_METERS=50
ATTENDANCE_DEFAULT_GEOFENCE_RADIUS_METERS=150
```

## 4. Ejecutar en desarrollo

```bash
pnpm --filter @mym/mobile start          # abre el Metro bundler / Expo Dev Tools
pnpm --filter @mym/mobile start -- --android
pnpm --filter @mym/mobile start -- --ios
```

En Windows, para abrir siempre el emulador antes de Expo Go, usar:

```bash
pnpm dev:mobile:android
```

El comando inicia el AVD `Medium_Phone_2`, espera a que Android termine de arrancar y recién después ejecuta `expo start --android`. Se puede usar otro AVD con `MYM_ANDROID_AVD`; el tiempo máximo predeterminado es 240 segundos y se ajusta con `MYM_ANDROID_EMULATOR_TIMEOUT_SECONDS`.

Además configura automáticamente `adb reverse tcp:3001 tcp:3001`, por lo que el valor local de `EXPO_PUBLIC_API_URL` funciona desde el emulador. El backend debe estar iniciado en el puerto 3001 (por ejemplo, con `pnpm dev:api`). Para un dispositivo Android físico no existe esa redirección: usar la IP de LAN de la máquina en `apps/mobile/.env`.

Requiere Expo Go (SDK 57) o un development build propio para los módulos nativos usados (`expo-secure-store`, `expo-location`, `expo-local-authentication`, `expo-image-picker`, `expo-application`, `expo-device`, `expo-network`, `expo-crypto`, `expo-splash-screen`) — todos son plugins de Expo estándar, compatibles con Expo Go sin config plugin adicional salvo los ya declarados en `app.json`.

### 4.1 Migración de Expo SDK ~50.0.8 → 57 (2026-07-26)

Motivo: el único emulador Android local disponible (`Medium_Phone_2`) usa la imagen de sistema `android-36` (Android 16). Expo Go para SDK ~50 revienta al arrancar en Android 15+ con `SecurityException: ... DETECT_SCREEN_CAPTURE` (ver [expo/expo#30053](https://github.com/expo/expo/issues/30053), arreglado recién desde Expo Go 2.31.2/SDK ~51.0.14 — pero se optó por ir directo a la última estable en vez de quedarse en 51, dado lo reciente de Android 16). Salto directo de 7 SDKs, no incremental: viable porque esta app es 100% managed workflow (sin `android/`/`ios/`, sin proyecto EAS) y no tiene módulos nativos propios.

Cambios relevantes de la migración (más allá del bump de versiones, resuelto con `npx expo install expo@57.0.8 && npx expo install --fix`):

- **New Architecture ahora es obligatoria** (desde SDK 55 no se puede desactivar). No requirió cambios de código — cero módulos nativos propios en todo el repo.
- **`expo-image-picker`**: `ImagePicker.MediaTypeOptions.Images` (deprecado) → `mediaTypes: ['images']` en `src/screens/profile/ProfileScreen.tsx`.
- **`app.json`**: la clave `splash` de nivel superior ya no es válida en el schema de config — se migró a la sección `plugins` como `["expo-splash-screen", { image, resizeMode, backgroundColor }]` (mismos valores, `expo-splash-screen` agregado como dependencia nueva).
- **Patch de Windows para `@expo/cli` eliminado**: `pnpm-workspace.yaml` tenía `patchedDependencies: '@expo/cli@0.17.13'` (`patches/@expo__cli@0.17.13.patch`), un workaround para un bug donde builtins con prefijo `node:` (`node:sea`, `node:sqlite`, `node:test`) rompían un `path.join` en el paso de Metro externals de la CLI en Windows. Verificado contra `@expo/cli@57.0.10` (la versión que trae SDK 57): la función afectada (`tapNodeShims`) fue reescrita (ahora `isNodeExternal`/`shouldCreateVirtualShim`, resolución bajo demanda en vez de un loop eager sobre todos los módulos) y el bug no reproduce (`expo start` corrido en Windows sin el patch, sin error). Se borró el patch y la entrada de `pnpm-workspace.yaml`. Si volviera a aparecer un error con `node:sea`/`node:sqlite`/`node:test` en Windows tras una futura actualización de `@expo/cli`, hay que regenerar el patch (no reusar el archivo viejo — la función que tocaba ya no existe en esa forma).
- **`apps/mobile/jest.config.js`**: pasó de evitar el preset `jest-expo` (comentario original: rompía bajo el layout `.pnpm` anidado de pnpm) a usar `jest-expo/node`. La versión nueva (`jest-expo@57.0.2`) ya incluye `.pnpm` en su `transformIgnorePatterns` generado — se verificó corriendo los 9 tests existentes, todos pasan. Este cambio fue necesario (no solo prolijidad): sin el preset, Jest no transformaba `expo/virtual/env.js` (módulo ESM nuevo que `babel-preset-expo` inyecta para soportar `process.env.EXPO_PUBLIC_*`), rompiendo `api.test.ts`.
- **`apps/mobile/tsconfig.json`**: se agregó `"types": ["jest"]` explícito — con TypeScript 6.0.3 (versión que pide SDK 57), la inclusión automática de `@types/jest` como ambiente global dejó de funcionar en este layout de pnpm; sin este override, `tsc` no reconocía `describe`/`it`/`expect`/`jest` en los archivos de test. No afecta la resolución de `@types/react` (se importa como módulo, no depende de inclusión ambiental).
- **`@react-native/assets-registry`** (dependencia directa fijada a mano en `0.73.1`, sin uso real en `src/`) se eliminó — resuelve como transitiva de `react-native`.

Fast-follows documentados pero **no** hechos en esta migración (deliberado, para no mezclar dos superficies de breaking changes en el mismo cambio): React Navigation quedó en v6 (sus peer ranges siguen satisfechos por las versiones que dejó `expo install --fix`; v6 ya no recibe soporte activo, evaluar v7 aparte).

**QA manual pendiente de ejecutar por el usuario en el emulador** (no automatizable, ver `docs/MOBILE_QA.md` §6): arranque de la app en Expo Go sobre `Medium_Phone_2`, login, desbloqueo biométrico, fichaje geolocalizado de entrada/salida, drenaje de la cola offline, selector de avatar, y recorrido de las pantallas de schedule/historial/notificaciones/incidencias/correcciones (atención a los insets de safe-area por el edge-to-edge obligatorio en Android desde SDK 53+).

## 5. Lo que falta antes de un build real (EAS)

No se creó ningún proyecto EAS ni `eas.json` — requiere una cuenta/organización de Expo real, que está fuera del alcance de esta tarea. Pasos pendientes para quien lo retome:

1. `eas login` con la cuenta de la organización.
2. `eas build:configure` → esto genera `eas.json` y completa `app.json#extra.eas.projectId` (dejado vacío a propósito).
3. Confirmar `bundleIdentifier`/`package` definitivos con quien gestione las cuentas de desarrollador de Apple/Google.
4. Generar/self-generar las credenciales de firma (`eas credentials`) — no se generó ninguna credencial de firma en esta tarea.
5. Configurar Expo Application Services notifications si se quiere activar push real (ver §6).

## 6. Push notifications: preparado, no conectado

`MobileDevice.pushToken` existe en el modelo y `POST /api/mobile/devices/push-token` lo persiste — pero **nada en el backend envía notificaciones push todavía** (ni Expo Push API ni FCM/APNs directo). La bandeja de avisos in-app (`/notifications`, reutilizando el módulo existente) sí funciona en tiempo real al abrir la pantalla. Conectar push real requeriría:
- Agregar `expo-notifications` al cliente (pedir permiso, obtener el Expo push token, enviarlo a `POST /mobile/devices/push-token` — el endpoint ya lo acepta).
- Un servicio en el backend que llame a la Expo Push API (`https://exp.host/--/api/v2/push/send`) cuando se cree una `Notification` con `recipientUserIds` que tengan `MobileDevice.pushToken` activo.

No se implementó para no declarar como "funcionando" algo que no se puede probar sin credenciales/dispositivo físico real, tal como pide explícitamente la tarea ("Si todavía no existe infraestructura push, dejarla correctamente preparada y documentada, sin declarar que funciona").
