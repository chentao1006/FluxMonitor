import SwiftUI
import Foundation
import Darwin

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

        guard binarySupportsNativeArchitecture(at: path) else {
            appendLog("Checking installation: binary does not support native \(instaTunnelArchitecture()) architecture\n")
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
        let arch = instaTunnelArchitecture()
        let urlString = "https://api.instatunnel.my/releases/instatunnel-darwin-\(arch)"
        
        guard let url = URL(string: urlString) else {
            self.status = .error("Invalid URL")
            completion(false)
            return
        }
        
        appendLog("Detected InstaTunnel architecture: \(arch)\n")
        appendLog("Downloading InstaTunnel from: \(urlString)\n")
        self.status = .downloading(progress: 0)
        self.completion = completion
        
        let config = URLSessionConfiguration.default
        let session = URLSession(configuration: config, delegate: InstaTunnelDownloadDelegate(downloader: self), delegateQueue: .main)
        self.session = session
        
        downloadTask = session.downloadTask(with: url)
        downloadTask?.resume()
    }

    private func instaTunnelArchitecture() -> String {
        var supportsARM64: Int32 = 0
        var valueSize = MemoryLayout<Int32>.size
        if sysctlbyname("hw.optional.arm64", &supportsARM64, &valueSize, nil, 0) == 0,
           supportsARM64 == 1 {
            return "arm64"
        }

        return "amd64"
    }

    private func binarySupportsNativeArchitecture(at path: String) -> Bool {
        guard let file = try? FileHandle(forReadingFrom: URL(fileURLWithPath: path)) else { return false }
        defer { try? file.close() }

        guard let data = try? file.read(upToCount: 4096), data.count >= 8 else { return false }
        let bytes = [UInt8](data)
        let expectedCPUType: UInt32 = instaTunnelArchitecture() == "arm64" ? 0x0100000c : 0x01000007

        func uint32(at offset: Int, bigEndian: Bool) -> UInt32? {
            guard offset >= 0, offset + 4 <= bytes.count else { return nil }
            if bigEndian {
                return (UInt32(bytes[offset]) << 24)
                    | (UInt32(bytes[offset + 1]) << 16)
                    | (UInt32(bytes[offset + 2]) << 8)
                    | UInt32(bytes[offset + 3])
            }
            return UInt32(bytes[offset])
                | (UInt32(bytes[offset + 1]) << 8)
                | (UInt32(bytes[offset + 2]) << 16)
                | (UInt32(bytes[offset + 3]) << 24)
        }

        let littleEndianMagic = uint32(at: 0, bigEndian: false)
        switch littleEndianMagic {
        case 0xfeedface, 0xfeedfacf:
            return uint32(at: 4, bigEndian: false) == expectedCPUType
        case 0xcefaedfe, 0xcffaedfe:
            return uint32(at: 4, bigEndian: true) == expectedCPUType
        default:
            break
        }

        let bigEndianMagic = uint32(at: 0, bigEndian: true)
        guard bigEndianMagic == 0xcafebabe || bigEndianMagic == 0xcafebabf,
              let architectureCount = uint32(at: 4, bigEndian: true) else { return false }

        let recordSize = bigEndianMagic == 0xcafebabf ? 32 : 20
        for index in 0..<Int(architectureCount) {
            if uint32(at: 8 + index * recordSize, bigEndian: true) == expectedCPUType {
                return true
            }
        }
        return false
    }
    
    fileprivate func handleDownloadFinish(localURL: URL) {
        appendLog("Download finished, preparing binary...\n")
        DispatchQueue.main.async {
            self.status = .extracting
        }
        
        let destinationURL = URL(fileURLWithPath: self.localInstaTunnelPath)
        
        do {
            guard binarySupportsNativeArchitecture(at: localURL.path) else {
                try? FileManager.default.removeItem(at: localURL)
                handleDownloadError("Downloaded binary does not support native \(instaTunnelArchitecture()) architecture")
                return
            }

            guard fixPermissions(at: localURL.path) else {
                try? FileManager.default.removeItem(at: localURL)
                handleDownloadError("Failed to fix permissions for binary")
                return
            }

            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try? FileManager.default.removeItem(at: destinationURL)
            }
            try FileManager.default.moveItem(at: localURL, to: destinationURL)
            
            appendLog("Binary architecture verified and installation completed: \(destinationURL.path)\n")
            DispatchQueue.main.async {
                self.status = .completed
                AptabaseTracker.shared.trackEvent("公网更新")
                self.completion?(true)
                self.completion = nil
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
    
    @Published var status: TunnelStatus = .stopped
    @Published var logs: String = ""
    
    private var logFileUrl: URL {
        let bundleID = Bundle.main.bundleIdentifier!
        let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent(bundleID, isDirectory: true)
        try? FileManager.default.createDirectory(at: appSupportDir, withIntermediateDirectories: true)
        return appSupportDir.appendingPathComponent("tunnel.log")
    }
    
    private var process: Process?
    private var outputPipe: Pipe?
    private var errorPipe: Pipe?
    private var retryCount = 0
    private let maxAutomaticRetries = 10
    private var isRetrying = false
    private var retryWorkItem: DispatchWorkItem?
    private var processOutputBuffer = ""
    private var currentFailureAllowsExtendedRetry = false
    private var didAttemptAutomaticUpdate = false
    private var didAttemptArchitectureRepair = false
    private var isAutomaticallyUpdating = false
    private weak var processBeingReplaced: Process?
    private var pendingStartPort: Int?
    
    private var lastStartPort: Int = 4210
    private var restartTimer: Timer?
    
    private let urlRegex = try! NSRegularExpression(pattern: #"(https:\/\/[a-zA-Z0-9\-\.]+\.instatunnel\.my)"#, options: [])
    
    private init() {
        // Load initial logs from file
        if let savedLogs = try? String(contentsOf: logFileUrl, encoding: .utf8) {
            self.logs = savedLogs
            // Keep to recent logs on load
            if self.logs.count > 10000 {
                self.logs = String(self.logs.suffix(10000))
            }
        }
        
        NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { _ in
            self.stop()
        }
    }
    
    func start(port: Int) {
        retryWorkItem?.cancel()
        retryWorkItem = nil
        retryCount = 0
        isRetrying = false
        didAttemptAutomaticUpdate = false
        didAttemptArchitectureRepair = false
        startInstalledTunnel(port: port)
    }

    private func startInstalledTunnel(port: Int) {
        self.lastStartPort = port
        
        if logs.isEmpty { appendLog("Starting InstaTunnel...\n") }
        
        // Allow starting if stopped or in an error state
        let canStart: Bool
        switch status {
        case .stopped, .error: canStart = true
        case .starting: canStart = isRetrying && process == nil
        case .running: canStart = false
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
            self.launchProcess(binaryPath: binaryPath, port: port)
        }
    }
    
    private func launchProcess(binaryPath: String, port: Int) {
        let executableURL = URL(fileURLWithPath: binaryPath)
        processOutputBuffer = ""
        currentFailureAllowsExtendedRetry = false

        if let currentProcess = process, currentProcess.isRunning {
            pendingStartPort = port
            appendLog("Waiting for the previous InstaTunnel process to stop before restarting...\n")
            terminateProcess(currentProcess)
            return
        }
        
        DispatchQueue.main.async {
            self.status = .starting
            // Removed: self.logs = "" - Don't clear logs on restart
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
        
        let args = [String(port)]
        process.arguments = args
        
        
        let outPipe = Pipe()
        let errPipe = Pipe()
        process.standardOutput = outPipe
        process.standardError = errPipe
        
        setupPipeReader(outPipe, process: process)
        setupPipeReader(errPipe, process: process)
        
        process.terminationHandler = { [weak self] p in
            DispatchQueue.main.async {
                guard let self = self else { return }
                let exitStatus = p.terminationStatus
                self.appendLog("Process terminated with exit code: \(exitStatus)\n")

                if self.processBeingReplaced === p {
                    self.processBeingReplaced = nil
                    if self.process === p {
                        self.process = nil
                    }
                    self.resumePendingStartIfNeeded()
                    return
                }

                // Ignore callbacks from a process that has already been superseded.
                guard self.process === p else { return }
                self.process = nil

                if self.pendingStartPort != nil {
                    self.resumePendingStartIfNeeded()
                    return
                }
                
                // If already stopped manually, don't trigger retry or update status to error
                if self.status == .stopped { return }

                if self.status.isRunning {
                    ICloudManager.shared.syncServer(url: nil, isOffline: true)
                    MQTTRemoteSync.shared.disconnect()
                }
                
                if exitStatus != 0 {
                    self.status = .error("Exit code \(exitStatus)")
                    // Auto-restart on error
                    self.handleRetry(
                        port: self.lastStartPort,
                        allowExtendedRecovery: self.currentFailureAllowsExtendedRetry
                    )
                } else {
                    self.status = .stopped
                }
            }
        }
        
        do {
            try process.run()
        } catch {
            DispatchQueue.main.async {
                if self.isBadCPUTypeError(error), !self.didAttemptArchitectureRepair {
                    self.didAttemptArchitectureRepair = true
                    self.process = nil
                    self.repairIncompatibleBinary(port: port)
                    return
                }

                let msg = error.localizedDescription
                self.appendLog("[ERROR] Failed to start InstaTunnel: \(msg)\n")
                self.status = .error(msg)
                self.process = nil
            }
        }
    }
    
    private func handleRetry(port: Int, allowExtendedRecovery: Bool = false) {
        guard retryCount < maxAutomaticRetries || allowExtendedRecovery else {
            self.isRetrying = false
            self.retryCount = 0
            appendLog("Automatic retry limit reached. Start the tunnel again to retry.\n")
            return
        }
        
        retryCount += 1
        isRetrying = true
        status = .starting

        let delay = retryDelay(for: retryCount)
        if retryCount <= maxAutomaticRetries {
            appendLog("Tunnel unavailable. Retrying in \(Int(delay)) seconds (attempt \(retryCount)/\(maxAutomaticRetries))...\n")
        } else {
            appendLog("InstaTunnel service is still unavailable. Will keep trying every \(Int(delay / 60)) minutes...\n")
        }

        retryWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            self.retryWorkItem = nil
            self.appendLog("Retrying tunnel connection...\n")
            self.startInstalledTunnel(port: port)
        }
        retryWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    private func retryDelay(for attempt: Int) -> TimeInterval {
        switch attempt {
        case 1: return 2
        case 2: return 5
        case 3: return 10
        case 4: return 20
        case 5: return 30
        case 6: return 60
        case 7: return 120
        case 8: return 180
        default: return 300
        }
    }
    
    func stop() {
        retryWorkItem?.cancel()
        retryWorkItem = nil
        pendingStartPort = nil
        if let currentProcess = process, currentProcess.isRunning {
            terminateProcess(currentProcess)
        } else {
            process = nil
        }
        status = .stopped
        isRetrying = false
        retryCount = 0
        
        restartTimer?.invalidate()
        restartTimer = nil
        
        // Sync to iCloud as offline
        ICloudManager.shared.syncServer(url: nil, isOffline: true)
        
        // Disconnect MQTT
        MQTTRemoteSync.shared.disconnect()
    }

    private func terminateProcess(_ target: Process) {
        target.terminate()
        let pid = target.processIdentifier
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 2.0) {
            if target.isRunning {
                Darwin.kill(pid, SIGKILL)
            }
        }
    }

    private func resumePendingStartIfNeeded() {
        guard let port = pendingStartPort else { return }
        pendingStartPort = nil
        status = .stopped
        isRetrying = true
        startInstalledTunnel(port: port)
    }

    private func isBadCPUTypeError(_ error: Error) -> Bool {
        let nsError = error as NSError
        if nsError.domain == NSPOSIXErrorDomain && nsError.code == Int(EBADARCH) {
            return true
        }
        if let underlyingError = nsError.userInfo[NSUnderlyingErrorKey] as? Error {
            return isBadCPUTypeError(underlyingError)
        }
        return false
    }

    private func repairIncompatibleBinary(port: Int) {
        appendLog("InstaTunnel could not run on this CPU. Reinstalling the native binary...\n")
        status = .starting

        InstaTunnelDownloader.shared.downloadInstaTunnel { [weak self] success in
            guard let self = self else { return }
            if success {
                self.appendLog("Native InstaTunnel binary installed. Restarting tunnel...\n")
                self.status = .stopped
                self.isRetrying = true
                self.startInstalledTunnel(port: port)
            } else {
                self.isRetrying = false
                let message = "Automatic InstaTunnel architecture repair failed"
                self.status = .error(message)
                self.appendLog("[ERROR] \(message).\n")
            }
        }
    }
    
    func restart() {
        appendLog("Restarting tunnel...\n")
        stop()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.start(port: self.lastStartPort)
        }
    }
    
    private func scheduleRestart() {
        restartTimer?.invalidate()
        // 23 hours and 50 minutes = 85800 seconds
        // Anonymous sessions expire in 24 hours
        restartTimer = Timer.scheduledTimer(withTimeInterval: 85800, repeats: false) { [weak self] _ in
            self?.appendLog("Anonymous session will expire soon. Triggering auto-restart...\n")
            self?.restart()
        }
    }
    
    private func setupPipeReader(_ pipe: Pipe, process: Process) {
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty {
                handle.readabilityHandler = nil
                return
            }
            if let str = String(data: data, encoding: .utf8), !str.isEmpty {
                DispatchQueue.main.async {
                    self?.appendLog(str)
                    self?.parseProcessOutput(str, from: process)
                }
            }
        }
    }

    private func parseProcessOutput(_ text: String, from process: Process) {
        // The termination callback and final stderr chunk can reach the main queue
        // in either order. Accept the chunk while this process is current, or while
        // its delayed retry is still pending.
        guard self.process === process || (self.process == nil && retryWorkItem != nil) else { return }

        processOutputBuffer.append(text.lowercased())
        if processOutputBuffer.count > 8192 {
            processOutputBuffer = String(processOutputBuffer.suffix(8192))
        }

        let transientFailureMarkers = [
            ": eof",
            "i/o timeout",
            "timed out",
            "connection reset",
            "connection refused",
            "network is unreachable",
            "temporary failure",
            "tls handshake timeout",
            "status code 429",
            "status code 500",
            "status code 502",
            "status code 503",
            "status code 504"
        ]
        if processOutputBuffer.contains("failed to create tunnel"),
           transientFailureMarkers.contains(where: processOutputBuffer.contains) {
            currentFailureAllowsExtendedRetry = true
        }

        let isUnsupportedVersion = processOutputBuffer.contains("this instatunnel cli version is no longer supported for anonymous tunnels")
            || (processOutputBuffer.contains("\"required_version\"") && processOutputBuffer.contains("\"update_command\""))
        if isUnsupportedVersion {
            updateUnsupportedInstaTunnel(replacing: process)
            return
        }

        parseTunnelEvents(from: processOutputBuffer)
    }

    private func updateUnsupportedInstaTunnel(replacing staleProcess: Process) {
        guard !isAutomaticallyUpdating, !didAttemptAutomaticUpdate else { return }

        didAttemptAutomaticUpdate = true
        isAutomaticallyUpdating = true
        retryWorkItem?.cancel()
        retryWorkItem = nil
        processBeingReplaced = staleProcess
        appendLog("Installed InstaTunnel version is no longer supported. Downloading the latest version automatically...\n")
        staleProcess.terminate()

        InstaTunnelDownloader.shared.downloadInstaTunnel { [weak self] success in
            guard let self = self else { return }
            self.isAutomaticallyUpdating = false

            if success {
                self.appendLog("InstaTunnel update completed. Restarting tunnel...\n")
                self.status = .stopped
                self.isRetrying = true
                self.startInstalledTunnel(port: self.lastStartPort)
            } else {
                self.isRetrying = false
                self.status = .error("Automatic InstaTunnel update failed")
                self.appendLog("[ERROR] Automatic InstaTunnel update failed.\n")
            }
        }
    }

    private func parseTunnelEvents(from text: String) {
        if text.contains("subdomain already taken") {
            DispatchQueue.main.async {
                self.appendLog("Subdomain already taken. Will retry in 2 seconds...\n")
                if let p = self.process, let args = p.arguments, let portStr = args.first, let port = Int(portStr) {
                    self.stop()
                    self.handleRetry(port: port)
                }
            }
            return
        }

        // Errors and help output also contain URLs such as api.instatunnel.my.
        // Only a URL on the CLI's explicit success line represents a live tunnel.
        let successLine = text.components(separatedBy: .newlines).first { line in
            line.contains("your app is now live at")
                || line.contains("tunnel created:")
                || line.contains("public url:")
                || line.contains("tunnel url:")
        }
        guard let successLine else { return }

        let range = NSRange(successLine.startIndex..., in: successLine)
        guard let match = urlRegex.firstMatch(in: successLine, options: [], range: range),
              match.numberOfRanges > 1,
              let urlRange = Range(match.range(at: 1), in: successLine) else { return }

        let url = String(successLine[urlRange])
        guard let host = URL(string: url)?.host,
              host != "api.instatunnel.my",
              host.hasSuffix(".instatunnel.my") else { return }

        if case .starting = self.status {
            self.status = .running(url: url)
            self.retryCount = 0
            self.isRetrying = false
            self.didAttemptAutomaticUpdate = false

            // Sync to iCloud
            ICloudManager.shared.syncServer(url: url, isOffline: false)

            // Publish to MQTT for cross-network remote access
            MQTTRemoteSync.shared.publishURL(url)

            // Schedule 24h restart
            self.scheduleRestart()
        }
    }
    
    func appendLog(_ message: String) {
        if message.isEmpty { return }
        
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let timestamp = "[\(formatter.string(from: Date()))] "
        
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
                
                if self.logs.count > 10000 {
                    self.logs = String(self.logs.suffix(10000))
                }
            }
        }
    }
    
    func clearLogs() {
        self.logs = ""
        try? "".write(to: logFileUrl, atomically: true, encoding: .utf8)
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
    
    @AppStorage("port") private var localPort: Int = 4210
    
    @State private var showingQRPopover = false
    
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
                        HStack(spacing: 4) {
                            Link(destination: urlObj) {
                                Text(url)
                                    .font(.subheadline)
                                    .foregroundColor(.blue)
                                    .underline()
                            }
                            
                            Button(action: { showingQRPopover.toggle() }) {
                                Image(systemName: "qrcode")
                                    .foregroundColor(.secondary)
                            }
                            .buttonStyle(.plain)
                            .help(i18n.t("mqtt_qr_title"))
                            .popover(isPresented: $showingQRPopover) {
                                MQTTQRCodeView()
                            }
                        }
                    }
                }
            }
            
            Spacer()
            
            Toggle("", isOn: Binding(
                get: { tunnelManager.status.isRunning || tunnelManager.status == .starting },
                set: { newValue in
                    if newValue {
                        startTunnel()
                    } else {
                        tunnelManager.stop()
                    }
                }
            ))
            .toggleStyle(.switch)
            .labelsHidden()
            .disabled(downloader.status.isBusy)
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
                    tunnelManager.clearLogs()
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
                    tunnelManager.start(port: localPort)
                }
            }
        } else {
            tunnelManager.start(port: localPort)
        }
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
