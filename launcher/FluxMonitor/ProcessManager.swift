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
        // 1. Check bundled Resources (Legacy fallback)
        if let bundledNode = Bundle.main.url(forResource: "node", withExtension: nil)?.path {
            if FileManager.default.isExecutableFile(atPath: bundledNode) && isNodeVersionCompatible(at: bundledNode) {
                return bundledNode
            }
        }
        
        // 2. Check Local App Support "bin" folder (Auto-installed by NodeInstaller)
        let localPath = NodeInstaller.shared.localNodePath
        if FileManager.default.fileExists(atPath: localPath) && 
           FileManager.default.isExecutableFile(atPath: localPath) &&
           isNodeVersionCompatible(at: localPath) {
            return localPath
        }
        
        // 3. Resolve user's real PATH from login shell and search for node
        if let resolvedPath = findNodeFromShellPATH() {
            return resolvedPath
        }
        
        // 4. Scan well-known version manager directories as fallback
        if let vmPath = findNodeFromVersionManagers() {
            return vmPath
        }
        
        return nil
    }
    
    /// Launch the user's login shell to resolve the full PATH, then search each directory for node.
    /// This covers Homebrew, system installs, and version managers that modify shell profiles.
    private func findNodeFromShellPATH() -> String? {
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        
        let p = Process()
        p.executableURL = URL(fileURLWithPath: shell)
        // Use login + interactive-like mode so .zprofile/.bash_profile etc. are sourced
        p.arguments = ["-l", "-c", "echo $PATH"]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = Pipe()
        
        do {
            try p.run()
            p.waitUntilExit()
        } catch {
            appendLog("Failed to resolve PATH from shell: \(error.localizedDescription)\n")
            return nil
        }
        
        guard p.terminationStatus == 0,
              let data = try? pipe.fileHandleForReading.readToEnd(),
              let pathString = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !pathString.isEmpty else {
            return nil
        }
        
        var seen = Set<String>()
        for dir in pathString.split(separator: ":").map(String.init) {
            guard seen.insert(dir).inserted else { continue }
            let candidate = (dir as NSString).appendingPathComponent("node")
            if FileManager.default.isExecutableFile(atPath: candidate) && isNodeVersionCompatible(at: candidate) {
                return candidate
            }
        }
        return nil
    }
    
    /// Scan well-known version manager install directories for a compatible node binary.
    /// Covers nvm, fnm, volta, mise, asdf, n, and nodenv without hardcoding full paths.
    private func findNodeFromVersionManagers() -> String? {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        
        let candidates: [(dir: String, glob: String)] = [
            ("\(home)/.nvm/versions/node", "*/bin/node"),
            ("\(home)/.volta/bin", "node"),
            ("\(home)/.fnm/node-versions", "*/installation/bin/node"),
            ("\(home)/.local/share/mise/installs/node", "*/bin/node"),
            ("\(home)/.asdf/installs/nodejs", "*/bin/node"),
            ("\(home)/.nodenv/versions", "*/bin/node"),
            ("/usr/local/n/versions/node", "*/bin/node"),
        ]
        
        let fm = FileManager.default
        var bestPath: String?
        var bestMajor = 0
        
        for (dir, globPattern) in candidates {
            guard fm.fileExists(atPath: dir) else { continue }
            
            let parts = globPattern.split(separator: "/", maxSplits: 1)
            if parts.first == "*" {
                // Enumerate subdirectories, pick the highest compatible version
                guard let subdirs = try? fm.contentsOfDirectory(atPath: dir) else { continue }
                let suffix = parts.count > 1 ? "/\(parts[1])" : ""
                for sub in subdirs.sorted().reversed() {
                    let candidate = "\(dir)/\(sub)\(suffix)"
                    if fm.isExecutableFile(atPath: candidate),
                       let major = nodeMainVersion(at: candidate), major >= 18, major > bestMajor {
                        bestPath = candidate
                        bestMajor = major
                    }
                }
            } else {
                let candidate = "\(dir)/\(globPattern)"
                if fm.isExecutableFile(atPath: candidate),
                   let major = nodeMainVersion(at: candidate), major >= 18, major > bestMajor {
                    bestPath = candidate
                    bestMajor = major
                }
            }
        }
        
        if let path = bestPath, isNodeVersionCompatible(at: path) {
            return path
        }
        return nil
    }
    
    /// Quickly extract the major version number from a node binary (returns nil on failure).
    private func nodeMainVersion(at path: String) -> Int? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: path)
        p.arguments = ["-v"]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = Pipe()
        do {
            try p.run()
            p.waitUntilExit()
            guard p.terminationStatus == 0,
                  let data = try? pipe.fileHandleForReading.readToEnd(),
                  let ver = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) else {
                return nil
            }
            let clean = ver.trimmingCharacters(in: CharacterSet.decimalDigits.inverted)
            if let majorStr = clean.split(separator: ".").first, let major = Int(majorStr) {
                return major
            }
        } catch {}
        return nil
    }

    private func isNodeVersionCompatible(at path: String) -> Bool {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: path)
        p.arguments = ["-v"]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        do {
            try p.run()
            p.waitUntilExit()
            if p.terminationStatus != 0 { return false }
            
            if let data = try? pipe.fileHandleForReading.readToEnd(),
               let versionStr = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) {
                // versionStr is like "v20.19.5" or "v14.17.0"
                let cleanVersion = versionStr.trimmingCharacters(in: CharacterSet.decimalDigits.inverted)
                let components = cleanVersion.split(separator: ".")
                if let majorStr = components.first, let major = Int(majorStr) {
                    if major < 18 {
                        appendLog("Found Node.js \(versionStr) at \(path), but Next.js 15+ requires Node >= 18.\n")
                        return false
                    }
                    return true
                }
            }
            return false
        } catch {
            return false
        }
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
