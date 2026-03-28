import SwiftUI

struct MainView: View {
    @StateObject var i18n = I18N.shared
    @StateObject var installer = NodeInstaller.shared
    @StateObject var pm = ProcessManager.shared
    @StateObject var tunnelManager = TunnelManager.shared
    @State private var selectedTab = 0
    @State private var showingFirstRunAlert = false
    
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
                    Text(i18n.t("settings"))
                }
                .tag(2)
            
            AboutView()
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

// MARK: - Cloudflare Tunnel Implementation

enum InstaTunnelStatus: Equatable, CustomStringConvertible {
    case idle
    case checking
    case downloading(progress: Double)
    case extracting
    case completed
    case error(String)
    
    var isBusy: Bool {
        switch self {
        case .downloading, .extracting, .checking: return true
        default: return false
        }
    }
    
    var description: String {
        let i18n = I18N.shared
        switch self {
        case .idle: return ""
        case .checking: return i18n.t("instatunnel_checking")
        case .downloading(let progress): 
            let percent = Int(progress * 100)
            return String(format: i18n.t("instatunnel_downloading"), percent)
        case .extracting: return i18n.t("instatunnel_preparing")
        case .completed: return i18n.t("instatunnel_ready")
        case .error(let msg): return String(format: i18n.t("instatunnel_error"), msg)
        }
    }
}

class InstaTunnelDownloader: ObservableObject {
    static let shared = InstaTunnelDownloader()
    
    @Published var status: InstaTunnelStatus = .idle
    @Published var showingConfirmation = false
    
    private var session: URLSession?
    private var downloadTask: URLSessionDownloadTask?
    private var completion: ((Bool) -> Void)?
    
    var localInstaTunnelPath: String {
        let bundleID = Bundle.main.bundleIdentifier!
        let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent(bundleID, isDirectory: true)
        try? FileManager.default.createDirectory(at: appSupportDir, withIntermediateDirectories: true)
        return appSupportDir.appendingPathComponent("instatunnel").path
    }
    
    func isInstalled() -> Bool {
        let path = localInstaTunnelPath
        if !FileManager.default.fileExists(atPath: path) { return false }
        
        let attr = try? FileManager.default.attributesOfItem(atPath: path)
        let size = (attr?[.size] as? UInt64) ?? 0
        if size < 1024 { 
            appendLog("Checking installation: file too small (\(size) bytes)\n")
            return false 
        }
        
        _ = fixPermissions(at: path)
        return true
    }
    
    private func fixPermissions(at path: String) -> Bool {
        do {
            try FileManager.default.setAttributes([FileAttributeKey.posixPermissions: 0o755], ofItemAtPath: path)
            
            // Remove quarantine bit
            let xattrProcess = Process()
            xattrProcess.executableURL = URL(fileURLWithPath: "/usr/bin/xattr")
            xattrProcess.arguments = ["-d", "com.apple.quarantine", path]
            try? xattrProcess.run()
            xattrProcess.waitUntilExit()
            
            // Re-sign binary ad-hoc (CRITICAL for Sandbox to allow Process.run)
            let codesignProcess = Process()
            codesignProcess.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
            codesignProcess.arguments = ["-s", "-", "-f", path]
            try? codesignProcess.run()
            codesignProcess.waitUntilExit()
            
            return true
        } catch {
            appendLog("Failed to fix permissions/signing: \(error.localizedDescription)\n")
            return false
        }
    }
    
    func resetInstallation() {
        try? FileManager.default.removeItem(atPath: localInstaTunnelPath)
        DispatchQueue.main.async {
            self.status = .idle
            self.appendLog("Installation reset. You can now try to start again.\n")
        }
    }
    
    func checkAndDownloadIfNeeded(completion: @escaping (Bool) -> Void) {
        if isInstalled() {
            completion(true)
            return
        }
        
        self.completion = completion
        DispatchQueue.main.async {
            self.showingConfirmation = true
        }
    }
    
    func confirmDownload() {
        downloadInstaTunnel(completion: self.completion ?? { _ in })
    }
    
