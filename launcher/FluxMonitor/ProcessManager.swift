import Foundation
import AppKit

class ProcessManager: ObservableObject {
    static let shared = ProcessManager()
    
    private var process: Process?
    @Published var isRunning = false
    private var startCount = 0 // Safety against infinite recursion
    @Published var logs = "" {
        didSet {
            // Keep logs to a reasonable size
            if logs.count > 50000 {
                logs = String(logs.suffix(25000))
            }
        }
    }
    
    private let logPipe = Pipe()
    
    init() {
        NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { _ in
            self.stop()
        }
    }
    
    func findNodePath() -> String? {
        // Use the comprehensive detection logic in NodeInstaller
        return NodeInstaller.shared.findSuitableNodePath()
    }

    func start() {
        appendLog("ProcessManager: start() called\n")
        if isRunning {
            appendLog("Service is already running.\n")
            return
        }
        
        startCount += 1
        if startCount > 3 {
            appendLog("[ERROR] Critical: Detected infinite start loop. Aborting.\n")
            startCount = 0
            return
        }
        
        guard let serverPath = Bundle.main.url(forResource: "server", withExtension: "js")?.path else {
            appendLog("Error: Could not find bundled server.js in Resources\n")
            return
        }
        
        let nodePathFound = findNodePath()
        if let nodePath = nodePathFound {
            startWithNode(nodePath: nodePath, serverPath: serverPath)
            startCount = 0 // Reset on success
        } else {
            appendLog("Node.js not found. Starting automatic installation...\n")
            DispatchQueue.main.async {
                (NSApp.delegate as? AppDelegate)?.showSettings()
            }
            NodeInstaller.shared.installIfNeeded { success in
                if success {
                    DispatchQueue.main.async {
                        self.start()
                    }
                } else {
                    self.appendLog("[ERROR] Automatic Node.js installation failed.\n")
                }
            }
        }
    }

    private func startWithNode(nodePath: String, serverPath: String) {
        appendLog("Using Node.js at: \(nodePath)\n")
        let newProcess = Process()
        self.process = newProcess
        newProcess.executableURL = URL(fileURLWithPath: nodePath)
        newProcess.currentDirectoryURL = Bundle.main.resourceURL
        
        var env = ProcessInfo.processInfo.environment
        let port = UserDefaults.standard.integer(forKey: "port") != 0 ? UserDefaults.standard.integer(forKey: "port") : 4210
        env["PORT"] = "\(port)"
        env["NODE_ENV"] = "production"
        
        let bundleID = Bundle.main.bundleIdentifier!
        let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent(bundleID, isDirectory: true)
        try? FileManager.default.createDirectory(at: appSupportDir, withIntermediateDirectories: true)
        
        let configFileUrl = appSupportDir.appendingPathComponent("config.json")
        if !FileManager.default.fileExists(atPath: configFileUrl.path) {
            appendLog("Error: config.json not found. Please complete setup in the Welcome Dialog.\n")
            return
        }
        
        env["CONFIG_PATH"] = configFileUrl.path
        
        // Load additional secrets from config for the middleware (Edge Runtime doesn't have FS)
        if let configData = try? Data(contentsOf: configFileUrl),
           let json = try? JSONSerialization.jsonObject(with: configData) as? [String: Any],
           let secret = json["jwtSecret"] as? String {
            env["JWT_SECRET"] = secret
        } else {
            env["JWT_SECRET"] = "CHANGE_ME_TO_A_LONG_RANDOM_STRING" // Fallback
        }
        
        // Final sanity check for credentials
        let (u, p, _) = ConfigManager.shared.loadConfig()
        if (u?.isEmpty ?? true) || (p?.isEmpty ?? true) {
            appendLog("[ERROR] Cannot start service: Username or password is not set.\n")
            return
        }

        newProcess.environment = env
        newProcess.arguments = [serverPath]
        
        appendLog("Launching node with server.js...\n")
        appendLog("Working Directory: \(newProcess.currentDirectoryURL?.path ?? "unknown")\n")
        appendLog("Command: \(newProcess.launchPath ?? "node") \(newProcess.arguments?.joined(separator: " ") ?? "")\n")

        let outPipe = Pipe()
        let errPipe = Pipe()
        newProcess.standardOutput = outPipe
        newProcess.standardError = errPipe
        
        func setupPipeReader(_ pipe: Pipe, isError: Bool) {
            pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                if let str = String(data: data, encoding: .utf8), !str.isEmpty {
                    DispatchQueue.main.async {
                        self?.appendLog(isError ? "[STDERR] \(str)" : str)
                    }
                }
            }
        }
        
