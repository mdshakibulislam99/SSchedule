#!/bin/bash
#
# Build & run SSchedule on the iOS Simulator — 100% FREE, no Apple Developer
# account required. Simulator builds need no code signing, no provisioning
# profile, and never expire.
#
# Usage:
#   ./build-ios-sim.sh            # Debug build (default, fastest)
#   ./build-ios-sim.sh Release    # Release build (faster runtime, no debug symbols)
set -euo pipefail

cd "$(dirname "$0")"                     # always run from repo root

BUNDLE_ID="com.sschedule.app"
CONFIG="${1:-Debug}"
DERIVED="ios/App/DerivedData"
PRODUCTS="$DERIVED/Build/Products"
APP_PATH="$PRODUCTS/$CONFIG-iphonesimulator/App.app"

echo "🚀 SSchedule → iOS Simulator (free, no Apple Developer account)"

# 1. Build the web bundle.
echo "⚙️  Building web assets..."
npm run build

# 2. Copy assets + config + plugins into the iOS project.
echo "🔄 Syncing Capacitor → iOS..."
npx cap sync ios

# 3. Make sure a simulator is booted; boot the first available iPhone if not.
if ! xcrun simctl list devices | grep -q "(Booted)"; then
  UDID="$(xcrun simctl list devices available \
          | grep -E 'iPhone' \
          | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' \
          | head -1)"
  if [ -z "$UDID" ]; then
    echo "❌ No iPhone simulator available. Install one via Xcode → Settings → Platforms."
    exit 1
  fi
  echo "📱 No simulator running — booting $UDID ..."
  xcrun simctl boot "$UDID" || true
  open -a Simulator
  sleep 6
fi

# 4. Compile for the simulator. CODE_SIGNING_ALLOWED=NO keeps it account-free.
echo "🛠️  Building $CONFIG for iphonesimulator (unsigned)..."
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration "$CONFIG" \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  'CODE_SIGN_IDENTITY=' \
  build | tail -3

if [ ! -d "$APP_PATH" ]; then
  echo "❌ Build product not found at $APP_PATH"
  exit 1
fi

# 5. Install and launch on the booted simulator.
echo "📦 Installing to booted simulator..."
xcrun simctl install booted "$APP_PATH"

echo "🎬 Launching SSchedule..."
xcrun simctl launch booted "$BUNDLE_ID"

echo ""
echo "✅ Done — SSchedule is running on the simulator."
echo "   Re-run this script after any web/code change to refresh it."
