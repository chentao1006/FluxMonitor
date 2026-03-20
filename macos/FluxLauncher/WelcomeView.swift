import SwiftUI

struct WelcomeView: View {
    @Environment(\.dismiss) var dismiss
    @StateObject var i18n = I18N.shared
    
    @AppStorage("username") var username = ""
    @AppStorage("password") var password = ""
    @AppStorage("port") var port = 7000
    
    var body: some View {
        VStack(spacing: 0) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .scaledToFit()
                .frame(width: 80, height: 80)
                .padding(.top, 40)
                .padding(.bottom, 20)
            
            VStack(spacing: 10) {
                Text(i18n.t("welcome_title"))
                    .font(.system(size: 24, weight: .bold))
                
                Text(i18n.t("welcome_message"))
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 30)
            
            VStack(spacing: 16) {
                // Username field
                VStack(alignment: .leading, spacing: 5) {
                    Text(i18n.t("username"))
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .fontWeight(.medium)
                    TextField(i18n.t("username"), text: $username)
                        .textFieldStyle(.roundedBorder)
                        .controlSize(.large)
                }
                
                // Password field
                VStack(alignment: .leading, spacing: 5) {
                    Text(i18n.t("password"))
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .fontWeight(.medium)
                    SecureField(i18n.t("password"), text: $password)
                        .textFieldStyle(.roundedBorder)
                        .controlSize(.large)
                }
                
                // Port field
                HStack(alignment: .center, spacing: 12) {
                    Text(i18n.t("port"))
                        .font(.body)
                    TextField("", value: $port, formatter: {
                        let f = NumberFormatter()
                        f.numberStyle = .none
                        f.maximumFractionDigits = 0
                        return f
                    }())
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 80)
                        .multilineTextAlignment(.center)
                    Spacer()
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, 50)
            
            Spacer()
            
            Button {
                saveAndFinish()
            } label: {
                Text(i18n.t("get_started"))
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(username.isEmpty || password.isEmpty)
            .padding(.horizontal, 50)
            .padding(.bottom, 40)
        }
        .frame(width: 420, height: 560)
        .background(Color(NSColor.windowBackgroundColor))
    }
    
    private func saveAndFinish() {
        ConfigManager.shared.saveConfig(username: username, password: password, port: port)
        
        // No need to save manually to UserDefaults, @AppStorage handles it
        // (username and password are saved when those @State values change)
        
        dismiss()
        
        // Start service
        if UserDefaults.standard.bool(forKey: "autoStartService") {
            ProcessManager.shared.start()
        }
        
        // Refresh menu in case status changed
        AppDelegate.shared?.updateMenu()
    }
}
