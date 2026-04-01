#!/bin/bash
set -e

# This script builds the Flux Monitor app, installs it to /Applications, 
# and launches it for testing.

APP_NAME="Flux Monitor"
PROJECT_DIR="$(pwd)"
BUILD_DIR="${PROJECT_DIR}/launcher/build"
APP_DIR="${BUILD_DIR}/Release/${APP_NAME}.app"
DEST_DIR="${HOME}/Applications/${APP_NAME}.app"
# Check for flags
SKIP_BUILD=false
if [[ "$*" == *"--fast"* ]] || [[ "$*" == *"-f"* ]]; then
    SKIP_BUILD=true
fi

if [ "$SKIP_BUILD" = false ]; then
    echo "📦 1. Building the app using bundle.sh..."
    chmod +x ./launcher/bundle.sh
    ./launcher/bundle.sh
else
    echo "⏩ Skipping build step (--fast)..."
fi

echo "🛑 2. Stopping any existing process of ${APP_NAME}..."
# Using pkill to terminate existing app if running
pkill -x "${APP_NAME}" || true

# Also explicitly kill any orphan backend processes that might still be running.
# We search for any 'node' process that is running our specific 'server.js' from the app bundle.
echo "🧹 Cleaning up orphan backend processes..."
pkill -f "node.*/Contents/Resources/server.js" || true

# Also try to kill the process by reading the actual configured port from the config.json
CONFIG_FILE="${HOME}/Library/Application Support/com.ct106.flux-monitor/config.json"
if [ -f "$CONFIG_FILE" ]; then
    PORT=$(grep -o '"port": *[0-9]*' "$CONFIG_FILE" | awk -F': ' '{print $2}' | tr -d ' ,')
    if [ ! -z "$PORT" ]; then
        echo "🚿 Clearing connections on port ${PORT} as specified in config..."
        lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
    fi
fi

# Give it a moment to exit
sleep 1

echo "🚚 3. Copying ${APP_NAME}.app to ${HOME}/Applications..."
mkdir -p "${HOME}/Applications"
if [ -d "${APP_DIR}" ]; then
    rm -rf "${DEST_DIR}"
    cp -R "${APP_DIR}" "${DEST_DIR}"
    echo "✅ Copy complete."
else
    echo "❌ Error: Could not find built app at ${APP_DIR}"
    exit 1
fi

echo "🛡️ 4. Removing existing permissions (quarantine/etc.)..."
# Removing all extended attributes to ensure it runs without "damaged" warnings
xattr -rc "${DEST_DIR}"
# Ensure executable permissions
chmod -R 755 "${DEST_DIR}"

echo "🚀 5. Launching the app..."
# Launch the app from the terminal
open "${DEST_DIR}"

echo "✨ Test cycle complete!"
