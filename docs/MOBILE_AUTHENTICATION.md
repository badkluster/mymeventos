# Autenticación móvil

## 1. Cookie (web) + Bearer (móvil), en el mismo `requireAuth`

Antes de esta tarea, `requireAuth` (`apps/api/src/middlewares/auth.ts`) solo leía la cookie `accessToken` y exigía `canAccessBackoffice !== false` en la consulta a `User`. Esa condición es exactamente lo que bloqueaba a un `STAFF` puro (que siempre tiene `canAccessBackoffice: false`) de autenticarse — por diseño, ya que el backoffice web nunca debía ser su canal.

Cambio mínimo y aditivo:

```ts
function extractAccessToken(request) {
  if (request.cookies?.accessToken) return { token: request.cookies.accessToken, viaCookie: true };
  const header = request.get('authorization');
  if (header?.startsWith('Bearer ')) return { token: header.slice(7).trim(), viaCookie: false };
  return { viaCookie: false };
}
```

- **Si el token viene de la cookie** (web): se mantiene exactamente el filtro `canAccessBackoffice !== false` — **cero cambio de comportamiento para el backoffice**.
- **Si viene de `Authorization: Bearer`** (móvil): no se exige `canAccessBackoffice` — el gate de acceso móvil es otro, ver §2.

Los JWT de acceso son idénticos en formato/secreto (`{sub, username}`, firmados con `ACCESS_TOKEN_SECRET`) entre web y móvil; lo único que cambia es el canal de transporte y el TTL (`MOBILE_ACCESS_TOKEN_TTL=30m` vs `ACCESS_TOKEN_EXPIRES_IN=15m` web) y que el refresh token móvil vive más (`MOBILE_REFRESH_TOKEN_TTL=30d` vs `REFRESH_TOKEN_EXPIRES_IN=7d` web) — igual que la mayoría de apps móviles, para no forzar reingreso constante.

## 2. Gate de acceso móvil: dos condiciones independientes

Verificado con un bug real durante el desarrollo (ver `docs/MOBILE_QA.md` §"Bug encontrado en vivo"): el gate **no** puede ser un único permiso, porque `Permission.MOBILE_ACCESS` se otorga a nivel de *rol* (todo `STAFF` lo tiene por defecto) y eso por sí solo permitiría loguearse a cualquier empleado, sin que un admin haya habilitado explícitamente su acceso individual.

`isMobileEligible(user)` (`apps/api/src/modules/mobile/mobile-auth.routes.ts`) exige **ambas**:

1. `Permission.MOBILE_ACCESS` — vía rol (`RolePresets[Role.STAFF]` lo incluye) o `permissionOverrides` (para dar acceso a un `MANAGER`/`SALON_MANAGER` puntual, sin depender solo del rol `STAFF`, tal como pedía la tarea).
2. `User.attendanceConfig.canUseMobileApp === true` — el toggle **que ya existía** en `/admin/users/[id]` → pestaña "Asistencia" → "App móvil", antes sin ningún consumidor real. Ahora es la habilitación fina por usuario.

También se exige `user.active` y, si existe `staffProfile.employmentStatus`, que sea `ACTIVE` (relación laboral vigente).

## 3. Endpoints (`/api/mobile/auth/*`)

| Endpoint | Notas |
|---|---|
| `POST /login` | Body: `{username, password, device}`. Registra/actualiza el `MobileDevice` y responde `{accessToken, refreshToken, accessTokenExpiresIn, user}` en el body (no cookies). |
| `POST /refresh` | Body: `{refreshToken}` (no cookie). Rota el refresh token (revoca el usado, emite uno nuevo) y vuelve a validar elegibilidad móvil en cada rotación — si un admin apaga el acceso a mitad de sesión, el próximo refresh lo corta. |
| `POST /logout` | Revoca solo el refresh token presentado. |
| `POST /logout-all` | Requiere sesión. Revoca **solo** los `RefreshToken` con `channel: 'mobile'` del usuario — no cierra su sesión web si también es admin. |
| `GET /session` | Equivalente móvil de `/auth/me`. |
| `POST /forgot-password` | Para un usuario elegible, genera un código numérico de seis dígitos con CSPRNG, guarda sólo su hash (`sha256`) por 30 min y lo envía por email junto con un deep link `mymeventos://reset-password?username=...&token=...`. Responde siempre `200` exista o no el usuario (no revela existencia) y admite hasta 3 pedidos por IP cada 15 min. |
| `POST /reset-password` | Recibe `{ username, token, newPassword }`, valida el hash+expiración para ese usuario y permite hasta 5 intentos del código. Al cambiarla, invalida el código y **revoca todos los refresh tokens** del usuario (web y móvil) por seguridad. La ruta además admite hasta 5 solicitudes por IP cada 15 min. |
| `POST /change-password` | Requiere sesión + `Permission.SECURITY_PASSWORD_CHANGE` (en el preset de `STAFF` por defecto). |

