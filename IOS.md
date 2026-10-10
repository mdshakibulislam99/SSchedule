# Building the iOS app

SSchedule ships as a native iOS app via [Capacitor](https://capacitorjs.com/).
The React/Vite web bundle is copied into the app and served to the WebView from
`https://localhost`, so the whole app works offline apart from the AI features.

- **Bundle ID:** `com.sschedule.app`
- **Display name:** SSchedule
- **Minimum iOS:** 15.0 · **Build with:** Xcode 15+ (uses Swift Package Manager, no CocoaPods)

> **No paid Apple Developer account required.** The primary workflow below runs
> entirely on the **iOS Simulator**, which needs **no code signing, no
> provisioning profile, and never expires** — it's completely free.

## Prerequisites

| Tool | Version used | Notes |
| --- | --- | --- |
| Node.js | 26 | any modern LTS works |
| Xcode | 15+ (tested on 27) | from the Mac App Store |
| Xcode CLI tools | bundled | `xcode-select --install` if missing |

You do **not** need to enroll in the Apple Developer Program ($99/yr) to build,
run, or test on the Simulator.

## Run on the Simulator (free, one command)

```bash
npm install
npm run ios:sim
```

`build-ios-sim.sh` does everything: builds the web bundle → `cap sync ios` →
compiles for `iphonesimulator` with **signing disabled** → boots a simulator if
none is running → installs and launches the app. Re-run it after any change.

Optional argument for a faster runtime build:

```bash
./build-ios-sim.sh Release
```

### What you should see

On first launch iOS shows the native **notifications permission** dialog (the
`@capacitor/local-notifications` plugin registering natively), and behind it the
React app renders in the WebView — not a blank white screen. This confirms the
`iosScheme: 'https'` fix in `capacitor.config.ts` is working.

## Open in Xcode

```bash
npm run ios:open     # opens ios/App in Xcode
```

Useful for the Simulator (Product → Run, no signing needed) or for signing to a
physical device (see below).

## Run on a physical iPhone (still free — with a free Apple ID)

You can deploy to your own iPhone without paying, using a **personal (free)
Apple ID**:

1. Xcode → **Settings → Accounts** → sign in with your Apple ID (free).
2. Select the **App** target → **Signing & Capabilities**.
3. Enable **Automatically manage signing** and pick your **Personal Team**
   (the free team created from your Apple ID).
4. Plug in the iPhone, select it as the run destination, then **Product → Run**.

Limitations of free signing (fine for personal testing, not for App Store /
TestFlight distribution):

- The app **expires after 7 days** — re-run from Xcode to refresh it.
- Up to **3 app IDs** per free account.
- No push notifications, App Groups, or other paid-only entitlements.
- Distribution to other people or the App Store still requires the paid
  Apple Developer Program.

> Prefer not to bother? Just use `npm run ios:sim` — the Simulator has none of
> these limits.

## Build for the App Store / TestFlight (requires paid account)

Once you have a paid Apple Developer account, archive from Xcode
(**Product → Archive**) or use `xcodebuild -exportArchive`. This is the only
step that needs the paid membership. Do **not** rely on the unsigned `.ipa` that
`build-ios.sh` produces — an unsigned binary cannot be installed on a device
without signing.

## Google Sign-In on iOS

Google sign-in uses the native SDK (`@capgo/capacitor-social-login`), because
Google's web OAuth popup is blocked in embedded WebViews. This is already wired:

- `ios/App/App/GoogleService-Info.plist` — Firebase iOS config (committed).
- `ios/App/App/Info.plist` → `CFBundleURLTypes` holds the reversed client ID
  (`com.googleusercontent.apps.…`) as a URL scheme.

Keep the bundle ID (`com.sschedule.app`) in sync with the Firebase iOS app and
the OAuth client, or sign-in will fail. Note: Android's `google-services.json`
is git-ignored while this iOS plist is tracked — untrack the plist too if you
want parity (`git rm --cached ios/App/App/GoogleService-Info.plist`).

## Keeping the bundle up to date

The WebView loads from `ios/App/App/public`, refreshed by `cap sync`. Always
sync before building:

```bash
npm run ios:sync     # npm run build && cap sync ios
npm run ios:sim      # does the sync for you, then builds + launches
```

## Known iOS limitations

These are platform constraints of the embedded WebView, not build problems:

- **Background reminders** on iOS are delivered by the system via
  `UNUserNotificationCenter` (through `@capacitor/local-notifications`); in-app
  toasts and the reminder chime cover the case where the app is open.
- **Google's web OAuth popup is blocked** in embedded WebViews, so Google
  sign-in uses the native SDK (see above). Firebase email/password auth is
  unaffected.
- **Puter.js** is loaded from a CDN, so it needs network access on first use.
