import SwiftUI

/// Optional system components the dashboard can use. Each one is installed (or declined) here.
struct ComponentsView: View {
    @StateObject var i18n = I18N.shared

    var body: some View {
        if #available(macOS 13.0, *) {
            Form { sections }
                .formStyle(.grouped)
        } else {
            List { sections }
                .listStyle(.inset)
        }
    }

    private var sections: some View {
        Section {
            FirewallComponentRow()
        } header: {
            Text(i18n.t("firewall"))
        } footer: {
            Text(i18n.t("firewall_desc"))
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

struct FirewallSetupView: View {
    @ObservedObject private var i18n = I18N.shared
    @State private var ready = false
    @State private var busy = false
    @State private var failed = false
    /// Mirrors `features.firewall == false` in config.json, the switch the dashboard also edits,
    /// so turning the module off or on in either place is reflected in the other.
    @State private var declined = !ConfigManager.shared.isFeatureEnabled("firewall")
    /// The first-run screen hides the section entirely once declined; Settings keeps a way back.
    var hidesWhenDeclined = false

    var body: some View {
        Group {
            if declined {
                if !hidesWhenDeclined { declinedRow }
            } else {
                setupControls
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            declined = !ConfigManager.shared.isFeatureEnabled("firewall")
        }
    }

    private var declinedRow: some View {
        HStack {
            Text(i18n.t("firewall_off")).foregroundColor(.secondary)
            Spacer()
            Button(i18n.t("firewall_turn_on")) {
                declined = false
                ConfigManager.shared.setFeature("firewall", enabled: true)
            }
        }
    }

    private var setupControls: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Button {
                    busy = true
                    failed = false
                    Task {
                        ready = await Task.detached { FirewallComponent.install() && FirewallComponent.isReady() }.value
                        failed = !ready
                        busy = false
                        if ready {
                            declined = false
                            ConfigManager.shared.setFeature("firewall", enabled: true)
                        }
                    }
                } label: {
                    if busy {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(i18n.t(ready ? "firewall_ready" : "firewall_enable"))
                    }
                }
                .disabled(ready || busy)
                if !ready && !busy {
                    Button(i18n.t("firewall_decline")) {
                        declined = true
                        failed = false
                        ConfigManager.shared.setFeature("firewall", enabled: false)
                    }
                    .buttonStyle(.link)
                }
            }
            if failed {
                Text(i18n.t("firewall_retry")).font(.caption).foregroundColor(.secondary)
            }
        }
        .task {
            let installed = await Task.detached { FirewallComponent.isReady() }.value
            if !busy { ready = installed }
        }
    }
}

/// Installs and inspects the PF helper shipped in Resources/pf.
enum FirewallComponent {
    nonisolated static let helper = "/Library/PrivilegedHelperTools/com.ct106.flux-monitor-pf"

    nonisolated static func isReady() -> Bool {
        FileManager.default.isExecutableFile(atPath: helper)
            && run("/usr/bin/sudo", ["-n", "-l", helper])
            && run("/bin/launchctl", ["print", "system/com.ct106.flux-monitor-pf"])
    }

    nonisolated static func install() -> Bool {
        setup(["install", "--user", NSUserName()])
    }

    /// Removes the helper, its sudo rule, the LaunchDaemon and the PF anchor rules.
    /// The saved policy in /var/db is kept, so reinstalling restores it.
    nonisolated static func uninstall() -> Bool {
        setup(["uninstall"])
    }

    /// Runs bundled pf/setup.sh as root through the standard macOS administrator prompt.
    nonisolated private static func setup(_ arguments: [String]) -> Bool {
        guard let script = Bundle.main.url(forResource: "setup", withExtension: "sh", subdirectory: "pf") else {
            return false
        }
        let command = """
        on run argv
            set cmd to quoted form of (item 1 of argv)
            repeat with arg in items 2 thru -1 of argv
                set cmd to cmd & " " & quoted form of (arg as text)
            end repeat
            do shell script cmd with administrator privileges
        end run
        """
        return run("/usr/bin/osascript", ["-e", command, "--", script.path] + arguments)
    }

    nonisolated private static func run(_ executable: String, _ arguments: [String]) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }
}

/// Components tab row: a switch for the dashboard module plus install / uninstall of the helper.
/// The switch is `features.firewall` in config.json, shared with the dashboard's own module toggle.
struct FirewallComponentRow: View {
    @ObservedObject private var i18n = I18N.shared
    @State private var enabled = ConfigManager.shared.isFeatureEnabled("firewall")
    @State private var installed = false
    @State private var busy = false
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(i18n.t("firewall_manage"))
                    Text(i18n.t(installed ? "firewall_installed" : "firewall_not_installed"))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                if busy { ProgressView().controlSize(.small) }
                Toggle("", isOn: Binding(get: { enabled }, set: setEnabled))
                    .toggleStyle(.switch)
                    .labelsHidden()
                    .disabled(busy)
            }
            if installed && !enabled {
                Text(i18n.t("firewall_rules_kept")).font(.caption).foregroundColor(.secondary)
            }
            if failed {
                Text(i18n.t("firewall_retry")).font(.caption).foregroundColor(.secondary)
            }
            if installed {
                Button(i18n.t("firewall_uninstall"), role: .destructive) {
                    run { FirewallComponent.uninstall() } then: { ok in
                        if ok { setFeature(false) }
                    }
                }
                .disabled(busy)
            }
        }
        .task { await refresh() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await refresh() }
        }
    }

    private func setEnabled(_ on: Bool) {
        guard on else { return setFeature(false) }
        if installed { return setFeature(true) }
        // Turning it on without the helper installs it first; the switch stays off if that fails.
        run { FirewallComponent.install() && FirewallComponent.isReady() } then: { ok in
            if ok { setFeature(true) }
        }
    }

    private func setFeature(_ on: Bool) {
        enabled = on
        ConfigManager.shared.setFeature("firewall", enabled: on)
    }

    private func run(_ work: @escaping @Sendable () -> Bool, then done: @escaping (Bool) -> Void) {
        busy = true
        failed = false
        Task {
            let ok = await Task.detached(operation: work).value
            await refresh()
            failed = !ok
            busy = false
            done(ok)
        }
    }

    private func refresh() async {
        installed = await Task.detached { FirewallComponent.isReady() }.value
        enabled = ConfigManager.shared.isFeatureEnabled("firewall")
    }
}
