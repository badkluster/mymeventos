# Mobile releases

## One-time setup

From `apps/mobile`:

```bash
pnpm install --no-frozen-lockfile
pnpm eas:configure
```

The EAS project ID is created by Expo under the authenticated account. Because this project uses a dynamic `app.config.js`, if EAS prints `extra.eas.projectId` and `updates.url` instead of writing them automatically, copy those generated values into the Expo config before the first production build.

If this Android application already has a build published in Google Play, initialize EAS remote versioning once with the current store `versionCode`:

```bash
npx eas-cli@latest build:version:set
```

## OTA update

Use for JavaScript/TypeScript, styles, assets, text and compatible application logic that does not change the native runtime:

```bash
pnpm update:production
```

The app checks on launch and when it returns to foreground. A downloaded OTA is applied on the next safe launch; it does not force a reload during an active workflow.

## Android store release

Bump the public `expo.version` when the public app version changes, then run:

```bash
pnpm release:android
```

or directly:

```bash
pnpm build:production:android
```

Production builds use EAS remote versioning with `autoIncrement`, so the Android `versionCode` is incremented automatically.

## Store update prompt

Android uses Google Play in-app updates. Normal releases use the flexible update flow; Play releases with update priority 4 or 5 use the immediate flow. Flexible updates can be postponed and are reminded again after 24 hours.

The real Google Play flow must be tested with an app installed from a Play testing track or Internal App Sharing. A sideloaded APK is not equivalent to a Play-owned installation.

## Runtime compatibility

The app uses `runtimeVersion.policy = appVersion`. Changing the public Expo version creates a new OTA runtime boundary.