No existía ningún flujo de "olvidé mi contraseña" en el código (ni web ni móvil) — se construyó completo, reutilizando los campos `passwordResetTokenHash`/`passwordResetExpiresAt` que ya estaban en el esquema de `User` sin ningún consumidor.

Para que el código llegue realmente al usuario, el entorno donde se despliega la API debe tener `EMAIL_NOTIFICATIONS_ENABLED=true` y las cinco variables SMTP configuradas (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). Si se mantienen apagadas, la API conserva una respuesta genérica por privacidad pero no puede entregar el email.

## 4. Dispositivos (`MobileDevice`)

Una fila por `(userId, installationId)` — no es lo mismo que una sesión: una "instalación" puede tener múltiples refresh tokens a lo largo del tiempo (rotación). `RefreshToken` ganó un campo `installationId` (más `channel: 'web'|'web'`) para poder revocar *todas* las sesiones de un dispositivo concreto.

- Autogestión: `GET/DELETE /api/mobile/me/devices[/:id]`.
- Gestión admin: `GET/DELETE /api/users/:id/devices[/:deviceId]` (requiere `Permission.MOBILE_DEVICES_MANAGE`), visible desde el backoffice (permission area "Gestión de asistencia").
- Revocar un dispositivo revoca también sus `RefreshToken` activos — no solo lo "oculta" de la lista.

Explícitamente **no se guarda ningún dato biométrico**, ni en `MobileDevice` ni en ningún otro lado — `biometricEnabled` es solo un flag informativo de que ese dispositivo protege localmente su sesión guardada con Face ID/huella.

## 5. Biometría (app móvil)

**Actualizado 2026-08-03: dos mecanismos distintos, ambos gateados por `expo-local-authentication`, ninguno envía nada biométrico a la red.**

### 5.1 Desbloqueo de sesión abierta (`unlockWithBiometrics`, sin cambios respecto al diseño original)

Protege el **acceso local** a un refresh token que sigue vigente en `expo-secure-store` (la app sigue "adentro", solo se re-arrancó en frío con `RootNavigator` detectando `status: 'locked'`). No reemplaza las credenciales del backend — la sesión ya existía — y se invalida solo si esa sesión deja de ser válida (logout, reset de contraseña que revoca todos los refresh tokens, etc.).

### 5.2 "Ingresar con huella" tras un logout explícito (`loginWithBiometrics`, nuevo)

Antes de esta tarea, cerrar sesión ("Cerrar sesión") revocaba el refresh token y borraba todo localmente — sin nada que la huella pudiera desbloquear, el primer ingreso posterior era **siempre** usuario+contraseña, incluso si el usuario había activado la biometría. Esto generaba una confusión real: activar el toggle no ofrecía ninguna opción de huella en la pantalla de login tras un logout.

Decisión tomada explícitamente por el usuario (evaluadas dos alternativas: cachear credenciales vs. redefinir "Cerrar sesión" como bloqueo local): **cachear la contraseña, cifrada, solo en este dispositivo**, gateada por una verificación biométrica fresca antes de cada uso. Cambia la garantía previa ("nada biométrico ni relacionado se guarda nunca") a una más matizada: **nunca se guarda ni envía nada biométrico; sí se cachea la contraseña en texto plano dentro de `expo-secure-store`, únicamente si el usuario activó el toggle de biometría.**

