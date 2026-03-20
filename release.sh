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
echo "You can find the DMG in: launcher/build/"

# 4. Notarize DMG if credentials provided
echo "4. Checking for notarization credentials..."
DMG_PATH=$(ls launcher/build/*.dmg | head -1)
TEAM_ID="U2NEAJ73J2"
if [ -n "$APPLE_ID" ] && [ -n "$APPLE_PASSWORD" ]; then
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
