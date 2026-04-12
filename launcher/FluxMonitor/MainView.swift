import SwiftUI

struct MainView: View {
    @StateObject var i18n = I18N.shared
    @StateObject var installer = NodeInstaller.shared
    @StateObject var pm = ProcessManager.shared
    @StateObject var tunnelManager = TunnelManager.shared
    @State private var selectedTab = 0
    @State private var showingFirstRunAlert = false
    @State private var showingIOSAppGuide = false
    
    init() {
        let username = UserDefaults.standard.string(forKey: "username") ?? ""
        let password = UserDefaults.standard.string(forKey: "password") ?? ""
        let port = UserDefaults.standard.integer(forKey: "port") != 0 ? UserDefaults.standard.integer(forKey: "port") : 4210
        
        let configManager = ConfigManager.shared
        let (configUser, configPass, _) = configManager.loadConfig()
        
        let needsSetup = !configManager.configExists() || 
                         (configUser?.isEmpty ?? true) || 
                         (configPass?.isEmpty ?? true)
        
        if needsSetup {
            if username.isEmpty || password.isEmpty {
                // No valid credentials found anywhere, show Welcome
                _showingFirstRunAlert = State(initialValue: true)
            } else {
                // We have credentials in UserDefaults but maybe config.json was deleted or corrupted
                // Auto-repair config.json
                configManager.saveConfig(username: username, password: password, port: port)
                _showingFirstRunAlert = State(initialValue: false)
            }
        }
    }
    
    var body: some View {
        TabView(selection: $selectedTab) {
            ServiceView()
                .tabItem {
                    Text(i18n.t("service"))
                }
                .tag(0)
            
            TunnelView()
                .tabItem {
                    Text(i18n.t("tunnel"))
                }
                .tag(1)
            
            SettingsView()
                .tabItem {
                    Text(i18n.t("general"))
                }
                .tag(2)
            
            AboutView(showingIOSAppGuide: $showingIOSAppGuide)
                .tabItem {
                    Text(i18n.t("about"))
                }
                .tag(3)
        }
        .frame(minWidth: 600, minHeight: 450)
        .padding()
        .overlay {
            if installer.status != .idle && installer.status != .completed {
                ZStack {
                    Color.black.opacity(0.4)
                        .edgesIgnoringSafeArea(.all)
                    
                    VStack(spacing: 20) {
                        ProgressView()
                            .scaleEffect(1.5)
                        
                        Text(installer.status.description)
                            .font(.headline)
                            .foregroundColor(.white)
                        
                        if case .downloading(let progress) = installer.status {
                            ProgressView(value: progress)
                                .progressViewStyle(.linear)
                                .frame(width: 200)
                                .accentColor(.blue)
                        }
                    }
                    .padding(40)
                    .background(VisualEffectView(material: .hudWindow, blendingMode: .withinWindow))
                    .cornerRadius(20)
                    .transition(.opacity)
                }
            }
        }
        .sheet(isPresented: $showingFirstRunAlert) {
            WelcomeView()
        }
        .alert(i18n.t("download_node_title"), isPresented: $installer.showingConfirmation) {
            Button(i18n.t("download")) {
                installer.confirmDownload()
            }
            Button(i18n.t("cancel"), role: .cancel) {
                installer.status = .idle
            }
        } message: {
            Text(i18n.t("download_node_message"))
        }
        .sheet(isPresented: $showingIOSAppGuide) {
            IOSAppGuideView()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("ShowIOSAppGuide"))) { _ in
            showingIOSAppGuide = true
        }
    }
}

struct VisualEffectView: NSViewRepresentable {
    var material: NSVisualEffectView.Material
    var blendingMode: NSVisualEffectView.BlendingMode

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = .active
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.blendingMode = blendingMode
    }
}
