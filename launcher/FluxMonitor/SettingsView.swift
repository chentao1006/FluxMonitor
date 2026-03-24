import SwiftUI
import ServiceManagement

struct SettingsView: View {
    @StateObject var i18n = I18N.shared
    @AppStorage("autoStartApp") var autoStartApp = false
    @AppStorage("autoStartService") var autoStartService = true
    @AppStorage("autoStartTunnel") var autoStartTunnel = false
    @AppStorage("port") var port = 4210
    
    @AppStorage("username") var username = ""
    @AppStorage("password") var password = ""

    @AppStorage("silentStart") var silentStart = false
    
    private var portFormatter: NumberFormatter {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        return formatter
    }
    
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
        .onAppear(perform: loadConfig)
        .onChange(of: username) { _ in saveSettings() }
        .onChange(of: password) { _ in saveSettings() }
        .onChange(of: port) { _ in saveSettings() }
        .onChange(of: autoStartService) { _ in saveSettings() }
    }
    
    @ViewBuilder
    private var settingsSections: some View {
        Section(header: Text(i18n.t("service_config"))) {
            HStack {
                Text(i18n.t("username"))
                Spacer()
                TextField("", text: $username)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 200)
            }
            
            HStack {
                Text(i18n.t("password"))
                Spacer()
                SecureField("", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 200)
            }
            
            HStack {
                Text(i18n.t("port"))
                Spacer()
                TextField("", value: $port, formatter: portFormatter)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 80)
            }
        }
        
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
    
    private func loadConfig() {
        let (u, p, pt) = ConfigManager.shared.loadConfig()
        if let u = u { username = u }
        if let p = p { password = p }
        if let pt = pt { port = pt }
    }
    
    private func saveSettings() {
        ConfigManager.shared.saveConfig(username: username, password: password, port: port)
        
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
