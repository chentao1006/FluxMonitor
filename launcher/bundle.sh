#!/bin/bash
set -e

# Auto-detect Project/Scheme
PROJECT="launcher/FluxLauncher.xcodeproj"
BUILD_DIR="launcher/build"
SCRIPTPATH="$( cd "$(dirname "$0")" ; pwd -P )"
if [ ! -d "$PROJECT" ]; then
    echo "Error: $PROJECT not found in $(pwd)"
    exit 1
fi

# 1. Clean and Create result directory
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Use the first scheme found in the project
echo "Scanning for schemes in project..."
SCHEME_NAME=$(xcodebuild -list -project "$PROJECT" | grep -A 5 "Schemes:" | tail -n +2 | grep -v '^-' | head -1 | sed 's/^[[:space:]]*//')
if [ -z "$SCHEME_NAME" ]; then
    echo "Error: No schemes found in $PROJECT"
    exit 1
fi
echo "Using Scheme: $SCHEME_NAME"

# Fetch Build Settings from Xcode
echo "Fetching build settings for $SCHEME_NAME..."
BUILD_SETTINGS=$(xcodebuild -showBuildSettings -project "$PROJECT" -scheme "$SCHEME_NAME" -configuration Release)
APP_NAME=$(echo "$BUILD_SETTINGS" | grep -m1 " PRODUCT_NAME =" | awk -F' = ' '{print $2}')
BUNDLE_ID=$(echo "$BUILD_SETTINGS" | grep -m1 " PRODUCT_BUNDLE_IDENTIFIER =" | awk -F' = ' '{print $2}')
TEAM_ID=$(echo "$BUILD_SETTINGS" | grep -m1 " DEVELOPMENT_TEAM =" | awk -F' = ' '{print $2}')

if [ -z "$APP_NAME" ]; then
    echo "Error: Could not determine APP_NAME from build settings."
    exit 1
fi
echo "App Name: $APP_NAME"
echo "Bundle ID: $BUNDLE_ID"
echo "Team ID: $TEAM_ID"

# Version detection (Priority: Xcode Settings > package.json)
VERSION=$(echo "$BUILD_SETTINGS" | grep -m1 " MARKETING_VERSION =" | awk -F' = ' '{print $2}')
if [ -z "$VERSION" ] || [[ "$VERSION" == *'$(MARKETING_VERSION)'* ]]; then
    VERSION=$(grep '"version":' package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d ' ')
fi

# Auto-detect Identity and Team ID if not provided
if [ -z "$IDENTITY" ]; then
    echo "Scanning for signing identity..."
    # Match the first "Apple Development" identity
    IDENTITY=$(security find-identity -v -p codesigning | grep "Apple Development" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -z "$IDENTITY" ]; then
        echo "Error: No Apple Development identity found. Please set IDENTITY in build.config"
        exit 1
    fi
    echo "Using Identity: $IDENTITY"
    
    # Extract Team ID from identity string, e.g. "Apple Development: Name (TEAMID)"
    if [ -z "$TEAM_ID" ]; then
        TEAM_ID=$(echo "$IDENTITY" | sed -E 's/.*\(([^\)]+)\).*/\1/')
        echo "Detected Team ID: $TEAM_ID"
    fi
fi

# Ensure Next.js standalone is ready
if [ ! -d ".next/standalone" ]; then
    echo "Preparing Next.js standalone build..."
    npm install && npm run build
fi

# Always sync static and public files to standalone to ensure they are up to date
echo "Syncing static and public assets to standalone..."
mkdir -p .next/standalone/.next/static
cp -R .next/static/. .next/standalone/.next/static/
mkdir -p .next/standalone/public
cp -R public/. .next/standalone/public/

# We use the existing Xcode project as the source of truth
#echo "Regenerating Xcode project..."
#cd macos
#xcodegen generate
#cd ..

# Build the app (produces .app directly)
echo "Building project..."
mkdir -p "$BUILD_DIR"
xcodebuild archive \
    -project "$PROJECT" \
    -scheme "$SCHEME_NAME" \
    -configuration Release \
    -archivePath "$BUILD_DIR/$APP_NAME.xcarchive" \
    CODE_SIGN_STYLE=Manual \
    CODE_SIGN_IDENTITY="Developer ID Application" \
    PROVISIONING_PROFILE_SPECIFIER="" \
    AD_HOC_CODE_SIGNING_ALLOWED=YES \
    ENABLE_HARDENED_RUNTIME=YES

xcodebuild -exportArchive \
    -archivePath "$BUILD_DIR/$APP_NAME.xcarchive" \
    -exportPath "$BUILD_DIR/Release" \
    -exportOptionsPlist "launcher/ExportOptions.plist" \
    -allowProvisioningUpdates

