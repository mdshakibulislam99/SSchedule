# Building the Android app

SSchedule ships as a native Android app via [Capacitor](https://capacitorjs.com/).
The React/Vite web bundle is copied into the APK and served to the WebView from
`https://localhost`, so the whole app works offline apart from the AI features.

- **Application ID:** `com.sschedule.app`
- **Display name:** SSchedule
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

## Update Notifications (GitHub Releases: 7-day grace → hard block)

The app includes an automated version check with a dismissible grace period:

1. **How it works**:
   - On launch, the app fetches the latest published GitHub release
     (`api.github.com/repos/mdshakibulislam99/SSchedule/releases/latest`,
     overridable at build time via `VITE_GITHUB_REPO`) and compares its tag
     against the local version (`CURRENT_APP_VERSION` in `src/utils/version.ts`).
   - If the installed version is older, a full-screen update modal appears with
     a **7-day countdown**. During the window it is dismissible ("Remind Me
     Later" / "Continue Using App"); the Android hardware back button is
     intercepted so users cannot back out or bypass the modal without updating.
   - Once the 7 days expire without an update, the modal becomes
     non-dismissible and blocks the app until the user updates.
   - Clicking **"Update Now"** downloads the release's APK asset (falls back to
     the release page when no APK is attached).
   - If the network is unreachable, the last fetched policy is served from
     `localStorage`; with no cache the app assumes it is up to date.

2. **Triggering an update prompt when releasing a new version**:
   - Publish a GitHub release with the next version tag (e.g. `v1.3.0`) and
     attach the APK. That's it — no server, no config flip, and no rebuild of
     already-shipped installs is needed.
   - The grace window starts the first time a client sees the new release, and
     each target version gets its own fresh 7-day window.

3. **Policy constants**: `BASELINE_POLICY` in
   `src/services/appUpdateService.ts` holds `minRequiredVersion`,
   `forceUpdate` and `gracePeriodDays`. The 7-day countdown and hard block
   apply to **any** newer release, independent of `minRequiredVersion`.

4. **Testing on-device**: **Settings > App Version & Updates > Update Policy &
   Simulation Controls** lets you simulate an old installed version, expire the
   grace window, simulate a policy requiring v2.0.0, or restore the real
   GitHub feed.

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
