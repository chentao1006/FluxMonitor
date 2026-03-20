#!/bin/bash
set -e

# =========================================================================
# Release Script for Flux Monitor
# 1. Builds the Next.js frontend in standalone mode
# 2. Bundles the results into the macOS Launcher application
# 3. Packages the result into a DMG
# =========================================================================

echo "================================================="
echo "  🚀 Starting Flux Release Process"
echo "================================================="

# Force a clean standalone build to ensure all latest changes are included
echo "1. Cleaning up old build artifacts..."
rm -rf .next/standalone

echo "2. Building Next.js project..."
npm install
npm run build

echo "3. Bundling macOS application..."
# Forward all arguments (like --release) to the bundle script
./launcher/bundle.sh "$@"

echo "✅ Bundle process finished successfully!"
echo "================================================="
echo "  🚀 Starting Git Operations & GitHub Release"
echo "================================================="

# 1. Extract Version and Build Information
# Find the built .app to get version info
APP_PATH=$(ls -d launcher/build/Release/*.app 2>/dev/null | head -1)
if [ -z "$APP_PATH" ]; then
    echo "❌ Error: Could not find the built application in launcher/build/Release/"
    exit 1
fi

NEW_VERSION=$(defaults read "$(pwd)/$APP_PATH/Contents/Info.plist" CFBundleShortVersionString)
NEW_BUILD=$(defaults read "$(pwd)/$APP_PATH/Contents/Info.plist" CFBundleVersion)

echo "📦 Version: $NEW_VERSION (Build $NEW_BUILD)"

# 2. Git Operations
echo "📂 Committing and tagging..."
git add .
git commit -m "chore: release version $NEW_VERSION (build $NEW_BUILD)"
git tag "v$NEW_VERSION" -a -m "Release v$NEW_VERSION"

echo "📦 Code committed and tagged locally."

# 3. Push to Repository
BRANCH=$(git symbolic-ref --short HEAD)
echo "📡 Pushing to branch $BRANCH and tags..."
git push origin "$BRANCH"
git push origin "v$NEW_VERSION"

# 4. GitHub Release
RESULT_DIR="launcher/build"
DMG_PATH=$(ls "$RESULT_DIR"/*.dmg 2>/dev/null | head -1)

if command -v gh >/dev/null 2>&1; then
    echo "📡 Creating GitHub Release and uploading assets..."
    
    if [ -z "$DMG_PATH" ]; then
        echo "❌ Error: Could not find any DMG in $RESULT_DIR to upload."
        exit 1
    fi
    
    echo "Uploading asset: $DMG_PATH"
    
    # We also check for appcast.xml if it exists (for Sparkle updates)
    ASSETS=("$DMG_PATH")
    if [ -f "launcher/appcast.xml" ]; then
        ASSETS+=("launcher/appcast.xml")
        echo "Including asset: appcast.xml"
    fi

    gh release create "v$NEW_VERSION" \
        "${ASSETS[@]}" \
        --title "Release v$NEW_VERSION" \
        --notes "Automatic local release of version $NEW_VERSION"
    
    if [ $? -eq 0 ]; then
        echo "🎉 Release completed successfully!"
    else
        echo "❌ Error: GitHub Release failed to create. Please check the error above."
    fi
else
    echo "⚠️  Note: GitHub CLI (gh) not found or not authenticated. Please upload $DMG_PATH and appcast.xml manually to the GitHub release page."
fi