    func downloadInstaTunnel(completion: @escaping (Bool) -> Void) {
        // Use the darwin-amd64 binary for all macOS architectures (works via Rosetta on arm64)
        let urlString = "https://api.instatunnel.my/releases/instatunnel-darwin-amd64"
        
        guard let url = URL(string: urlString) else {
            self.status = .error("Invalid URL")
            completion(false)
            return
        }
        
        appendLog("Downloading InstaTunnel from: \(urlString)\n")
        self.status = .downloading(progress: 0)
        self.completion = completion
        
        let config = URLSessionConfiguration.default
        let session = URLSession(configuration: config, delegate: InstaTunnelDownloadDelegate(downloader: self), delegateQueue: .main)
        self.session = session
        
        downloadTask = session.downloadTask(with: url)
        downloadTask?.resume()
    }
    
    fileprivate func handleDownloadFinish(localURL: URL) {
        appendLog("Download finished, preparing binary...\n")
        DispatchQueue.main.async {
            self.status = .extracting
        }
        
        let destinationURL = URL(fileURLWithPath: self.localInstaTunnelPath)
        
        do {
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.removeItem(at: destinationURL)
            }
            try FileManager.default.moveItem(at: localURL, to: destinationURL)
            
            if fixPermissions(at: destinationURL.path) {
                appendLog("Binary moved and permissions fixed: \(destinationURL.path)\n")
                DispatchQueue.main.async {
                    self.status = .completed
                    self.completion?(true)
                    self.completion = nil
                }
            } else {
                handleDownloadError("Failed to fix permissions for binary")
            }
        } catch {
            handleDownloadError("Move error: \(error.localizedDescription)")
        }
    }
    
    fileprivate func handleDownloadError(_ errorMsg: String) {
        appendLog("Download error: \(errorMsg)\n")
        DispatchQueue.main.async {
            self.status = .error(errorMsg)
            self.completion?(false)
            self.completion = nil
        }
    }
    
    fileprivate func handleProgress(_ progress: Double) {
        DispatchQueue.main.async {
            self.status = .downloading(progress: progress)
        }
    }
    
    func appendLog(_ message: String) {
        TunnelManager.shared.appendLog(message)
    }
}

class InstaTunnelDownloadDelegate: NSObject, URLSessionDownloadDelegate {
    let downloader: InstaTunnelDownloader
    
    init(downloader: InstaTunnelDownloader) {
        self.downloader = downloader
    }
    
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        if totalBytesExpectedToWrite > 0 {
            let progress = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
            downloader.handleProgress(progress)
        }
    }
    
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        if let response = downloadTask.response as? HTTPURLResponse {
            if response.statusCode >= 400 {
                downloader.handleDownloadError("HTTP \(response.statusCode)")
                return
            }
        }
        
        let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent("instatunnel_dl_\(UUID().uuidString)")
        try? FileManager.default.removeItem(at: tempUrl)
        do {
            try FileManager.default.copyItem(at: location, to: tempUrl)
            downloader.handleDownloadFinish(localURL: tempUrl)
        } catch {
            downloader.handleDownloadError("Failed to copy temp file: \(error.localizedDescription)")
        }
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            downloader.handleDownloadError(error.localizedDescription)
        }
    }
}

enum TunnelStatus: Equatable {
    case stopped
    case starting
    case running(url: String)
    case error(String)
    
    var isRunning: Bool {
        if case .running = self { return true }
        return false
    }
}

class TunnelManager: ObservableObject {
    static let shared = TunnelManager()
    
    private init() {
        NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { _ in
            self.stop()
        }
    }
    
    @Published var status: TunnelStatus = .stopped
    @Published var logs: String = ""
    
    private var process: Process?
    private var outputPipe: Pipe?
    private var errorPipe: Pipe?
    private var retryCount = 0
    private let maxRetries = 3
    private var isRetrying = false
    
