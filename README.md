# Flux Monitor

**English** | [简体中文](README_zh.md)

---

A system monitoring and remote control dashboard designed for **your Mac**.

**macOS Launcher:** 

[![Download on macOS](https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/chentao1006/FluxMonitor/releases/latest/download/FluxMonitor.dmg)

```bash
brew install --cask chentao1006/tap/flux-monitor
```

**Mobile Clients:** 

[![Download on the App Store](public/app-store-badge-en.svg)](https://apps.apple.com/app/flux-remote/id6761290185)
[![Get it on Google Play](public/en-play-badge.png)](https://play.google.com/store/apps/details?id=com.ct106.flux_remote)


### Features

- **System Monitor**: Display CPU, memory, disk, and network usage, run terminal commands.
- **Process Management**: View running processes and monitor resource consumption.
- **Port Manager**: Inspect listening and active ports, trace owning processes, and release occupied ports.
- **Firewall**: Allow or block inbound ports by source address (CIDR) with ordered macOS PF rules, and turn the firewall on or off in one click. Rules survive reboots, and outbound replies are never blocked.
- **Log Analysis**: Browse system logs.
- **Configuration Management**: Edit system configuration files.
- **LaunchAgent**: Manage macOS LaunchAgents and LaunchDaemons.
- **Docker**: Manage containers and images.
- **Nginx**: Manage sites and global configurations.
- **Optional AI Assistant**: Connect an OpenAI API key for log parsing, configuration auditing, and troubleshooting suggestions.
- **Public Access (InstaTunnel)**: Expose your local monitor to the public internet securely with a single click, no account or complex config needed.

---

## Planned Features

- [x] **Mac Launcher App**: A native macOS application that starts the monitor service. No need to deploy manually.
- [x] **iOS Client App**: A native iOS application that can monitor and manage the system on the go. ([App Store](https://apps.apple.com/app/flux-remote/id6761290185))
- [x] **Android Client App**: A native Android application that can monitor and manage the system on the go. ([Google Play](https://play.google.com/store/apps/details?id=com.ct106.flux_remote))

---

## Screenshots

![Screenshot 1](screenshots/en/000001.jpg)
![Screenshot 2](screenshots/en/000002.jpg)
![Screenshot 3](screenshots/en/000003.jpg)
![Screenshot 4](screenshots/en/000004.jpg)
![Screenshot 5](screenshots/en/000005.jpg)
![Screenshot 6](screenshots/en/000006.jpg)
![Screenshot 7](screenshots/en/000007.jpg)
![Screenshot 8](screenshots/en/000008.jpg)
![Screenshot 9](screenshots/en/000009.jpg)

## Installation & Setup

### 1. macOS Launcher
The easiest way to use Flux Monitor on macOS is by downloading the application. This starts the local monitor service and provides a menu bar icon.

[![Download on macOS](https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/chentao1006/FluxMonitor/releases/latest/download/FluxMonitor.dmg)

- **Install**: Drag **Flux Monitor** to your **Applications** folder.
- **Launch**: Open the app to start the monitoring dashboard.

#### Homebrew Cask
You can also install the macOS launcher with Homebrew:

```bash
brew install --cask chentao1006/tap/flux-monitor
```

Or tap the repository first:

```bash
brew tap chentao1006/tap
brew install --cask flux-monitor
```

### 2. Mobile Clients (iOS & Android)
Remotely connect to, monitor, and control your Mac from anywhere using your smartphone or tablet.

[![Download on the App Store](public/app-store-badge-en.svg)](https://apps.apple.com/app/flux-remote/id6761290185)
[![Get it on Google Play](public/en-play-badge.png)](https://play.google.com/store/apps/details?id=com.ct106.flux_remote)


---

## Getting Started (Development / Source)

1. **Install**:
   ```bash
   npm install
   ```

2. **Run**:
   ```bash
   npm run dev
   ```

3. **AI Configuration (Optional)**:
   To use the optional AI-assisted features, configure your OpenAI API Key and endpoint in `config.json` or through the dashboard Settings page.

## Deployment

This project provides a deploy script `deploy.sh`. It builds the Next.js application as a standalone app and installs it to the specified directory (default: `~/Applications/flux-monitor`).

```bash
# Grant execution permissions and deploy
chmod +x deploy.sh
./deploy.sh
```

**Notes:**
- You can change the deployment folder by editing the `"deploy.path"` key in `config.json`.
- After deployment, the script uses `start.sh` to run the app in the background on the configured port (default `4210`).

## Firewall Setup (Optional)

The **Firewall** page manages macOS PF through a small privileged component, which needs one-time administrator approval to install. Choose whichever is convenient:

- **Launcher (recommended)**: On first run, click **Enable firewall management**, or later open the **Components** tab and turn on **Firewall management**. Approve the macOS prompt once; after that the dashboard works remotely without further prompts.
- **Dashboard**: If the component is missing, the Firewall page shows an **Install component** button. The approval prompt appears on the Mac running Flux Monitor, not in your browser.
- **Not needed?** Click **Not now** in the launcher, or turn the switch off on the **Components** tab. The Firewall module is hidden from the dashboard (`features.firewall: false`) and you are not asked again. The launcher and the dashboard's module toggle stay in sync.

Turning firewall management off only hides the module; rules that are already applied stay active. To remove them, use **Uninstall component** on the **Components** tab (saved rules are kept and restored if you reinstall).

Once installed, use **Turn on firewall** / **Turn off firewall** at the top of the Firewall page, and edit inbound rules below it. Rules are matched top-down, first match wins.

### What gets installed

Installation places the helper at `/Library/PrivilegedHelperTools/com.ct106.flux-monitor-pf`, adds a scoped sudoers rule in `/etc/sudoers.d/com_ct106_flux_monitor_pf`, and registers a LaunchDaemon that restores saved rules after reboot. For every blocked inbound port and peer set, the helper also installs a non-quick `pass out ... keep state` rule so replies to outbound connections initiated by your Mac are not blocked.

### Manual setup from the command line

Useful over SSH or for scripted installs. The component is granted to the user who runs `sudo` (or the one passed with `--user`), which must be the account running Flux Monitor.

From a source checkout:

```bash
sudo ./scripts/pf/setup.sh install
```

From a `deploy.sh` installation:

```bash
sudo ~/Applications/flux-monitor/pf/setup.sh install
```

From the installed macOS app bundle:

```bash
sudo "/Applications/Flux Monitor.app/Contents/Resources/pf/setup.sh" install
```

To prevent rules from blocking your SSH and panel ports from a management address, pass all three lockout options during install (or pass `--clear-management` on reinstall to remove lockout protection):

```bash
sudo ./scripts/pf/setup.sh install \
  --management-address 192.0.2.10 \
  --ssh-port 22 \
  --panel-port 4210
```

Inspect or remove the installation:

```bash
sudo ./scripts/pf/setup.sh status
sudo ./scripts/pf/setup.sh uninstall
sudo ./scripts/pf/setup.sh uninstall --purge
```

Use `--purge` to delete saved policy files under `/var/db/com.ct106.flux-monitor-pf`.

## Configuration (`config.json`)

The system uses `config.json` for global settings. You can copy `config.example.json` to create one if it doesn't exist.

```json
{
  "users": [
    {
      "username": "admin",
      "password": "password123"
    }
  ],
  "jwtSecret": "CHANGE_ME",
  "ai": {
    "url": "https://api.openai.com/v1",
    "key": "",
    "model": "gpt-4o-mini"
  },
  "features": {
    "monitor": true,
    "processes": true,
    "ports": true,
    "firewall": true,
    "logs": true,
    "configs": true,
    "launchagent": true,
    "docker": true,
    "nginx": true
  },
  "deploy": {
    "path": "~/Applications/flux-monitor",
    "port": 4210
  }
}
```

---

© 2026 Flux Monitor.
