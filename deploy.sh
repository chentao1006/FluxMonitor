#!/bin/bash

# =========================================================================
# Deploy Script for macOS Integrated Monitor
# Builds the Next.js app in standalone mode and copies it to ~/Applications/monitor
# =========================================================================

set -e

# Default deployment directory
APP_DIR="$HOME/Applications/monitor"
APP_PORT=7000

# Try to read from config.json
if [ -f "config.json" ]; then
    NODE_PATH=$(which node || echo "node")
    
    # Extract deploy path value using node
    CONFIG_PATH=$($NODE_PATH -e "try { console.log(require('./config.json').deploy?.path || require('./config.json').deployPath || '') } catch(e) {}" 2>/dev/null)
    if [ ! -z "$CONFIG_PATH" ]; then
        # Expand ~ to $HOME if present
        APP_DIR="${CONFIG_PATH/#\~/$HOME}"
    fi

    # Extract port value using node
    CONFIG_PORT=$($NODE_PATH -e "try { console.log(require('./config.json').deploy?.port || require('./config.json').port || '') } catch(e) {}" 2>/dev/null)
    if [ ! -z "$CONFIG_PORT" ]; then
        APP_PORT="$CONFIG_PORT"
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

echo "4. Backing up existing config.json (if any)..."
HAS_BACKUP=0
if [ -f "$APP_DIR/config.json" ]; then
    cp "$APP_DIR/config.json" "/tmp/monitor_config_backup.json"
    HAS_BACKUP=1
fi

echo "5. Copying standalone runnable files..."
# Copy the standalone server and necessary node_modules
cp -a .next/standalone/. "$APP_DIR/"

# Copy static assets (required for standalone output)
mkdir -p "$APP_DIR/public"
cp -a public/. "$APP_DIR/public/" 2>/dev/null || :

mkdir -p "$APP_DIR/.next/static"
cp -a .next/static/. "$APP_DIR/.next/static/"

echo "6. Restoring config.json..."
if [ "$HAS_BACKUP" = "1" ]; then
    echo "Restored existing config.json to protect destination config."
    cp "/tmp/monitor_config_backup.json" "$APP_DIR/config.json"
else
    if [ ! -f "$APP_DIR/config.json" ]; then
        echo "config.json not found in target, copying from example..."
        cp config.example.json "$APP_DIR/config.json"
    fi
fi

echo "7. Generating start.sh for LaunchAgent..."
NODE_PATH=$(which node || echo "node")
cat << EOF > "$APP_DIR/start.sh"
#!/bin/bash
DIR="\$( cd "\$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
cd "\$DIR"

# Set path just in case LaunchAgent doesn't have it
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:\$PATH"

# Run the server on the configured port
PORT=$APP_PORT $NODE_PATH server.js
EOF
chmod +x "$APP_DIR/start.sh"

echo "================================================="
echo "✅ Deployment Successful!"
echo "Runnable files have been copied to: $APP_DIR"
echo ""

# Clean up standalone directory to prevent Next.js turbopack conflicts in dev mode
rm -rf .next/standalone

echo "8. Restarting the application..."
# Kill any existing process on the configured port
EXISTING_PID=$(lsof -t -i:$APP_PORT || true)
if [ ! -z "$EXISTING_PID" ]; then
    echo "Stopping existing process on port $APP_PORT (PID: $EXISTING_PID)..."
    kill -9 $EXISTING_PID 2>/dev/null
    sleep 1
fi

echo "Starting new instance via start.sh..."
cd "$APP_DIR"
# Run start.sh in the background and detach
nohup ./start.sh > deploy_run.log 2>&1 &
echo "Application has been restarted automatically! (Running on port $APP_PORT)"
echo "Logs are available at: $APP_DIR/deploy_run.log"
echo "================================================="
