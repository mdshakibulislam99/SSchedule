# Building the Android app

ChronoPulse AI ships as a native Android app via [Capacitor](https://capacitorjs.com/).
The React/Vite web bundle is copied into the APK and served to the WebView from
`https://localhost`, so the whole app works offline apart from the AI features.

- **Application ID:** `com.chronopulse.ai`
- **Display name:** ChronoPulse AI
- **minSdk 24** (Android 7.0) · **target/compileSdk 36** (Android 16)

## Prerequisites

| Tool | Version used | Notes |
| --- | --- | --- |
| Node.js | 26 | any modern LTS works |
| JDK | 21 | AGP 8.13 needs 17+ |
| Android SDK | Platform 36, Build-Tools 36.0.0 | set `ANDROID_HOME` |

Install the SDK without Android Studio:

```bash
brew install --cask android-commandlinetools   # or download the CLI tools
export ANDROID_HOME="$HOME/Library/Android/sdk"
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

## Build an APK

```bash
npm install
npm run apk:debug     # android/app/build/outputs/apk/debug/app-debug.apk
npm run apk:release   # android/app/build/outputs/apk/release/app-release.apk
```

Both APKs are signed and sideloadable. `apk:release` is smaller (no debug
symbols) and is the one to share.

## Install on a device

```bash
# over USB, with debugging enabled
adb install -r android/app/build/outputs/apk/release/app-release.apk

# or straight from Gradle
npm run apk:install
```

## Pointing the app at a backend

The web version and the Express server share an origin, so `/api/ai/*` works as
a relative path. A packaged APK has no server of its own, so set the deployed
API origin at build time — `src/lib/api.ts` prepends it to every AI request:

```bash
VITE_API_BASE_URL=https://your-api.example.com npm run apk:release
```

`server.ts` sends permissive CORS headers so the WebView origin
(`https://localhost`) can reach it. Without this variable the app runs fully
offline but the AI screens report a network error.

## Signing

`android/app/build.gradle` reads credentials from the git-ignored
`android/keystore.properties`. A placeholder keystore is checked in for
convenience — **replace it before publishing anywhere**:

```bash
rm android/app/release.keystore
npm run android:keystore            # regenerate
# then update android/keystore.properties with your own passwords
```

## Regenerating icons and splash screens

```bash
npm run android:assets   # scripts/generate-android-assets.py, no deps needed
npm run cap:sync
```

## Known WebView limitations

These are platform constraints of the embedded WebView, not build problems:

- **Web push notifications do not exist in a WebView.** In-app toasts and the
  reminder chime still fire while the app is open. Real background reminders
  need `@capacitor/local-notifications`.
- **Google Identity Services (GSI) is blocked** in embedded WebViews, so the
  Google Calendar sync / Google sign-in flow cannot complete. Firebase
  email/password auth is unaffected.
- **Puter.js** is loaded from a CDN, so it needs network access on first use.
