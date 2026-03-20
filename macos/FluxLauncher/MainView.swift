import SwiftUI

struct MainView: View {
    @StateObject var i18n = I18N.shared
    @State private var selectedTab = 0
    @State private var showingFirstRunAlert = false
    
    init() {
        let username = UserDefaults.standard.string(forKey: "username") ?? ""
        let password = UserDefaults.standard.string(forKey: "password") ?? ""
        let port = UserDefaults.standard.integer(forKey: "port") != 0 ? UserDefaults.standard.integer(forKey: "port") : 7000
        
        let configManager = ConfigManager.shared
        if !configManager.configExists() {
            if username.isEmpty || password.isEmpty {
                // No config and no saved credentials, show Welcome
                _showingFirstRunAlert = State(initialValue: true)
            } else {
                // No config file, but we HAVE credentials in UserDefaults (e.g. from sync or previous install)
                // Just create the config file and proceed
                configManager.saveConfig(username: username, password: password, port: port)
                _showingFirstRunAlert = State(initialValue: false)
            }
        }
    }
    
    var body: some View {
        TabView(selection: $selectedTab) {
            ServiceView()
                .tabItem {
                    Label(i18n.t("service"), systemImage: "server.rack")
                }
                .tag(0)
            
            SettingsView()
                .tabItem {
                    Label(i18n.t("settings"), systemImage: "gear")
                }
                .tag(1)
            
            AboutView()
                .tabItem {
                    Label(i18n.t("about"), systemImage: "info.circle")
                }
                .tag(2)
        }
        .frame(minWidth: 600, minHeight: 450)
        .padding()
        .sheet(isPresented: $showingFirstRunAlert) {
            WelcomeView()
        }
    }
}
