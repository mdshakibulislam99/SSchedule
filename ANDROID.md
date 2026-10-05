# Building the Android app

ChronoPulse AI ships as a native Android app via [Capacitor](https://capacitorjs.com/).
The React/Vite web bundle is copied into the APK and served to the WebView from
`https://localhost`, so the whole app works offline apart from the AI features.

- **Application ID:** `com.sschedule.app`
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

## Mandatory App Updates (Force-Update System)

The app includes an automated version check and non-dismissible force-update modal:

1. **How it works**:
   - On launch, the app compares its local version (`CURRENT_APP_VERSION` in
     `src/utils/version.ts`) against the remote backend endpoint `/api/app-version`.
   - If the installed version is lower than `minRequiredVersion`, or if `forceUpdate: true` and the version is below `latestVersion`, the app displays a full-screen, non-dismissible **"Update Required"** modal.
   - The Android hardware back button is intercepted so users cannot back out or bypass the modal without updating.
   - Clicking **"Update Now"** opens the download/store link directly (`APP_DOWNLOAD_URL`).

2. **Triggering a mandatory update when releasing a new version**:
   - You can update environment variables on your server:
     ```env
     LATEST_APP_VERSION=1.2.0
     MIN_REQUIRED_APP_VERSION=1.2.0
     FORCE_APP_UPDATE=true
     APP_DOWNLOAD_URL=https://play.google.com/store/apps/details?id=com.sschedule.app
     ```
   - Or send an HTTP POST request to your API:
     ```bash
     curl -X POST https://your-api.example.com/api/app-version \
       -H "Content-Type: application/json" \
       -d '{
         "latestVersion": "1.2.0",
         "minRequiredVersion": "1.2.0",
         "forceUpdate": true,
         "title": "Update Required",
         "message": "A critical update is required to continue using ChronoPulse AI.",
         "releaseNotes": ["New AI study features", "Important bug fixes"]
       }'
     ```
   - You can also test the force-update flow directly inside the app in **Settings > App Version & Updates > Update Policy & Simulation Controls**.

## Known WebView limitations

These are platform constraints of the embedded WebView, not build problems:

- **Web push notifications do not exist in a WebView.** In-app toasts and the
  reminder chime still fire while the app is open. Real background reminders
  need `@capacitor/local-notifications`.
- **Google's web OAuth popup is blocked** in embedded WebViews. Google
  sign-in therefore uses the **native** SDK
  (`@capgo/capacitor-social-login`) rather than `signInWithPopup`; see
  `src/lib/googleAuth.ts`. The web popup path still serves the browser build.
  Native sign-in needs `android/app/google-services.json` and the release +
  debug SHA-1 fingerprints registered on the Firebase Android app. Firebase
  email/password auth is unaffected.
- **Do not pass `scopes` to the native `SocialLogin.login()` Google call.** The
  Android plugin always requests `userinfo.email`, `userinfo.profile`, and
  `openid` on its own, but if a `scopes` array is present it rejects with
  *"You CANNOT use scopes without modifying the main activity"* unless
  `MainActivity` implements `ModifiedMainActivityForSocialLoginPlugin`. Those
  default scopes are all Firebase needs, so `src/lib/googleAuth.ts` passes an
  empty `options: {}`. Only add real scopes if you first implement that marker
  interface in `android/app/src/main/java/com/sschedule/app/MainActivity.java`.
- **Puter.js** is loaded from a CDN, so it needs network access on first use.
