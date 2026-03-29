import SwiftUI

struct ServiceView: View {
    @StateObject var pm = ProcessManager.shared
    @StateObject var i18n = I18N.shared
    @AppStorage("port") var port = 4210
    @AppStorage("username") var username = ""
    @AppStorage("password") var password = ""
    
    @State private var localIP = "localhost"
    
    private var portFormatter: NumberFormatter {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        return formatter
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Service Status Card
                HStack {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Circle()
                                .fill(pm.isRunning ? Color.green : Color.red)
                                .frame(width: 12, height: 12)
                                .shadow(color: (pm.isRunning ? Color.green : Color.red).opacity(0.5), radius: 4)
                            Text("\(i18n.t("status")): \(pm.isRunning ? i18n.t("running") : i18n.t("stopped"))")
                                .font(.system(size: 20, weight: .bold))
                        }
                        
                        if pm.isRunning, let urlObj = URL(string: "http://\(localIP):\(String(port))") {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(i18n.t("address"))
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                Link(destination: urlObj) {
                                    Text("http://\(localIP):\(String(port))")
                                        .font(.subheadline)
                                        .foregroundColor(.blue)
                                        .underline()
                                }
                            }
                        }
                    }
                    
                    Spacer()
                    
                    Toggle("", isOn: Binding(
                        get: { pm.isRunning },
                        set: { newValue in
                            if newValue {
                                pm.start()
                            } else {
                                pm.stop()
                            }
                            AppDelegate.shared?.updateMenu()
                        }
                    ))
                    .toggleStyle(.switch)
                    .labelsHidden()
                }
                .padding()
                .background(Color(NSColor.controlBackgroundColor).opacity(0.8))
                .cornerRadius(12)
                
                VStack(alignment: .leading, spacing: 12) {
                    Text(i18n.t("service_config"))
                        .font(.caption.bold())
                        .foregroundColor(.secondary)
                    
                    HStack {
                        Text(i18n.t("username"))
                            .frame(width: 80, alignment: .leading)
                        TextField("", text: $username)
                            .textFieldStyle(.roundedBorder)
                    }
                    
                    HStack {
                        Text(i18n.t("password"))
                            .frame(width: 80, alignment: .leading)
                        SecureField("", text: $password)
                            .textFieldStyle(.roundedBorder)
                    }
                    
                    HStack {
                        Text(i18n.t("port"))
                            .frame(width: 80, alignment: .leading)
                        TextField("", value: $port, formatter: portFormatter)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 80)
                        Spacer()
                    }
                }
                .padding()
                .background(Color(NSColor.controlBackgroundColor).opacity(0.8))
                .cornerRadius(12)
                .disabled(pm.isRunning)
                .opacity(pm.isRunning ? 0.6 : 1.0)
                .onChange(of: username) { _ in saveSettings() }
                .onChange(of: password) { _ in saveSettings() }
                .onChange(of: port) { _ in saveSettings() }
                
                // Logs Section
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Label(i18n.t("logs"), systemImage: "terminal")
                            .font(.caption.bold())
                            .foregroundColor(.secondary)
                        Spacer()
                        Button(i18n.t("clear_logs")) {
                            pm.logs = ""
                        }
                        .buttonStyle(.plain)
                        .font(.caption)
                        .foregroundColor(.blue)
                    }
                    
                    LogViewer()
                        .frame(minHeight: 200)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.secondary.opacity(0.1), lineWidth: 1)
                        )
                }
            }
            .padding()
        }
        .onAppear {
            localIP = "localhost"
            loadConfig()
        }
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
        if pm.isRunning {
            pm.stop()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                pm.start()
            }
        }
        
        // Notify user or UI
        AppDelegate.shared?.updateMenu()
    }
}
