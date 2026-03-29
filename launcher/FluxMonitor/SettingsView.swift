import SwiftUI
import ServiceManagement

struct SettingsView: View {
    @StateObject var i18n = I18N.shared
    @AppStorage("autoStartApp") var autoStartApp = false
    @AppStorage("autoStartService") var autoStartService = true
    @AppStorage("autoStartTunnel") var autoStartTunnel = false
    
    @AppStorage("silentStart") var silentStart = false
    
    
    var body: some View {
        Group {
            if #available(macOS 13.0, *) {
                Form {
                    settingsSections
                }
                .formStyle(.grouped)
            } else {
                // On macOS 12 and earlier, Form with custom HStacks 
                // pushes everything to the right because it leaves the label column empty.
                // List provides a more consistent full-width layout.
                List {
                    settingsSections
                }
                .listStyle(.inset)
            }
        }
        .frame(minWidth: 400)
        .onChange(of: autoStartService) { _ in saveSettings() }
    }
    
    @ViewBuilder
    private var settingsSections: some View {
        Section(header: Text(i18n.t("behavior"))) {
            HStack {
                Text(i18n.t("launch_at_login"))
                Spacer()
                Toggle("", isOn: $autoStartApp)
                    .toggleStyle(.switch)
                    .labelsHidden()
                    .onChange(of: autoStartApp) { updateLaunchAtLogin(enabled: $0) }
            }
            
            HStack {
                Text(i18n.t("auto_start_service"))
                Spacer()
                Toggle("", isOn: $autoStartService)
                    .toggleStyle(.switch)
                    .labelsHidden()
                    .onChange(of: autoStartService) { newValue in
                        if !newValue { autoStartTunnel = false }
                        saveSettings()
                    }
            }
            
            HStack {
                Text(i18n.t("auto_start_tunnel"))
                Spacer()
                Toggle("", isOn: $autoStartTunnel)
                    .toggleStyle(.switch)
                    .labelsHidden()
                    .disabled(!autoStartService)
                    .opacity(autoStartService ? 1.0 : 0.5)
            }
            
            HStack {
                Text(i18n.t("silent_start"))
                Spacer()
                Toggle("", isOn: $silentStart)
                    .toggleStyle(.switch)
                    .labelsHidden()
            }
        }
        
        Section(header: Text(i18n.t("language"))) {
            HStack {
                Text(i18n.t("language"))
                Spacer()
                Picker("", selection: $i18n.language) {
                    ForEach(Language.allCases) { lang in
                        Text(lang.localized).tag(lang)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }
        }
    }
    
    private func updateLaunchAtLogin(enabled: Bool) {
        #if compiler(>=5.7)
        if #available(macOS 13.0, *) {
            do {
                if enabled {
                    try SMAppService.mainApp.register()
                } else {
                    try SMAppService.mainApp.unregister()
                }
            } catch {
                ProcessManager.shared.appendLog("Failed to update launch at login status: \(error.localizedDescription)\n")
            }
        }
        #endif
    }
    
    private func saveSettings() {
        // Restart if running
        if ProcessManager.shared.isRunning {
            ProcessManager.shared.stop()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                ProcessManager.shared.start()
            }
        }
        
        // Notify user or UI
        AppDelegate.shared?.updateMenu()
    }
}
