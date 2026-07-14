import Foundation
import AppKit

class ProcessManager: ObservableObject {
    static let shared = ProcessManager()
    
    private var process: Process?
    private var externalPID: Int?
    @Published var isRunning = false
    private var startCount = 0 // Safety against infinite recursion
    @Published var logs = "" {
        didSet {
            // Keep logs to a reasonable size in memory
            if logs.count > 50000 {
                logs = String(logs.suffix(25000))
            }
        }
    }
    
    private var logFileUrl: URL {
        let bundleID = Bundle.main.bundleIdentifier!
        let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent(bundleID, isDirectory: true)
        try? FileManager.default.createDirectory(at: appSupportDir, withIntermediateDirectories: true)
        return appSupportDir.appendingPathComponent("service.log")
    }
    
    private let logPipe = Pipe()
    
    init() {
        // Load initial logs from file
        if let savedLogs = try? String(contentsOf: logFileUrl, encoding: .utf8) {
            self.logs = savedLogs
            if self.logs.count > 50000 {
                self.logs = String(self.logs.suffix(25000))
            }
        }
        
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
        
        let port = UserDefaults.standard.integer(forKey: "port") != 0 ? UserDefaults.standard.integer(forKey: "port") : 4210
        
        if let pid = getPIDForPort(port) {
            if isFluxMonitorProcess(pid: pid) {
                appendLog("Detected existing Flux Monitor service (PID: \(pid)). Taking over.\n")
                self.externalPID = pid
                self.isRunning = true
                DispatchQueue.main.async {
                    (NSApp.delegate as? AppDelegate)?.updateMenu()
                }
                fetchAptabaseKey(port: port)
                return
            } else {
                showPortConflictAlert(port: port, pid: pid)
                return
            }
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
            fetchAptabaseKey(port: port)
        } catch {
            appendLog("ProcessManager: Failed to run process: \(error.localizedDescription)\n")
            isRunning = false
            self.process = nil
        }
    }
    
    private func fetchAptabaseKey(port: Int) {
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/analytics") else { return }
        
        DispatchQueue.global().asyncAfter(deadline: .now() + 3.0) {
            let task = URLSession.shared.dataTask(with: url) { data, response, error in
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let key = json["key"] as? String,
                      !key.isEmpty else {
                    return
                }
                AptabaseTracker.shared.setup(appKey: key)
                AptabaseTracker.shared.trackEvent("本地服务启动")
            }
            task.resume()
        }
    }
    
    func stop() {
        appendLog("ProcessManager: stop() called\n")
        if let process = self.process, process.isRunning {
            process.terminate()
            appendLog("Sent terminate signal\n")
        } else if let extPid = self.externalPID {
            killProcess(pid: extPid)
            appendLog("Sent kill signal to external process \(extPid)\n")
            self.externalPID = nil
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
                
                // Append to file
                if let data = formattedMessage.data(using: .utf8) {
                    if let fileHandle = try? FileHandle(forWritingTo: self.logFileUrl) {
                        fileHandle.seekToEndOfFile()
                        fileHandle.write(data)
                        fileHandle.closeFile()
                    } else {
                        try? data.write(to: self.logFileUrl)
                    }
                }
            }
        }
    }
    
    func clearLogs() {
        DispatchQueue.main.async {
            self.logs = ""
            try? "".write(to: self.logFileUrl, atomically: true, encoding: .utf8)
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
    
    private func getPIDForPort(_ port: Int) -> Int? {
        let task = Process()
        task.launchPath = "/usr/sbin/lsof"
        // Only a listening socket can block the service from binding this port.
        // Without this filter, lsof also returns clients connected to the local
        // service (including this app's analytics request), which can make Flux
        // Monitor report its own process as a port conflict.
        task.arguments = ["-t", "-iTCP:\(port)", "-sTCP:LISTEN", "-n", "-P"]
        let pipe = Pipe()
        task.standardOutput = pipe
        
        do {
            try task.run()
            task.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), !output.isEmpty {
                if let firstPidStr = output.components(separatedBy: .newlines).first, let pid = Int(firstPidStr) {
                    return pid
                }
            }
        } catch {
            return nil
        }
        return nil
    }
    
    private func getProcessInfo(pid: Int) -> String? {
        let task = Process()
        task.launchPath = "/bin/ps"
        task.arguments = ["-p", "\(pid)", "-ww", "-o", "command="]
        let pipe = Pipe()
        task.standardOutput = pipe
        
        do {
            try task.run()
            task.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), !output.isEmpty {
                return output
            }
        } catch {
            return nil
        }
        return nil
    }

    private func isFluxMonitorProcess(pid: Int) -> Bool {
        let task = Process()
        task.launchPath = "/usr/sbin/lsof"
        task.arguments = ["-p", "\(pid)", "-a", "-d", "cwd", "-F", "n"]
        let pipe = Pipe()
        task.standardOutput = pipe
        
        do {
            try task.run()
            task.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: data, encoding: .utf8) {
                if output.contains("Flux Monitor") || output.contains("FluxMonitor") || output.contains("flux-monitor") {
                    return true
                }
            }
        } catch {
        }
        
        if let cmd = getProcessInfo(pid: pid) {
            if cmd.contains("next-server") || cmd.contains("server.js") {
                return true
            }
        }
        return false
    }
    
    private func killProcess(pid: Int) {
        let task = Process()
        task.launchPath = "/bin/kill"
        task.arguments = ["-9", "\(pid)"]
        try? task.run()
        task.waitUntilExit()
    }
    
    private func showPortConflictAlert(port: Int, pid: Int) {
        let processInfo = getProcessInfo(pid: pid) ?? "Unknown Process"
        DispatchQueue.main.async {
            let alert = NSAlert()
            let translatedTitle = I18N.shared.t("port_conflict")
            alert.messageText = translatedTitle == "port_conflict" ? "Port Conflict (端口冲突)" : translatedTitle
            
            let infoText = "端口 (Port) \(port) 正被其他进程占用 (is being used by another process):\n\nPID: \(pid)\nCommand: \(processInfo)\n\n您要强行终止该进程，还是修改端口？\n(Do you want to forcefully terminate it or change your port?)"
            
            alert.informativeText = infoText
            alert.addButton(withTitle: "强行终止 (Force Terminate)")
            alert.addButton(withTitle: "修改端口 (Change Port)")
            
            let response = alert.runModal()
            if response == .alertFirstButtonReturn {
                self.killProcess(pid: pid)
                self.appendLog("Forcefully terminated PID \(pid).\n")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    self.start()
                }
            } else {
                self.appendLog("Port conflict not resolved. Service start aborted.\n")
                self.isRunning = false
            }
        }
    }
}
