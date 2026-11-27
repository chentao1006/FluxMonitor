#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_SRC="${SCRIPT_DIR}/fluxmonitor-pf"
HELPER_DST="/Library/PrivilegedHelperTools/com.ct106.flux-monitor-pf"
PLIST_LABEL="com.ct106.flux-monitor-pf"
PLIST_DST="/Library/LaunchDaemons/${PLIST_LABEL}.plist"
LOG_PATH="/var/log/${PLIST_LABEL}.log"
SUDOERS_DST="/etc/sudoers.d/com_ct106_flux_monitor_pf"
DATA_DIR="/var/db/${PLIST_LABEL}"
MGMT_FILE="${DATA_DIR}/management.json"
TOKEN_FILE="/var/run/${PLIST_LABEL}.token"
ANCHOR="com.apple/000.ct106.flux-monitor"

COMMAND=""
OPT_USER=""
MGMT_ADDR=""
SSH_PORT=""
PANEL_PORT=""
CLEAR_MGMT=0
PURGE=0
TEMP_FILES=()

cleanup() {
    local f
    for f in "${TEMP_FILES[@]:-}"; do
        if [[ -n "${f}" && -e "${f}" ]]; then
            rm -f "${f}"
        fi
    done
}
trap cleanup EXIT

usage() {
    cat <<'USAGE'
Usage: setup.sh <install|uninstall|status> [options]

Commands:
  install     Install the PF helper, sudoers rule, and LaunchDaemon (requires root).
  uninstall   Remove the LaunchDaemon, sudoers rule, PF anchor rules, and helper (requires root).
  status      Inspect helper installation, sudoers, LaunchDaemon, and PF anchor state.

Options:
  --user <username>             Local macOS user running FluxMonitor (defaults to $SUDO_USER).
  --management-address <ip>     Optional lockout protection IP (requires --ssh-port and --panel-port).
  --ssh-port <port>             SSH port protected alongside --management-address.
  --panel-port <port>           FluxMonitor port protected alongside --management-address.
  --clear-management            With install, remove any existing management.json lockout file.
  --purge                       With uninstall, also remove saved policy state in /var/db.
  -h, --help                    Show this help message.
USAGE
}

require_value() {
    if [[ $# -lt 2 || -z "${2}" ]]; then
        echo "Error: option ${1} requires a value." >&2
        exit 2
    fi
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        install|uninstall|status)
            if [[ -n "${COMMAND}" ]]; then
                echo "Error: multiple commands specified." >&2
                exit 2
            fi
            COMMAND="$1"
            shift
            ;;
        --user)
            require_value "$@"
            OPT_USER="$2"
            shift 2
            ;;
        --management-address)
            require_value "$@"
            MGMT_ADDR="$2"
            shift 2
            ;;
        --ssh-port)
            require_value "$@"
            SSH_PORT="$2"
            shift 2
            ;;
        --panel-port)
            require_value "$@"
            PANEL_PORT="$2"
            shift 2
            ;;
        --clear-management)
            CLEAR_MGMT=1
            shift
            ;;
        --purge)
            PURGE=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: unknown argument: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ -z "${COMMAND}" ]]; then
    usage >&2
    exit 2
fi

require_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        echo "Error: ${COMMAND} must be run as root (use sudo)." >&2
        exit 1
    fi
}

