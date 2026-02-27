#!/bin/bash

# =========================================================================
# Deploy Script for macOS Integrated Monitor
# Builds the Next.js app in standalone mode and copies it to ~/Applications/monitor
# =========================================================================

set -e

# Default deployment directory
APP_DIR="$HOME/Applications/monitor"

# Try to read from config.json
if [ -f "config.json" ]; then
    # Extract deployPath value from JSON
    CONFIG_PATH=$(grep '"deployPath":' config.json | sed -E 's/.*"deployPath": "(.*)".*/\1/' || echo "")
    if [ ! -z "$CONFIG_PATH" ]; then
        # Expand ~ to $HOME if present
        APP_DIR="${CONFIG_PATH/#\~/$HOME}"
    fi
fi

echo "================================================="
echo "  Deploying macOS Integrated Monitor "
echo "================================================="

# Ensure we are in the correct directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "1. Ensuring config.json exists..."
if [ ! -f "config.json" ]; then
    echo "config.json not found, creating from example..."
    cp config.example.json config.json
else
    echo "config.json already exists."
fi

echo "2. Building the project (Standalone Output)..."
npm run build

echo "3. Preparing deployment directory: $APP_DIR"
mkdir -p "$APP_DIR"

echo "4. Copying standalone runnable files..."
# Copy the standalone server and necessary node_modules
cp -a .next/standalone/. "$APP_DIR/"

# Copy static assets (required for standalone output)
mkdir -p "$APP_DIR/public"
cp -a public/. "$APP_DIR/public/" 2>/dev/null || :

mkdir -p "$APP_DIR/.next/static"
cp -a .next/static/. "$APP_DIR/.next/static/"

# Copy config.json so the API can use it
cp config.json "$APP_DIR/" 2>/dev/null || echo "Warning: config.json not found, skipping."

echo "5. Generating start.sh for LaunchAgent..."
cat << 'EOF' > "$APP_DIR/start.sh"
#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Set path just in case LaunchAgent doesn't have it
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Run the server on port 7000
PORT=7000 node server.js
EOF
chmod +x "$APP_DIR/start.sh"

echo "================================================="
echo "✅ Deployment Successful!"
echo "Runnable files have been copied to: $APP_DIR"
echo ""

# Clean up standalone directory to prevent Next.js turbopack conflicts in dev mode
rm -rf .next/standalone

echo "6. Restarting the application..."
# Kill any existing process on port 7000
EXISTING_PID=$(lsof -t -i:7000 || true)
if [ ! -z "$EXISTING_PID" ]; then
    echo "Stopping existing process on port 7000 (PID: $EXISTING_PID)..."
    kill -9 $EXISTING_PID 2>/dev/null
    sleep 1
fi

echo "Starting new instance via start.sh..."
cd "$APP_DIR"
# Run start.sh in the background and detach
nohup ./start.sh > deploy_run.log 2>&1 &
echo "Application has been restarted automatically! (Running on port 7000)"
echo "Logs are available at: $APP_DIR/deploy_run.log"
echo "================================================="