    private let urlRegex = try! NSRegularExpression(pattern: #"(https:\/\/[a-zA-Z0-9\-\.]+\.instatunnel\.my)"#, options: [])
    
    func start(port: Int, subdomain: String = "") {
        if logs.isEmpty { appendLog("Starting InstaTunnel...\n") }
        
        // Allow starting if stopped or in an error state
        let canStart: Bool
        switch status {
        case .stopped, .error: canStart = true
        default: canStart = false
        }
        
        guard canStart else { return }
        
        guard InstaTunnelDownloader.shared.isInstalled() else {
            let errorMsg = I18N.shared.t("instatunnel_not_installed")
            appendLog("Error: \(errorMsg)\n")
            self.status = .error(errorMsg)
            return
        }
        
        let binaryPath = InstaTunnelDownloader.shared.localInstaTunnelPath
        
        checkPortAccessibility(port: port) { [weak self] accessible in
            guard let self = self else { return }
            if !accessible {
                DispatchQueue.main.async {
                    let msg = String(format: I18N.shared.t("port_not_accessible"), port)
                    self.appendLog("[ERROR] \(msg)\n")
                    self.status = .error(msg)
                }
                return
            }
            
            if !isRetrying {
                self.retryCount = 0
            }
            self.launchProcess(binaryPath: binaryPath, port: port, subdomain: subdomain)
        }
    }
    
    private func launchProcess(binaryPath: String, port: Int, subdomain: String) {
        let executableURL = URL(fileURLWithPath: binaryPath)
        
        DispatchQueue.main.async {
            self.status = .starting
            self.logs = ""
            self.appendLog("Starting InstaTunnel from: \(executableURL.path)\n")
            
            let fm = FileManager.default
            if !fm.fileExists(atPath: executableURL.path) {
                self.appendLog("[ERROR] Binary not found at path: \(executableURL.path)\n")
            }
        }
        
        let process = Process()
        self.process = process
        process.executableURL = executableURL
        process.currentDirectoryURL = executableURL.deletingLastPathComponent()
        
        // Setup environment
        let env = ProcessInfo.processInfo.environment
        process.environment = env
        
        var args = [String(port)]
        if !subdomain.isEmpty {
            args.append(contentsOf: ["--subdomain", subdomain])
        }
        process.arguments = args
        
        
        let outPipe = Pipe()
        let errPipe = Pipe()
        process.standardOutput = outPipe
        process.standardError = errPipe
        
        setupPipeReader(outPipe)
        setupPipeReader(errPipe)
        
        process.terminationHandler = { [weak self] p in
            DispatchQueue.main.async {
                let status = p.terminationStatus
                self?.process = nil
                self?.appendLog("Process terminated with exit code: \(status)\n")
                if status != 0 {
                    self?.status = .error("Exit code \(status)")
                } else {
                    self?.status = .stopped
                }
            }
        }
        
        do {
            try process.run()
        } catch {
            DispatchQueue.main.async {
                let msg = error.localizedDescription
                self.appendLog("[ERROR] Failed to start InstaTunnel: \(msg)\n")
                self.status = .error(msg)
                self.process = nil
            }
        }
    }
    
    private func handleRetry(port: Int, subdomain: String) {
        guard retryCount < maxRetries else {
            self.isRetrying = false
            self.retryCount = 0
            return
        }
        
        retryCount += 1
        isRetrying = true
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.appendLog("Retrying (\(self.retryCount)/\(self.maxRetries))...\n")
            self.start(port: port, subdomain: subdomain)
        }
    }
    
    func stop() {
        process?.terminate()
        process = nil
        status = .stopped
        
        // Sync to iCloud as offline
        ICloudManager.shared.syncServer(url: nil, isOffline: true)
    }
    
    private func setupPipeReader(_ pipe: Pipe) {
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let str = String(data: data, encoding: .utf8), !str.isEmpty {
                DispatchQueue.main.async {
                    self?.appendLog(str)
                    self?.parseUrl(from: str)
                }
            }
        }
    }
    
    private func parseUrl(from text: String) {
        if text.contains("subdomain already taken") {
            DispatchQueue.main.async {
                self.appendLog("Subdomain already taken. Will retry in 2 seconds...\n")
                if let p = self.process, let args = p.arguments, let portStr = args.first, let port = Int(portStr) {
                    var subdomain = ""
                    if args.count >= 3 && args[1] == "--subdomain" {
                        subdomain = args[2]
                    }
                    self.stop()
                    self.handleRetry(port: port, subdomain: subdomain)
                }
            }
            return
        }
        
        let range = NSRange(text.startIndex..., in: text)
        if let match = urlRegex.firstMatch(in: text, options: [], range: range) {
            // First capture group is the URL
            if match.numberOfRanges > 1, let urlRange = Range(match.range(at: 1), in: text) {
                let url = String(text[urlRange])
                if case .starting = self.status {
                    self.status = .running(url: url)
                    self.retryCount = 0
                    self.isRetrying = false
                    
                    // Sync to iCloud
                    ICloudManager.shared.syncServer(url: url, isOffline: false)
                }
            }
        }
    }
    
    func appendLog(_ message: String) {
        DispatchQueue.main.async {
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm:ss"
            let timestamp = "[\(formatter.string(from: Date()))] "
            self.logs += "\(timestamp)\(message)"
            
            if self.logs.count > 10000 {
                self.logs = String(self.logs.suffix(5000))
            }
        }
    }
    
    private func checkPortAccessibility(port: Int, completion: @escaping (Bool) -> Void) {
        let url = URL(string: "http://localhost:\(port)")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 2.0
        
        let task = URLSession.shared.dataTask(with: request) { _, response, error in
            if error != nil {
                completion(false)
            } else {
                completion(true)
            }
        }
        task.resume()
    }
}