do_install() {
    require_root
    if [[ "${PURGE}" -eq 1 ]]; then
        echo "Error: --purge is only valid with uninstall." >&2
        exit 2
    fi
    if [[ ! -f "${HELPER_SRC}" ]]; then
        echo "Error: bundled helper not found at ${HELPER_SRC}" >&2
        exit 1
    fi
    if ! /usr/bin/python3 -I -c "import ipaddress, json" >/dev/null 2>&1; then
        echo "Error: /usr/bin/python3 is unavailable. Install Xcode Command Line Tools (xcode-select --install) first." >&2
        exit 1
    fi

    local target_user="${OPT_USER:-${SUDO_USER:-}}"
    if [[ -z "${target_user}" || "${target_user}" == "root" ]]; then
        echo "Error: specify the non-root macOS user running FluxMonitor with --user <username> or run via sudo." >&2
        exit 1
    fi
    if [[ ! "${target_user}" =~ ^[a-zA-Z0-9._-]+$ ]] || ! id -u "${target_user}" >/dev/null 2>&1; then
        echo "Error: invalid local user: ${target_user}" >&2
        exit 1
    fi

    local mgmt_json=""
    if [[ "${CLEAR_MGMT}" -eq 1 && ( -n "${MGMT_ADDR}" || -n "${SSH_PORT}" || -n "${PANEL_PORT}" ) ]]; then
        echo "Error: --clear-management cannot be combined with --management-address, --ssh-port, or --panel-port." >&2
        exit 2
    fi
    if [[ -n "${MGMT_ADDR}" || -n "${SSH_PORT}" || -n "${PANEL_PORT}" ]]; then
        if [[ -z "${MGMT_ADDR}" || -z "${SSH_PORT}" || -z "${PANEL_PORT}" ]]; then
            echo "Error: --management-address, --ssh-port, and --panel-port must all be provided together." >&2
            exit 2
        fi
        mgmt_json="$(/usr/bin/python3 -I - "${MGMT_ADDR}" "${SSH_PORT}" "${PANEL_PORT}" <<'PY'
import ipaddress
import json
import re
import sys

raw_addr, raw_ssh, raw_panel = sys.argv[1], sys.argv[2], sys.argv[3]
if "%" in raw_addr:
    text, zone = raw_addr.split("%", 1)
    if not zone or ":" not in text or not re.fullmatch(r"[A-Za-z0-9_.-]+", zone):
        raise SystemExit("Error: invalid --management-address.")
else:
    text = raw_addr
try:
    ip = ipaddress.ip_address(text)
except ValueError:
    raise SystemExit("Error: invalid --management-address.")
if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
    ip = ip.ipv4_mapped

def parse_port(val, flag):
    if not val.isdecimal():
        raise SystemExit(f"Error: invalid {flag}.")
    num = int(val)
    if not 1 <= num <= 65535:
        raise SystemExit(f"Error: {flag} must be between 1 and 65535.")
    return num

payload = {
    "address": str(ip),
    "sshPort": parse_port(raw_ssh, "--ssh-port"),
    "panelPort": parse_port(raw_panel, "--panel-port"),
}
print(json.dumps(payload, indent=2))
PY
)"
    fi

    install -d -o root -g wheel -m 0755 "/Library/PrivilegedHelperTools"
    install -o root -g wheel -m 0755 "${HELPER_SRC}" "${HELPER_DST}"

    install -d -o root -g wheel -m 0700 "${DATA_DIR}"
    chown root:wheel "${DATA_DIR}"
    chmod 0700 "${DATA_DIR}"

    if [[ "${CLEAR_MGMT}" -eq 1 ]]; then
        rm -f "${MGMT_FILE}"
    elif [[ -n "${mgmt_json}" ]]; then
        local tmp_mgmt
        tmp_mgmt="$(mktemp "${DATA_DIR}/management.json.XXXXXX")"
        TEMP_FILES+=("${tmp_mgmt}")
        printf '%s\n' "${mgmt_json}" > "${tmp_mgmt}"
        chown root:wheel "${tmp_mgmt}"
        chmod 0600 "${tmp_mgmt}"
        mv "${tmp_mgmt}" "${MGMT_FILE}"
    fi

    install -d -o root -g wheel -m 0750 "/etc/sudoers.d"
    local tmp_sudoers
    tmp_sudoers="$(mktemp "/etc/sudoers.d/.com_ct106_flux_monitor_pf.XXXXXX")"
    TEMP_FILES+=("${tmp_sudoers}")
    printf '%s ALL=(root) NOPASSWD: NOSETENV: %s ""\n' "${target_user}" "${HELPER_DST}" > "${tmp_sudoers}"
    /usr/sbin/visudo -cf "${tmp_sudoers}" >/dev/null
    chown root:wheel "${tmp_sudoers}"
    chmod 0440 "${tmp_sudoers}"
    mv "${tmp_sudoers}" "${SUDOERS_DST}"

    local tmp_plist
    tmp_plist="$(mktemp "/Library/LaunchDaemons/.${PLIST_LABEL}.plist.XXXXXX")"
    TEMP_FILES+=("${tmp_plist}")
    cat <<PLIST > "${tmp_plist}"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${HELPER_DST}</string>
    <string>--restore</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>WatchPaths</key>
  <array>
    <string>/Library/Preferences/SystemConfiguration/NetworkInterfaces.plist</string>
    <string>/var/run/resolv.conf</string>
  </array>
  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>
</dict>
</plist>
PLIST
    chown root:wheel "${tmp_plist}"
    chmod 0644 "${tmp_plist}"
    mv "${tmp_plist}" "${PLIST_DST}"

    /bin/launchctl bootout "system/${PLIST_LABEL}" 2>/dev/null || true
    "${HELPER_DST}" --restore
    /bin/launchctl bootstrap system "${PLIST_DST}"

    if [[ -r "/etc/sudoers" ]] && ! grep -Eq '^[#@]includedir[[:space:]]+(/private)?/etc/sudoers\.d([[:space:]]|$)' /etc/sudoers; then
        echo "Warning: /etc/sudoers does not include /etc/sudoers.d; add '#includedir /private/etc/sudoers.d' via visudo." >&2
    fi

    echo "Installed FluxMonitor PF helper for user '${target_user}'."
}

