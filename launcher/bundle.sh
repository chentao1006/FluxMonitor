#!/bin/bash
SPARKLE_BIN_PATH="./Sparkle/bin" # Downloaded during build if missing

# --- Parse Arguments ---
SKIP_SIGN=false
DISABLE_TIMESTAMP=${DISABLE_CODE_SIGN_TIMESTAMP:-false}
TIMESTAMP_DISABLED_REASON="requested by --no-timestamp or DISABLE_CODE_SIGN_TIMESTAMP"
for arg in "$@"; do
    if [ "$arg" == "--no-sign" ] || [ "$arg" == "--skip-sign" ]; then
        SKIP_SIGN=true
    elif [ "$arg" == "--no-timestamp" ] || [ "$arg" == "--skip-timestamp" ]; then
        DISABLE_TIMESTAMP=true
        TIMESTAMP_DISABLED_REASON="requested by command line option"
    fi
done

# --- Ensure Sparkle tools exist locally ---
if [ ! -x "${SPARKLE_BIN_PATH}/generate_appcast" ]; then
    echo "⬇️ Sparkle tools not found at ${SPARKLE_BIN_PATH}. Downloading..."
    mkdir -p Sparkle_tmp
    
    # Simple logic to find latest Sparkle release asset (.tar.xz)
    SPARKLE_URL=$(curl -s https://api.github.com/repos/sparkle-project/Sparkle/releases/latest | grep "browser_download_url" | grep "tar.xz" | head -n 1 | cut -d '"' -f 4)
    
    if [ -z "$SPARKLE_URL" ]; then
        echo "❌ Error: Failed to find Sparkle download URL."
        exit 1
    fi
    
    curl -L "$SPARKLE_URL" -o sparkle_dist.tar.xz
    tar -xf sparkle_dist.tar.xz -C Sparkle_tmp
    
    # Move bin to our local Sparkle folder
    mkdir -p Sparkle
    cp -R Sparkle_tmp/bin Sparkle/
    
    # Cleanup
    rm -rf Sparkle_tmp sparkle_dist.tar.xz
    echo "✅ Sparkle tools installed to ./Sparkle/bin"
fi

set -e
set -o pipefail

CODE_SIGN_TIMESTAMP_ARGS=(--timestamp)
XCODE_CODE_SIGN_FLAGS="--timestamp"
if [ "$DISABLE_TIMESTAMP" = true ]; then
    CODE_SIGN_TIMESTAMP_ARGS=(--timestamp=none)
    XCODE_CODE_SIGN_FLAGS="--timestamp=none"
    echo "⏱️ Code signing timestamp is disabled for this build ($TIMESTAMP_DISABLED_REASON)."
fi

# Auto-detect Project/Scheme
PROJECT="launcher/FluxMonitor.xcodeproj"
BUILD_DIR="launcher/build"
SCRIPTPATH="$( cd "$(dirname "$0")" ; pwd -P )"
if [ ! -d "$PROJECT" ]; then
    echo "Error: $PROJECT not found in $(pwd)"
    exit 1
fi

# --- Auto-sync version from package.json to Xcode project ---
VERSION=$(grep '"version":' package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d ' ')
if [ ! -z "$VERSION" ]; then
    echo "🔄 Syncing version $VERSION from package.json to Xcode project..."
    # Update Marketing Version
    sed -i '' "s/MARKETING_VERSION = [0-9.]*;/MARKETING_VERSION = $VERSION;/g" "$PROJECT/project.pbxproj"
    # Update Build Version (e.g., 1.2.9 -> 10209), ensuring higher versions always have higher build numbers
    BUILD_NUMBER=$(echo "$VERSION" | awk -F. '{printf "%d%02d%02d", $1, $2, $3}')
    sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = $BUILD_NUMBER;/g" "$PROJECT/project.pbxproj"
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

# Version is already synced from package.json at the start of the script
echo "Version from package.json: $VERSION"

# Auto-detect Identity and Team ID if not provided
if [ "$SKIP_SIGN" = false ] && [ -z "$IDENTITY" ]; then
    echo "Scanning for signing identity..."
    # Match the first "Developer ID Application" identity for distribution
    IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -z "$IDENTITY" ]; then
        # Fallback to Apple Development if not found (though notarization will fail)
        IDENTITY=$(security find-identity -v -p codesigning | grep "Apple Development" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
    fi
    
    if [ -z "$IDENTITY" ]; then
        echo "Error: No signing identity found."
        exit 1
    fi
    echo "Using Identity: $IDENTITY"
    
    # Extract Team ID from identity string if not provided, e.g. "Developer ID Application: Name (TEAMID)"
    if [ -z "$TEAM_ID" ]; then
        TEAM_ID=$(echo "$IDENTITY" | sed -E 's/.*\(([^\)]+)\).*/\1/')
        echo "Detected Team ID: $TEAM_ID"
    fi
fi

# Ensure Next.js standalone is ready
if [ ! -d ".next/standalone" ]; then
    echo "Preparing Next.js standalone build..."
    NEXT_TELEMETRY_DISABLED=1 npm install && NEXT_TELEMETRY_DISABLED=1 npm run build
fi

# Always sync static and public files to standalone to ensure they are up to date
echo "Syncing static and public assets to standalone..."
mkdir -p .next/standalone/.next/static
cp -R .next/static/. .next/standalone/.next/static/
# Skip public if it doesn't exist yet (though it should)
if [ -d "public" ]; then
    mkdir -p .next/standalone/public
    cp -R public/. .next/standalone/public/
fi

# Build the app (produces .app directly)
echo "Building project..."
mkdir -p "$BUILD_DIR"
ARCHIVE_LOG="$BUILD_DIR/archive.log"
if ! xcodebuild archive \
    -project "$PROJECT" \
    -scheme "$SCHEME_NAME" \
    -configuration Release \
    -archivePath "$BUILD_DIR/$APP_NAME.xcarchive" \
    ARCHS="arm64 x86_64" \
    ONLY_ACTIVE_ARCH=NO \
    CODE_SIGN_STYLE=Automatic \
    -allowProvisioningUpdates \
    AD_HOC_CODE_SIGNING_ALLOWED=YES \
    ENABLE_HARDENED_RUNTIME=YES \
    OTHER_CODE_SIGN_FLAGS="$XCODE_CODE_SIGN_FLAGS" 2>&1 | tee "$ARCHIVE_LOG"; then
    if [ "$DISABLE_TIMESTAMP" != true ] && grep -qi "timestamp service is not available" "$ARCHIVE_LOG"; then
        echo "⚠️ Apple timestamp service is unavailable during archive. Retrying archive without timestamp..."
        DISABLE_TIMESTAMP=true
        TIMESTAMP_DISABLED_REASON="archive code signing failed to get an Apple timestamp"
        CODE_SIGN_TIMESTAMP_ARGS=(--timestamp=none)
        XCODE_CODE_SIGN_FLAGS="--timestamp=none"
        rm -rf "$BUILD_DIR/$APP_NAME.xcarchive"
        xcodebuild archive \
            -project "$PROJECT" \
            -scheme "$SCHEME_NAME" \
            -configuration Release \
            -archivePath "$BUILD_DIR/$APP_NAME.xcarchive" \
            ARCHS="arm64 x86_64" \
            ONLY_ACTIVE_ARCH=NO \
            CODE_SIGN_STYLE=Automatic \
            -allowProvisioningUpdates \
            AD_HOC_CODE_SIGNING_ALLOWED=YES \
            ENABLE_HARDENED_RUNTIME=YES \
            OTHER_CODE_SIGN_FLAGS="$XCODE_CODE_SIGN_FLAGS"
    else
        exit 1
    fi
fi

EXPORT_LOG="$BUILD_DIR/exportArchive.log"
if ! xcodebuild -exportArchive \
    -archivePath "$BUILD_DIR/$APP_NAME.xcarchive" \
    -exportPath "$BUILD_DIR/Release" \
    -exportOptionsPlist "launcher/ExportOptions.plist" \
    -allowProvisioningUpdates \
    OTHER_CODE_SIGN_FLAGS="$XCODE_CODE_SIGN_FLAGS" 2>&1 | tee "$EXPORT_LOG"; then
    if [ "$DISABLE_TIMESTAMP" != true ] && grep -qi "timestamp service is not available" "$EXPORT_LOG"; then
        echo "⚠️ Apple timestamp service is unavailable. Retrying export without timestamp..."
        DISABLE_TIMESTAMP=true
        TIMESTAMP_DISABLED_REASON="export code signing failed to get an Apple timestamp"
        CODE_SIGN_TIMESTAMP_ARGS=(--timestamp=none)
        XCODE_CODE_SIGN_FLAGS="--timestamp=none"
        rm -rf "$BUILD_DIR/Release"
        if ! xcodebuild -exportArchive \
            -archivePath "$BUILD_DIR/$APP_NAME.xcarchive" \
            -exportPath "$BUILD_DIR/Release" \
            -exportOptionsPlist "launcher/ExportOptions.plist" \
            -allowProvisioningUpdates \
            OTHER_CODE_SIGN_FLAGS="$XCODE_CODE_SIGN_FLAGS"; then
            echo "⚠️ Export without timestamp still failed. Copying app from archive and continuing with script signing..."
            mkdir -p "$BUILD_DIR/Release"
            cp -R "$BUILD_DIR/$APP_NAME.xcarchive/Products/Applications/$APP_NAME.app" "$BUILD_DIR/Release/"
        fi
    else
        exit 1
    fi
fi

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

if [ -d ".next/standalone/public" ]; then
    rm -rf "$APP_DIR/Contents/Resources/public"
    cp -R .next/standalone/public "$APP_DIR/Contents/Resources/public"
fi

# Runtime credentials live in Application Support and are created by onboarding.
# The standalone trace / Xcode resource sync may have copied the development
# config already, so remove it even when this build does not explicitly copy it.
rm -f "$APP_DIR/Contents/Resources/config.json"

rm -rf "$APP_DIR/Contents/Resources/config.example.json"
cp config.example.json "$APP_DIR/Contents/Resources/config.example.json"

rm -rf "$APP_DIR/Contents/Resources/package.json"
cp package.json "$APP_DIR/Contents/Resources/package.json"

if [ -f "analytics.json" ]; then
    cp analytics.json "$APP_DIR/Contents/Resources/analytics.json"
fi


# Sign the app bundle
# IDENTITY is either sourced from build.config or auto-detected above
if [ "$SKIP_SIGN" = false ]; then
    echo "Performing deep signature..."
    
    # --- CRITICAL FOR iCLOUD: Extract full entitlements from the exported app ---
    # This ensures we keep application-identifier and other keys added by Xcode/Provisioning Profile
    TEMP_ENTITLEMENTS="/tmp/app_entitlements_$(date +%s).plist"
    codesign -d --entitlements :- "$APP_DIR" > "$TEMP_ENTITLEMENTS"
    echo "Extracted full entitlements for re-signing."
    
    # First, sign any injected frameworks or binaries in node_modules
    find "$APP_DIR/Contents/Resources/node_modules" -name "*.node" -o -name "*.dylib" -o -name "*.sh" | while read -r lib; do
        echo "Signing injected library: $lib"
        codesign --force --options runtime "${CODE_SIGN_TIMESTAMP_ARGS[@]}" --sign "$IDENTITY" "$lib"
    done
    
    # Then sign Sparkle framework if it exists
    if [ -d "$APP_DIR/Contents/Frameworks/Sparkle.framework" ]; then
        echo "Signing Sparkle Framework..."
        # Sign nested components first
        find "$APP_DIR/Contents/Frameworks/Sparkle.framework" -type f \( -perm -u+x -o -name "*.dylib" \) | while read -r binary; do
            codesign --force --options runtime "${CODE_SIGN_TIMESTAMP_ARGS[@]}" --sign "$IDENTITY" "$binary"
        done
        codesign --force --options runtime "${CODE_SIGN_TIMESTAMP_ARGS[@]}" --sign "$IDENTITY" "$APP_DIR/Contents/Frameworks/Sparkle.framework"
    fi
    
    # Finally sign the main app bundle using the EXTRACTED entitlements
    echo "Finalizing app signature with preserved entitlements..."
    codesign --force --options runtime --entitlements "$TEMP_ENTITLEMENTS" "${CODE_SIGN_TIMESTAMP_ARGS[@]}" --sign "$IDENTITY" "$APP_DIR"
    
    # Cleanup temp entitlements
    rm -f "$TEMP_ENTITLEMENTS"
else
    echo "⏩ Skipping codesigning (--no-sign)..."
fi


# Package into DMG
if [ "$SKIP_SIGN" = false ]; then
    echo "Packaging into DMG..."
    
    # Detect if we should use localized name for filename (on Chinese systems)
    LOCALIZED_NAME="$APP_NAME"
    LANGUAGES=$(defaults read -g AppleLanguages)
    if [[ "$LANGUAGES" == *"zh-Hans"* ]] && [ -f "launcher/FluxMonitor/zh-Hans.lproj/InfoPlist.strings" ]; then
        ZH_NAME=$(grep "CFBundleDisplayName" "launcher/FluxMonitor/zh-Hans.lproj/InfoPlist.strings" | head -1 | awk -F' = ' '{print $2}' | sed 's/[";]//g')
        if [ ! -z "$ZH_NAME" ]; then
            LOCALIZED_NAME="$ZH_NAME"
            echo "Using Localized Product Name: $LOCALIZED_NAME"
        fi
    fi
    
    # Use English name for filename (without version number)
    SAFE_APP_NAME=$(echo "$APP_NAME" | tr -d ' ')
    DMG_NAME="$SAFE_APP_NAME.dmg"
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
    hdiutil create -volname "$APP_NAME" -srcfolder "$STAGING_DIR" -ov -format UDZO "$BUILD_DIR/$DMG_NAME"
    
    # Sign the DMG
    echo "Signing DMG..."
    codesign --force --sign "$IDENTITY" "$BUILD_DIR/$DMG_NAME"
    
    # Clean up staging directory
    rm -rf "$STAGING_DIR"
    
    echo "Build complete: $BUILD_DIR/$DMG_NAME"
    
    
    # 4. Notarize DMG if credentials provided
    echo "4. Checking for notarization credentials..."
    DMG_PATH=$(ls $BUILD_DIR/*.dmg | head -1)
    # Use the detected TEAM_ID or fall back if not set
    if [ -z "$TEAM_ID" ]; then
        TEAM_ID="U2NEAJ73J2"
    fi
    if [ "$DISABLE_TIMESTAMP" = true ]; then
        echo "⚠️ Notarization skipped because code signing timestamp is disabled ($TIMESTAMP_DISABLED_REASON)."
        echo "For a public release, rerun when Apple's timestamp service is available."
    elif [ -n "$APPLE_ID" ] && [ -n "$APPLE_PASSWORD" ]; then
        echo "🔐 Submitting for notarization..."
        xcrun notarytool submit "${DMG_PATH}" \
            --apple-id "${APPLE_ID}" \
            --password "${APPLE_PASSWORD}" \
            --team-id "${TEAM_ID}" \
            --wait
    
        echo "🖋️ Stapling notarization ticket..."
        xcrun stapler staple "${DMG_PATH}"
        
        echo "✅ Notarization and stapling complete!"
    else
        echo "⚠️ Notarization skipped because APPLE_ID and APPLE_PASSWORD are not set."
        echo "Please set them to ensure the DMG runs directly on other users' Macs."
    fi
else
    echo "⏩ Skipping DMG packaging and notarization (--no-sign)..."
fi


# 6. Generate Sparkle Appcast (Now automated)
if [ "$SKIP_SIGN" = false ]; then
    if [ -x "${SPARKLE_BIN_PATH}/generate_appcast" ]; then
        echo "📡 Generating Sparkle appcast to project root..."
        # Use version-specific GitHub download prefix for this new release
        DOWNLOAD_PREFIX="https://github.com/chentao1006/FluxMonitor/releases/download/v$VERSION/"
        
        # We point generate_appcast to the BUILD_DIR where DMG resides, and output to project root
        # This will be available at https://flux.ct106.com/appcast.xml via GitHub Pages
        "${SPARKLE_BIN_PATH}/generate_appcast" --download-url-prefix "$DOWNLOAD_PREFIX" -o appcast.xml "${BUILD_DIR}"
        
        echo "✅ appcast.xml generated."
    else
        echo "❌ Sparkle generate_appcast tool still missing at ${SPARKLE_BIN_PATH}."
        exit 1
    fi
else
    echo "⏩ Skipping appcast generation (--no-sign)..."
fi