        setupPipeReader(outPipe, isError: false)
        setupPipeReader(errPipe, isError: true)
        
        newProcess.terminationHandler = { [weak self] p in
            // Clear handlers
            outPipe.fileHandleForReading.readabilityHandler = nil
            errPipe.fileHandleForReading.readabilityHandler = nil
            
            DispatchQueue.main.async {
                let status = p.terminationStatus
                self?.appendLog("Process terminated with exit code: \(status)\n")
                self?.isRunning = false
                self?.process = nil
                self?.appendLog("Service stopped (Exit Code: \(status))\n")
                (NSApp.delegate as? AppDelegate)?.updateMenu()
            }
        }
        
        if !checkNodeHealth() {
            appendLog("Node health check failed. Attempting to re-install...\n")
            DispatchQueue.main.async {
                (NSApp.delegate as? AppDelegate)?.showSettings()
            }
            NodeInstaller.shared.installIfNeeded(force: true) { success in
                if success {
                    DispatchQueue.main.async {
                        self.start()
                    }
                } else {
                    self.appendLog("[ERROR] Automatic Node.js installation failed.\n")
                }
            }
            return
        }
        
        do {
            try newProcess.run()
            isRunning = true
            appendLog("Service started on port \(port)...\n")
            DispatchQueue.main.async {
                (NSApp.delegate as? AppDelegate)?.updateMenu()
            }
        } catch {
            appendLog("ProcessManager: Failed to run process: \(error.localizedDescription)\n")
            isRunning = false
            self.process = nil
        }
    }
    
    func stop() {
        appendLog("ProcessManager: stop() called\n")
        if let process = self.process, process.isRunning {
            process.terminate()
            appendLog("Sent terminate signal\n")
        }
        // Force the flag update in case terminationHandler is delayed
        isRunning = false
        self.process = nil
    }
    
    func appendLog(_ message: String) {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let timestamp = "[\(formatter.string(from: Date()))] "
        
        if message.isEmpty { return }
        let lines = message.components(separatedBy: .newlines)
        var formattedMessage = ""
        for (index, line) in lines.enumerated() {
            if line.isEmpty && index == lines.count - 1 { continue }
            formattedMessage += "\(timestamp)\(line)\n"
        }
        
        if !formattedMessage.isEmpty {
            DispatchQueue.main.async {
                self.logs += formattedMessage
            }
        }
    }
    
    private func checkNodeHealth() -> Bool {
        guard let nodePath = findNodePath() else {
            appendLog("[ERROR] Node binary not found anywhere!\n")
            return false
        }
        
        // Final attempt to fix permissions before we try to run
        if !FileManager.default.isExecutableFile(atPath: nodePath) {
            if !NodeInstaller.shared.fixPermissions(at: nodePath) {
                appendLog("[ERROR] Could not fix permissions for health check.\n")
                return false
            }
        }

        let p = Process()
        p.executableURL = URL(fileURLWithPath: nodePath)
        p.arguments = ["-v"]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        
        do {
            try p.run()
            p.waitUntilExit()
            if p.terminationStatus != 0 {
                appendLog("[ERROR] Node binary check failed with exit code: \(p.terminationStatus)\n")
            }
            return p.terminationStatus == 0
        } catch {
            appendLog("[ERROR] Node health check execution error: \(error.localizedDescription)\n")
            return false
        }
    }
}