do_uninstall() {
    require_root
    if [[ "${CLEAR_MGMT}" -eq 1 || -n "${MGMT_ADDR}" || -n "${SSH_PORT}" || -n "${PANEL_PORT}" ]]; then
        echo "Error: management lockout options are only valid with install." >&2
        exit 2
    fi

    /bin/launchctl bootout "system/${PLIST_LABEL}" 2>/dev/null || true
    rm -f "${SUDOERS_DST}" "${HELPER_DST}" "${PLIST_DST}"

    if [[ -f "${TOKEN_FILE}" ]]; then
        local token
        token="$(tr -d '[:space:]' < "${TOKEN_FILE}" 2>/dev/null || true)"
        if [[ "${token}" =~ ^[0-9]+$ ]]; then
            /sbin/pfctl -X "${token}" 2>/dev/null || true
        fi
    fi

    /sbin/pfctl -a "${ANCHOR}" -F all 2>/dev/null || true
    rm -f "${TOKEN_FILE}"

    if [[ "${PURGE}" -eq 1 ]]; then
        rm -rf "${DATA_DIR}"
        echo "Uninstalled FluxMonitor PF helper and purged ${DATA_DIR}."
    else
        echo "Uninstalled FluxMonitor PF helper (policy state preserved in ${DATA_DIR})."
    fi
}

do_status() {
    if [[ -x "${HELPER_DST}" ]]; then
        if [[ -f "${HELPER_SRC}" ]]; then
            if cmp -s "${HELPER_SRC}" "${HELPER_DST}"; then
                echo "Helper: installed (${HELPER_DST}, matches bundled helper)"
            else
                echo "Helper: installed (${HELPER_DST}, differs from bundled helper; re-run install to update)"
            fi
        else
            echo "Helper: installed (${HELPER_DST})"
        fi
    else
        echo "Helper: not installed (${HELPER_DST})"
    fi

    if [[ -r "/etc/sudoers" ]]; then
        if grep -Eq '^[#@]includedir[[:space:]]+(/private)?/etc/sudoers\.d([[:space:]]|$)' /etc/sudoers; then
            echo "Sudoers include: enabled (/etc/sudoers includes sudoers.d)"
        else
            echo "Sudoers include: missing (#includedir for sudoers.d not found in /etc/sudoers)"
        fi
    else
        echo "Sudoers include: unreadable without root"
    fi

    if [[ -f "${SUDOERS_DST}" ]]; then
        echo "Sudoers drop-in: present (${SUDOERS_DST})"
    else
        echo "Sudoers drop-in: missing (${SUDOERS_DST})"
    fi

    local check_user="${OPT_USER:-${SUDO_USER:-}}"
    if [[ -z "${check_user}" && "${EUID}" -ne 0 ]]; then
        check_user="${USER:-}"
    fi
    if [[ -n "${check_user}" && "${check_user}" != "root" ]]; then
        if [[ "${EUID}" -eq 0 ]]; then
            if /usr/bin/sudo -lU "${check_user}" 2>/dev/null | grep -Fq "${HELPER_DST}"; then
                echo "Sudo permission (${check_user}): granted"
            else
                echo "Sudo permission (${check_user}): not granted"
            fi
        else
            if /usr/bin/sudo -n -l "${HELPER_DST}" >/dev/null 2>&1; then
                echo "Sudo permission (${check_user}): granted"
            else
                echo "Sudo permission (${check_user}): not verified (run with sudo for full check)"
            fi
        fi
    fi

    if [[ -f "${PLIST_DST}" ]]; then
        if /bin/launchctl print "system/${PLIST_LABEL}" >/dev/null 2>&1; then
            echo "LaunchDaemon: loaded (${PLIST_LABEL})"
        else
            echo "LaunchDaemon: plist present but not loaded (${PLIST_LABEL})"
        fi
    else
        echo "LaunchDaemon: not installed (${PLIST_DST})"
    fi

    if [[ "${EUID}" -eq 0 ]]; then
        local rules_out
        if rules_out="$(/sbin/pfctl -a "${ANCHOR}" -s rules 2>/dev/null)"; then
            local count
            count="$(printf '%s\n' "${rules_out}" | grep -cE '^(block|pass|anchor|match) ' || true)"
            echo "PF anchor (${ANCHOR}): ${count} active filter rule(s)"
        else
            echo "PF anchor (${ANCHOR}): empty or inactive"
        fi
    else
        echo "PF anchor (${ANCHOR}): run with sudo to inspect live PF rules"
    fi
}

case "${COMMAND}" in
    install) do_install ;;
    uninstall) do_uninstall ;;
    status) do_status ;;
esac
