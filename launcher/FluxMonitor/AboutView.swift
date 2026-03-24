import SwiftUI

struct AboutView: View {
    @StateObject var i18n = I18N.shared
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.1.4"
    let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    
    var body: some View {
        VStack(spacing: 20) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 80, height: 80)
            
            VStack(spacing: 4) {
                Text(i18n.t("app_title"))
                    .font(.title2.bold())
                Text(String(format: i18n.t("version_format"), version, build))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Text(i18n.t("about_desc"))
                .font(.body)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Divider()
            
            VStack(spacing: 12) {
                Button(action: {
                    if let url = URL(string: "https://github.com/chentao1006/FluxMonitor") {
                        NSWorkspace.shared.open(url)
                    }
                }) {
                    Label("GitHub", systemImage: "link")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                
                Button(action: {
                    AppDelegate.shared?.updaterController?.checkForUpdates(nil)
                }) {
                    Label(i18n.t("check_updates"), systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .padding(.horizontal, 40)
            
            Spacer()
            
            Text(i18n.t("mit_license"))
                .font(.system(size: 10))
                .foregroundColor(.secondary)
        }
        .padding(.top, 30)
        .padding(.bottom, 10)
    }
}