struct TunnelView: View {
    @StateObject var i18n = I18N.shared
    @StateObject var tunnelManager = TunnelManager.shared
    @StateObject var downloader = InstaTunnelDownloader.shared
    
    @AppStorage("tunnelSubdomain") private var tunnelSubdomain: String = ""
    @AppStorage("port") private var localPort: Int = 4210
    
    @State private var showingErrorAlert = false
    @State private var errorMessage = ""
    
    var body: some View {
        VStack(spacing: 20) {
            statusCard
            optionsCard
            logsSection
        }
        .frame(minWidth: 500, minHeight: 400)
        .overlay {
            downloadOverlay
        }
        .alert(i18n.t("download_instatunnel_title"), isPresented: $downloader.showingConfirmation) {
            Button(i18n.t("download")) {
                downloader.confirmDownload()
            }
            Button(i18n.t("cancel"), role: .cancel) {
                downloader.status = .idle
            }
        } message: {
            Text(i18n.t("download_instatunnel_message"))
        }
        .alert(i18n.t("error"), isPresented: $showingErrorAlert) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(errorMessage)
        }
    }
    
    @ViewBuilder
    private var statusCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 12, height: 12)
                        .shadow(color: statusColor.opacity(0.5), radius: 4)
                    Text("\(i18n.t("status")): \(statusText)")
                        .font(.system(size: 20, weight: .bold))
                }
                
                if case .running(let url) = tunnelManager.status, let urlObj = URL(string: url) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(i18n.t("public_url"))
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Link(destination: urlObj) {
                            Text(url)
                                .font(.subheadline)
                                .foregroundColor(.blue)
                                .underline()
                        }
                    }
                }
            }
            
            Spacer()
            
            let isBusy = tunnelManager.status.isRunning || tunnelManager.status == .starting
            
            Button(action: {
                if isBusy {
                    tunnelManager.stop()
                } else {
                    startTunnel()
                }
            }) {
                HStack(spacing: 4) {
                    Image(systemName: isBusy ? "stop.fill" : "play.fill")
                        .font(.system(size: 11))
                    Text(isBusy ? i18n.t("stop") : i18n.t("start"))
                        .font(.system(size: 13, weight: .semibold))
                }
                .frame(width: 70, height: 26)
            }
            .buttonStyle(.borderedProminent)
            .tint(isBusy ? .red : .blue)
            .controlSize(.small)
            .disabled(InstaTunnelDownloader.shared.status.isBusy)
        }
        .padding()
        .background(Color(NSColor.controlBackgroundColor).opacity(0.8))
        .cornerRadius(12)
    }
    
    @ViewBuilder
    private var optionsCard: some View {
        VStack(alignment: .leading, spacing: 15) {
            VStack(alignment: .leading, spacing: 4) {
                Text(i18n.t("tunnel_quick_desc"))
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                HStack(spacing: 4) {
                    Text(i18n.t("view_details") + ":")
                    Link("https://instatunnel.my", destination: URL(string: "https://instatunnel.my")!)
                        .foregroundColor(.blue)
                }
                .font(.caption)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            
            VStack(alignment: .leading, spacing: 8) {
                Text(i18n.t("tunnel_subdomain"))
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                TextField(i18n.t("tunnel_subdomain_placeholder"), text: $tunnelSubdomain)
                    .textFieldStyle(.roundedBorder)
            }
            .disabled(tunnelManager.status.isRunning || tunnelManager.status == .starting)
            
            Divider()
                .padding(.vertical, 4)
            
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(i18n.t("icloud_sync"))
                            .font(.headline)
                        Text(i18n.t("icloud_sync_desc"))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    
                    if let _ = ICloudManager.shared.getUbiquityURL() {
                        Button(action: {
                            ICloudManager.shared.openICloudFolder()
                        }) {
                            Image(systemName: "folder.fill")
                                .help(i18n.t("open_icloud_folder"))
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 8)
                    }
                    
                    Toggle("", isOn: Binding(
                        get: { UserDefaults.standard.bool(forKey: "icloudSyncEnabled") },
                        set: { newValue in
                            UserDefaults.standard.set(newValue, forKey: "icloudSyncEnabled")
                            if newValue {
                                // Trigger immediate sync
                                if case .running(let url) = tunnelManager.status {
                                    ICloudManager.shared.syncServer(url: url, isOffline: false)
                                } else {
                                    ICloudManager.shared.syncServer(url: nil, isOffline: true)
                                }
                            } else {
                                // Remove from cloud immediately
                                ICloudManager.shared.removeFromCloud()
                            }
                        }
                    ))
                    .toggleStyle(.switch)
                    .labelsHidden()
                }
            }
        }
        .padding()
        .background(Color(NSColor.controlBackgroundColor).opacity(0.8))
        .cornerRadius(12)
    }
    
    @ViewBuilder
    private var logsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(i18n.t("logs"), systemImage: "terminal")
                    .font(.caption.bold())
                    .foregroundColor(.secondary)
                Spacer()
                Button(i18n.t("clear_logs")) {
                    tunnelManager.logs = ""
                }
                .buttonStyle(.plain)
                .font(.caption)
                .foregroundColor(.blue)
                
                Text("|")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Button(i18n.t("reset_env")) {
                    downloader.resetInstallation()
                }
                .buttonStyle(.plain)
                .font(.caption)
                .foregroundColor(.red)
            }
            
            TunnelLogViewer(logs: tunnelManager.logs)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.secondary.opacity(0.1), lineWidth: 1)
                )
        }
    }
    
    @ViewBuilder
    private var downloadOverlay: some View {
        if downloader.status != .idle && downloader.status != .completed {
            ZStack {
                Color.black.opacity(0.4)
                    .edgesIgnoringSafeArea(.all)
                VStack(spacing: 20) {
                    if case .downloading(let progress) = downloader.status {
                        ProgressView(value: progress)
                            .progressViewStyle(.linear)
                            .frame(width: 200)
                    } else {
                        ProgressView()
                    }
                    
                    Text(downloader.status.description)
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                    
                    if case .error = downloader.status {
                        Button("OK") {
                            downloader.status = .idle
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .padding(40)
                .background(Color.gray.opacity(0.9))
                .cornerRadius(20)
                .frame(maxWidth: 300)
            }
        }
    }
    
    @ViewBuilder
    private var statusBadge: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)
            Text(statusText)
                .font(.headline)
        }
    }
    
    private var statusColor: Color {
        switch tunnelManager.status {
        case .stopped: return .gray
        case .starting: return .blue
        case .running: return .green
        case .error: return .red
        }
    }
    
    private var statusText: String {
        switch tunnelManager.status {
        case .stopped: return i18n.t("stopped")
        case .starting: return i18n.t("starting")
        case .running: return i18n.t("running")
        case .error(let msg): return "\(i18n.t("error")): \(msg)"
        }
    }
    
    private func startTunnel() {
        if !ProcessManager.shared.isRunning {
             self.errorMessage = i18n.t("service_not_running_message")
             self.showingErrorAlert = true
             return
        }
        
        if !downloader.isInstalled() {
            downloader.checkAndDownloadIfNeeded { success in
                if success {
                    tunnelManager.start(port: localPort, subdomain: tunnelSubdomain)
                }
            }
        } else {
            tunnelManager.start(port: localPort, subdomain: tunnelSubdomain)
        }
    }
    
    private func copyToClipboard(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }
}