# Final App Dir (xcodebuild build puts it in SYMROOT/Release/...)
APP_DIR="$BUILD_DIR/Release/$APP_NAME.app"

# Read version from Info.plist
VERSION=$(defaults read "$(pwd)/$APP_DIR/Contents/Info.plist" CFBundleShortVersionString)
echo "Built $APP_NAME v$VERSION"

# Copy Resources (Next.js, etc.)
echo "Injecting Backend Resources..."
# NODE_BIN=$(which node || echo "/usr/local/bin/node")
# cp "$NODE_BIN" "$APP_DIR/Contents/Resources/node"
cp .next/standalone/server.js "$APP_DIR/Contents/Resources/server.js"

# Use rm -rf then cp to avoid nested directories
rm -rf "$APP_DIR/Contents/Resources/node_modules"
cp -R .next/standalone/node_modules "$APP_DIR/Contents/Resources/node_modules"

rm -rf "$APP_DIR/Contents/Resources/.next"
cp -R .next/standalone/.next "$APP_DIR/Contents/Resources/.next"

rm -rf "$APP_DIR/Contents/Resources/public"
cp -R .next/standalone/public "$APP_DIR/Contents/Resources/public"

if [ -f "config.json" ]; then
    cp config.json "$APP_DIR/Contents/Resources/config.json"
fi

rm -rf "$APP_DIR/Contents/Resources/config.example.json"
cp config.example.json "$APP_DIR/Contents/Resources/config.example.json"

rm -rf "$APP_DIR/Contents/Resources/package.json"
cp package.json "$APP_DIR/Contents/Resources/package.json"


# Sign the app bundle
# IDENTITY is either sourced from build.config or auto-detected above
ENTITLEMENTS="$(pwd)/launcher/FluxLauncher/App.entitlements"
echo "Performing deep signature..."

# 1. 对 $APP_DIR/Contents/Resources 下所有可执行文件单独 codesign
find "$APP_DIR/Contents/Resources" -type f \
    \( -perm +111 -or -name "node" -or -name "server.js" \) | while read exe; do
    echo "Signing resource executable: $exe"
    codesign --force --options runtime --sign "Developer ID Application" --timestamp --entitlements "$ENTITLEMENTS" "$exe"
done

# 2. 最后对整个 $APP_DIR 再 codesign 一次（递归签名）
codesign --force --deep --options runtime --sign "Developer ID Application" --timestamp --entitlements "$ENTITLEMENTS" "$APP_DIR"

# Package into DMG
echo "Packaging into DMG..."

# Detect if we should use localized name for filename (on Chinese systems)
LOCALIZED_NAME="$APP_NAME"
LANGUAGES=$(defaults read -g AppleLanguages)
if [[ "$LANGUAGES" == *"zh-Hans"* ]] && [ -f "launcher/FluxLauncher/zh-Hans.lproj/InfoPlist.strings" ]; then
    ZH_NAME=$(grep "CFBundleDisplayName" "launcher/FluxLauncher/zh-Hans.lproj/InfoPlist.strings" | head -1 | awk -F' = ' '{print $2}' | sed 's/[";]//g')
    if [ ! -z "$ZH_NAME" ]; then
        LOCALIZED_NAME="$ZH_NAME"
        echo "Using Localized Product Name: $LOCALIZED_NAME"
    fi
fi

# Remove spaces from filename for better compatibility
SAFE_APP_NAME=$(echo "$LOCALIZED_NAME" | tr -d ' ')
DMG_NAME="$SAFE_APP_NAME-$VERSION.dmg"
rm -f "$BUILD_DIR/$DMG_NAME"

# Create a temporary staging area for DMG content
STAGING_DIR="$BUILD_DIR/dmg_staging"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

# Copy the app to the staging directory
cp -R "$APP_DIR" "$STAGING_DIR/"

# Create a symbolic link to /Applications
ln -s /Applications "$STAGING_DIR/Applications"

# Create the DMG using the staging directory
hdiutil create -volname "$LOCALIZED_NAME" -srcfolder "$STAGING_DIR" -ov -format UDZO "$BUILD_DIR/$DMG_NAME"

# Clean up staging directory
rm -rf "$STAGING_DIR"

# Sign DMG
echo "Signing DMG..."
codesign --force --sign "$IDENTITY" --timestamp "$BUILD_DIR/$DMG_NAME"

echo "Build complete: $BUILD_DIR/$DMG_NAME"

# GH Release
if [ "$1" == "--release" ]; then
    echo "Uploading to GitHub Release..."
    TAG="v$VERSION"
    gh release create "$TAG" "$BUILD_DIR/$DMG_NAME" --title "$TAG" --notes "Flux Launcher Release $TAG"
fi
