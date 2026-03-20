import Foundation
import AppKit

class ProcessManager: ObservableObject {
    static let shared = ProcessManager()
    
    private var process: Process?
    @Published var isRunning = false
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
    
    func start() {
        print("🚀 ProcessManager: start() called")
        if isRunning {
            print("🚀 Service is already running.")
            return
        }
        
        guard let nodePath = Bundle.main.url(forResource: "node", withExtension: nil)?.path,
              let serverPath = Bundle.main.url(forResource: "server", withExtension: "js")?.path else {
            appendLog("Error: Could not find bundled node or server.js\n")
            print("ProcessManager: Missing resources")
            return
        }
        
        let newProcess = Process()
        self.process = newProcess
        newProcess.executableURL = URL(fileURLWithPath: nodePath)
        newProcess.currentDirectoryURL = URL(fileURLWithPath: (nodePath as NSString).deletingLastPathComponent)
        
        var env = ProcessInfo.processInfo.environment
        let port = UserDefaults.standard.integer(forKey: "port") != 0 ? UserDefaults.standard.integer(forKey: "port") : 7000
        env["PORT"] = "\(port)"
        env["NODE_ENV"] = "production"
        
        let bundleID = Bundle.main.bundleIdentifier!
        let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent(bundleID, isDirectory: true)
        try? FileManager.default.createDirectory(at: appSupportDir, withIntermediateDirectories: true)
        
        let configFileUrl = appSupportDir.appendingPathComponent("config.json")
        if !FileManager.default.fileExists(atPath: configFileUrl.path) {
            appendLog("Error: config.json not found. Please complete setup in the Welcome Dialog.\n")
            print("ProcessManager: Missing config.json")
            return
        }
        
        env["CONFIG_PATH"] = configFileUrl.path
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
                print("Process terminated with exit code: \(status)")
                self?.isRunning = false
                self?.process = nil
                self?.appendLog("Service stopped (Exit Code: \(status))\n")
                (NSApp.delegate as? AppDelegate)?.updateMenu()
            }
        }
        
        checkNodeHealth()
        
        do {
            try newProcess.run()
            isRunning = true
            appendLog("Service started on port \(port)...\n")
            DispatchQueue.main.async {
                (NSApp.delegate as? AppDelegate)?.updateMenu()
            }
        } catch {
            print("ProcessManager: Failed to run process: \(error)")
            appendLog("Failed to start service: \(error.localizedDescription)\n")
            isRunning = false
            self.process = nil
        }
    }
    
    func stop() {
        print("ProcessManager: stop() called")
        if let process = self.process, process.isRunning {
            process.terminate()
            print("Sent terminate signal")
        }
        // Force the flag update in case terminationHandler is delayed
        isRunning = false
        self.process = nil
    }
    
    private func appendLog(_ message: String) {
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
    
    private func checkNodeHealth() {
        guard let nodePath = Bundle.main.path(forResource: "node", ofType: nil) else {
            appendLog("[ERROR] Node binary not found in Resources!\n")
            return
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
            if let data = try pipe.fileHandleForReading.readToEnd() {
                if let str = String(data: data, encoding: .utf8) {
                    appendLog("Node binary check: \(str.trimmingCharacters(in: .whitespacesAndNewlines))\n")
                }
            }
        } catch {
            appendLog("[ERROR] Node binary check failed: \(error.localizedDescription)\n")
        }
    }
}
