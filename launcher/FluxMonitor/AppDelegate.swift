import Cocoa
import SwiftUI
import Sparkle
import Combine

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        return !UserDefaults.standard.bool(forKey: "silentStart")
    }
    
    var statusItem: NSStatusItem?
    static var shared: AppDelegate?
    var cancellables = Set<AnyCancellable>()
    
    var settingsWindow: NSWindow?
    var logsWindow: NSWindow?
    
    // Sparkle updater
    var updaterController: SPUStandardUpdaterController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        setupMainMenu()
        
        // Register defaults
        UserDefaults.standard.register(defaults: [
            "autoStartService": true,
            "silentStart": false,
            "port": 4210,
            "appLanguage": Language.system.rawValue
        ])
        
        // Initialize Sparkle
        updaterController = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
        
        setupMenuBar()
        
        let bundleID = Bundle.main.bundleIdentifier!
        let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent(bundleID, isDirectory: true)
        let configFileUrl = appSupportDir.appendingPathComponent("config.json")
        let isFirstRun = !FileManager.default.fileExists(atPath: configFileUrl.path)
        
        let (u, p, _) = ConfigManager.shared.loadConfig()
        let hasCredentials = !(u?.isEmpty ?? true) && !(p?.isEmpty ?? true)
        let needsSetup = !ConfigManager.shared.configExists() || !hasCredentials
        let isNodeAvailable = ProcessManager.shared.findNodePath() != nil
        let silentStart = UserDefaults.standard.bool(forKey: "silentStart")

        if !isFirstRun && UserDefaults.standard.bool(forKey: "autoStartService") && hasCredentials {
            ProcessManager.shared.start()
            
            // Auto-start tunnel if enabled
            if UserDefaults.standard.bool(forKey: "autoStartTunnel") {
                let port = UserDefaults.standard.integer(forKey: "port") != 0 ? UserDefaults.standard.integer(forKey: "port") : 4210
                let subdomain = UserDefaults.standard.string(forKey: "tunnelSubdomain") ?? ""
                
                // Slight delay to allow service to bind if it's already installed
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    TunnelManager.shared.start(port: port, subdomain: subdomain)
                }
            }
        }
        
        // Show window if Node.js is missing OR setup is needed OR silent start is disabled
        if !isNodeAvailable || needsSetup || !silentStart {
            showSettings()
        }
        
        // Observe language changes
        I18N.shared.$language
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.setupMainMenu()
                self?.updateMenu()
                self?.settingsWindow?.title = I18N.shared.t("app_title")
            }
            .store(in: &cancellables)
        
        // Ensure first run alert is shown if needed
        checkFirstRun()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            showSettings()
        }
        return true
    }
    
    private func checkFirstRun() {
        let (configUser, configPass, _) = ConfigManager.shared.loadConfig()
        let userDefaultsUser = UserDefaults.standard.string(forKey: "username") ?? ""
        let userDefaultsPass = UserDefaults.standard.string(forKey: "password") ?? ""
        
        let needsSetup = !ConfigManager.shared.configExists() || 
                         (configUser?.isEmpty ?? true) || 
                         (configPass?.isEmpty ?? true)
        
        if needsSetup && (userDefaultsUser.isEmpty || userDefaultsPass.isEmpty) {
            showSettings()
        }
    }

    func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        
        ProcessManager.shared.$isRunning
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.updateIcon()
                self?.updateMenu()
            }
            .store(in: &cancellables)
    }
    
    func updateIcon() {
        if let button = statusItem?.button {
            let symbolName = ProcessManager.shared.isRunning ? "flame.fill" : "flame"
            let i18n = I18N.shared
            let image = NSImage(systemSymbolName: symbolName, accessibilityDescription: i18n.t("app_title"))
            image?.isTemplate = true
            button.image = image
            button.toolTip = i18n.t("app_title")
        }
    }

    func updateMenu() {
        updateIcon()
        let menu = NSMenu()
        menu.autoenablesItems = false
        let i18n = I18N.shared
        
        let isRunning = ProcessManager.shared.isRunning
        let statusTitle = "\(i18n.t("status")): \(isRunning ? i18n.t("running") : i18n.t("stopped"))"
        let statusMenuItem = NSMenuItem(title: statusTitle, action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)
        
        menu.addItem(NSMenuItem.separator())
        
        let toggleTitle = isRunning ? i18n.t("stop") : i18n.t("start")
        let toggleItem = NSMenuItem(title: toggleTitle, action: #selector(toggleService), keyEquivalent: "s")
        toggleItem.target = self
        menu.addItem(toggleItem)
        
        let dashboardTitle = i18n.t("flux_monitor")
        let dashboardItem = NSMenuItem(title: dashboardTitle, action: #selector(openDashboard), keyEquivalent: "o")
        dashboardItem.target = self
        dashboardItem.isEnabled = isRunning
        menu.addItem(dashboardItem)
        
        menu.addItem(NSMenuItem.separator())
        
        let settingsItem = NSMenuItem(title: i18n.t("settings_dots"), action: #selector(showSettings), keyEquivalent: ",")
        settingsItem.target = self
        menu.addItem(settingsItem)
        
        // Add Update item
        if let updaterController = updaterController {
            let updateItem = NSMenuItem(title: i18n.t("check_updates"), action: #selector(SPUStandardUpdaterController.checkForUpdates(_:)), keyEquivalent: "")
            updateItem.target = updaterController
            menu.addItem(updateItem)
        }
        
        menu.addItem(NSMenuItem.separator())
        
        menu.addItem(NSMenuItem(title: i18n.t("quit"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        
        statusItem?.menu = menu
    }

    @objc func toggleService() {
        if ProcessManager.shared.isRunning {
            ProcessManager.shared.stop()
        } else {
            ProcessManager.shared.start()
        }
        updateMenu()
    }

    @objc func openDashboard() {
        let port = UserDefaults.standard.integer(forKey: "port") != 0 ? UserDefaults.standard.integer(forKey: "port") : 4210
        if let url = URL(string: "http://localhost:\(port)") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func showSettings() {
        if settingsWindow == nil {
            let contentView = MainView()
            settingsWindow = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 600, height: 500),
                styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                backing: .buffered, defer: false)
            settingsWindow?.center()
            settingsWindow?.setFrameAutosaveName("MainWindow")
            settingsWindow?.contentView = NSHostingView(rootView: contentView)
            settingsWindow?.titlebarAppearsTransparent = true
            settingsWindow?.title = I18N.shared.t("app_title")
            settingsWindow?.isReleasedWhenClosed = false
            settingsWindow?.standardWindowButton(.miniaturizeButton)?.isHidden = false
            settingsWindow?.standardWindowButton(.closeButton)?.isHidden = false
            settingsWindow?.delegate = self
        }
        NSApp.setActivationPolicy(.regular)
        settingsWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func windowWillClose(_ notification: Notification) {
        if let window = notification.object as? NSWindow, window == settingsWindow {
            NSApp.setActivationPolicy(.accessory)
        }
    }

    @objc func showLogs() {
        showSettings() // Combined into MainView tabs
    }
    
    private func setupMainMenu() {
        let mainMenu = NSMenu()
        let i18n = I18N.shared
        
        // Update process name (can affect Dock tooltip and menu bar name in some cases)
        let appTitle = i18n.t("app_title")
                
        // App Menu
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu
        appMenu.addItem(withTitle: i18n.t("about"), action: #selector(showSettings), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: i18n.t("quit"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        
        // Edit Menu (Required for Cmd+C, Cmd+A shortcuts)
        let editMenuItem = NSMenuItem(title: i18n.t("edit"), action: nil, keyEquivalent: "")
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: i18n.t("edit"))
        editMenuItem.submenu = editMenu
        editMenu.addItem(withTitle: i18n.t("copy"), action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: i18n.t("select_all"), action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        
        NSApp.mainMenu = mainMenu
    }
}

// MARK: - Configuration Manager
class ConfigManager {
    static let shared = ConfigManager()
    
    private var bundleID: String { Bundle.main.bundleIdentifier! }
    
    private var appSupportDir: URL {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent(bundleID, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    
    var configFileUrl: URL {
        appSupportDir.appendingPathComponent("config.json")
    }
    
    func configExists() -> Bool {
        FileManager.default.fileExists(atPath: configFileUrl.path)
    }
    
    func saveConfig(username: String, password: String, port: Int) {
        let json: [String: Any] = [
            "users": [["username": username, "password": password]],
            "deploy": ["port": port]
        ]
        
        if let data = try? JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted]) {
            try? data.write(to: configFileUrl)
        }
    }
    
    func loadConfig() -> (username: String?, password: String?, port: Int?) {
        guard let data = try? Data(contentsOf: configFileUrl),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return (nil, nil, nil)
        }
        
        var username: String?
        var password: String?
        var port: Int?
        
        if let users = json["users"] as? [[String: Any]], let first = users.first {
            username = first["username"] as? String
            password = first["password"] as? String
        }
        
        if let deploy = json["deploy"] as? [String: Any] {
            port = deploy["port"] as? Int
        }
        
        return (username, password, port)
    }
}
