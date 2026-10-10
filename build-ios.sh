#!/bin/bash
set -e

echo "🚀 Starting Free Local iOS Build Process..."

# 1. Get version from package.json
VERSION=$(node -p "require('./package.json').version")
OUTPUT_NAME="SSchedule v$VERSION.ipa"
echo "📦 Detected App Version: $VERSION"

# 2. Build web assets & sync Capacitor
echo "⚙️  Building web assets..."
npm run build

echo "🔄 Syncing with Capacitor..."
npx cap sync ios

# 3. Compile Xcode Project (Unsigned & Free)
echo "🛠️  Compiling Xcode Project (UNSIGNED)..."
cd ios/App
DERIVED=DerivedData
rm -rf "$DERIVED"
xcodebuild -project App.xcodeproj \
           -scheme App \
           -configuration Release \
           -sdk iphoneos \
           -derivedDataPath "$DERIVED" \
           CODE_SIGNING_ALLOWED=NO \
           CODE_SIGNING_REQUIRED=NO \
           CODE_SIGN_IDENTITY="" \
           PROVISIONING_PROFILE_REQUIRED=NO \
           clean build

APP_PATH="$DERIVED/Build/Products/Release-iphoneos/App.app"
echo "📦 App built at: $APP_PATH"
ls -la "$APP_PATH"

# 4. Pack into .ipa structure
echo "📦 Packaging into .ipa archive..."
mkdir -p build/Payload
cp -R "$APP_PATH" build/Payload/
cd build
zip -qr "$OUTPUT_NAME" Payload

# 5. Move to local Downloads folder
echo "🚚 Moving final file to your local Downloads folder..."
mv "$OUTPUT_NAME" ~/Downloads/

# Cleanup temporary build artifacts
cd ..
rm -rf build "$DERIVED"

echo "✅ Build finished: ~/Downloads/$OUTPUT_NAME"