- `apps/mobile/src/lib/secureStorage.ts`: `saveCachedCredentials`/`loadCachedCredentials`/`clearCachedCredentials`, misma clave de almacenamiento (`expo-secure-store`, Keychain/EncryptedSharedPreferences) que los tokens — no es un mecanismo nuevo de storage, solo un valor más.
- Se cachea en dos momentos: (a) justo después de un login exitoso si la biometría ya estaba activada (`authStore.ts#login`, autorefresco silencioso — cubre el caso de contraseña cambiada por otro canal), y (b) al activar la biometría, con la contraseña disponible en memoria solo transitoriamente (`pendingCredentials`, nunca persistida sin cifrar fuera de ese flujo):
  - Activación inmediatamente después de loguearse (`BiometricSetupScreen` → `enableBiometricFromPendingLogin`): usa la contraseña recién tipeada, ya en memoria por el login que se acaba de completar.
  - Activación posterior desde `Perfil > Seguridad y biometría` (`BiometricSettingsScreen`): no hay contraseña en memoria, así que se pide re-tipearla una vez (`ConfirmationSheet` con `PasswordInput`) y se valida contra el backend (`confirmPasswordForBiometrics`, reutiliza `POST /mobile/auth/login`, no hay endpoint nuevo) antes de cachearla.
- `LoginScreen` muestra un botón adicional "Ingresar con huella" (no reemplaza el formulario de usuario/contraseña, que sigue siendo siempre el flujo principal y el único disponible si no hay biometría activada o si el sensor falla) cuando hay biometría activada **y** una credencial cacheada disponible (`checkBiometricLoginAvailable`). Al tocarlo: pide huella/Face ID (`authenticateWithBiometrics`) y, si es exitosa, ejecuta un login real con la credencial cacheada (`loginWithBiometrics` → `authStore.login`).
- Invalidación de la caché (además de al desactivar el toggle):
  - `POST /mobile/auth/change-password` exitoso → se recachea con la contraseña nueva (`refreshCachedCredentialsAfterPasswordChange`), no se pierde el acceso rápido.
  - `POST /mobile/auth/reset-password` exitoso → se borra (contraseña vieja inválida; se recachea sola en el próximo login manual exitoso si la biometría sigue activada).
  - Intento de `loginWithBiometrics` que responde `INVALID_CREDENTIALS`/`MOBILE_ACCESS_DENIED` → se borra la caché (auto-sanación: la próxima vez no se ofrece el botón hasta el próximo login manual exitoso).
  - `logoutAllDevices` (acción de pánico "perdí el dispositivo") → se borra la caché y se desactiva el toggle en este mismo dispositivo, no solo se revocan los tokens remotos.
  - Un deep link de recuperación de contraseña abierto con la app corriendo (`beginPasswordReset`) → se borra preventivamente, antes incluso de que el usuario termine el flujo de reset.

**Nunca se toca `unlockWithBiometrics`, `BiometricUnlockScreen` ni el mecanismo de la sección 5.1** — siguen protegiendo únicamente el acceso local a una sesión ya abierta, sin credenciales cacheadas de por medio. Esa pantalla ya tenía (y conserva) su propio fallback a contraseña ("Ingresar con contraseña" → vuelve a `LoginScreen`), que sigue siendo la salida si el sensor de huella falla.

## 6. Fuera de alcance de esta tarea (documentado, no fingido)

- **Validación de entradas QR desde el móvil.** El prompt original es explícito: debe ser un permiso y flujo separado del fichaje, no mezclado. `Permission.TICKETS_VALIDATE` ya existe (módulo de Entradas Digitales) y es independiente de `Permission.MOBILE_ACCESS`/`ATTENDANCE_CLOCK` — no se tocó ni se mezcló.
- **Rate limiting distribuido.** `/api/mobile/auth/login` limita a 10 intentos por IP cada 15 minutos y devuelve `429`/`Retry-After` al superar ese umbral. El límite actual es local en memoria, igual que el de recuperación de contraseña; en un despliegue con varias instancias debe reemplazarse por un almacén compartido, por ejemplo Redis.