struct TunnelLogViewer: View {
    var logs: String
    
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(logs)
                        .font(.custom("Menlo", size: 12))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .id("bottom")
                }
            }
            .background(Color(NSColor.textBackgroundColor))
            .onChange(of: logs) { _ in
                withAnimation {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
            .onAppear {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }
}

// MARK: - iCloud Synchronization Manager

struct CloudServer: Codable, Identifiable {
    var id: String
    var name: String
    var url: String
    var username: String?
    var isOffline: Bool?
    var isLauncher: Bool?
    
    enum CodingKeys: String, CodingKey {
        case id, name, url, username, isOffline, isLauncher
    }
}

class ICloudManager: ObservableObject {
    static let shared = ICloudManager()
    
    private let legacyFileName = "servers_v2.json"
    
    func getUbiquityURL() -> URL? {
        return FileManager.default.url(forUbiquityContainerIdentifier: "iCloud.com.ct106.flux.shared")?.appendingPathComponent("Documents")
    }
    
    func openICloudFolder() {
        if let url = getUbiquityURL() {
            NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: url.path)
        }
    }
    
    private var ubiquityURL: URL? {
        getUbiquityURL()
    }
    
    private var localServerID: String {
        if let id = UserDefaults.standard.string(forKey: "icloud_local_server_id") {
            return id
        }
        let newID = UUID().uuidString
        UserDefaults.standard.set(newID, forKey: "icloud_local_server_id")
        return newID
    }
    
    // server_<localID>.json
    private var localFileName: String {
        return "server_\(localServerID).json"
    }
    
    private init() {
        createDirectoryIfNeeded()
    }
    
    private func createDirectoryIfNeeded() {
        guard let url = ubiquityURL else { return }
        if !FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        }
    }
    
    func syncServer(url: String?, isOffline: Bool = false) {
        guard UserDefaults.standard.bool(forKey: "icloudSyncEnabled") else { return }
        
        let i18n = I18N.shared
        guard let containerURL = ubiquityURL else {
            TunnelManager.shared.appendLog("[iCloud] \(i18n.t("icloud_unavailable"))\n")
            return
        }
        
        TunnelManager.shared.appendLog("[iCloud] \(i18n.t("icloud_sync_starting"))\n")
        
        // 1. Sync to NEW individual file
        let fileURL = containerURL.appendingPathComponent(localFileName)
        let coordinator = NSFileCoordinator(filePresenter: nil)
        
        let (username, _, _) = ConfigManager.shared.loadConfig()
        let computerName = Host.current().localizedName ?? "My Mac"
        
        let server = CloudServer(
            id: localServerID,
            name: computerName,
            url: url ?? "",
            username: username,
            isOffline: isOffline,
            isLauncher: true
        )
        
        coordinator.coordinate(writingItemAt: fileURL, options: [], error: nil) { writeURL in
            if let data = try? JSONEncoder().encode(server) {
                try? data.write(to: writeURL)
                TunnelManager.shared.appendLog("[iCloud] \(i18n.t("icloud_sync_success"))\n")
            }
        }
        
        // 2. Clean up from legacy file (do this only once or until removed)
        removeFromLegacyCloud()
    }
    
    func removeFromCloud() {
        let i18n = I18N.shared
        guard let containerURL = ubiquityURL else { return }
        
        // 1. Remove NEW individual file
        let fileURL = containerURL.appendingPathComponent(localFileName)
        let coordinator = NSFileCoordinator(filePresenter: nil)
        coordinator.coordinate(writingItemAt: fileURL, options: [.forDeleting], error: nil) { writeURL in
            try? FileManager.default.removeItem(at: writeURL)
            TunnelManager.shared.appendLog("[iCloud] \(i18n.t("icloud_sync_removed"))\n")
        }
        
        // 2. Also ensure legacy entry is gone
        removeFromLegacyCloud()
    }
    
    private func removeFromLegacyCloud() {
        guard let containerURL = ubiquityURL else { return }
        let fileURL = containerURL.appendingPathComponent(legacyFileName)
        
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var error: NSError?
        coordinator.coordinate(writingItemAt: fileURL, options: [], error: &error) { writeURL in
            guard FileManager.default.fileExists(atPath: writeURL.path) else { return }
            
            if let data = try? Data(contentsOf: writeURL),
               var servers = try? JSONDecoder().decode([CloudServer].self, from: data) {
                
                let originalCount = servers.count
                servers.removeAll(where: { $0.id == localServerID })
                
                if servers.count != originalCount {
                    if let newData = try? JSONEncoder().encode(servers) {
                        try? newData.write(to: writeURL)
                        print("Removed legacy iCloud entry from servers_v2.json")
                    }
                }
            }
        }
    }
}
