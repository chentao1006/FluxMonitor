import SwiftUI

struct ServiceView: View {
    @StateObject var pm = ProcessManager.shared
    @StateObject var i18n = I18N.shared
    @AppStorage("port") var port = 4210
    @State private var localIP = "localhost"

    var body: some View {
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
                
                Button(action: {
                    if pm.isRunning {
                        pm.stop()
                    } else {
                        pm.start()
                    }
                    AppDelegate.shared?.updateMenu()
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: pm.isRunning ? "stop.fill" : "play.fill")
                            .font(.system(size: 11))
                        Text(pm.isRunning ? i18n.t("stop") : i18n.t("start"))
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .frame(width: 70, height: 26)
                }
                .buttonStyle(.borderedProminent)
                .tint(pm.isRunning ? .red : .blue)
                .controlSize(.small)
            }
            .padding()
            .background(Color(NSColor.controlBackgroundColor).opacity(0.8))
            .cornerRadius(12)
            
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
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.secondary.opacity(0.1), lineWidth: 1)
                    )
            }
        }
        .onAppear {
            // Keep localhost as requested by user
            localIP = "localhost"
        }
    }
}
