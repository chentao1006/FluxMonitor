import SwiftUI
import Foundation
import Darwin
import CryptoKit

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
    private var isSuppressingCLIHelpOutput = false
    private var currentFailureAllowsExtendedRetry = false
    private var currentFailureIsTunnelLimit = false
    private var currentFailureIsAnonymousLimit = false
    private var currentFailureIsDailyRequestLimit = false
    private var currentFailureConfirmsMissingTunnel = false
    private var shouldUseAnonymousFallback = false
    private var currentLaunchUsedAPIKey = false
    private var currentLaunchSubdomain: String?
    private var currentLaunchTunnelStorageKey = ""
    private var currentProcessStartedAt: Date?
    private var startRequestID: UUID?
    private var restartWorkItem: DispatchWorkItem?
    private var cleanupRequestID: UUID?
    private var lastTunnelCleanupAt: Date?
    private var didAttemptAutomaticUpdate = false
    private var didAttemptArchitectureRepair = false
    private var isAutomaticallyUpdating = false
    private var binaryRepairRequestID: UUID?
    private weak var processBeingReplaced: Process?
    private var pendingStartPort: Int?
    
    private var lastStartPort: Int = 4210
    private var healthCheckTimer: Timer?
    private var dailyLimitResetTimer: Timer?
    private var consecutiveHealthCheckFailures = 0
    private var lastPublicHealthCheckAt: Date?
    private let healthCheckInterval: TimeInterval = 60
    private let publicHealthCheckInterval: TimeInterval = 10 * 60
    private let healthCheckFailureThreshold = 3

    // A disconnected CLI does not mean the remote registration was released.
    // Only the server can confirm that a saved tunnel no longer exists.
    private struct SavedTunnel: Codable {
        let subdomain: String
        let createdAt: Date
    }
    private struct AccountTunnel: Decodable {
        let id: Int
        let subdomain: String
        let status: String
        let updated_at: String

        func canClose(protected: Set<String>, now: Date = Date()) -> Bool {
            guard status == "active", !protected.contains(subdomain.lowercased()) else { return false }
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            var date = formatter.date(from: updated_at)
            if date == nil {
                formatter.formatOptions = [.withInternetDateTime]
                date = formatter.date(from: updated_at)
            }
            // A new or recently reconnected registration may not have reached
            // iCloud yet. Missing activity timestamps are also inconclusive.
            return date.map { now.timeIntervalSince($0) >= 10 * 60 } ?? false
        }
    }
    private let tunnelLimitRetryDelay: TimeInterval = 600
    private let lastTunnelSubdomainKey = "instaTunnelLastSubdomain"
    private let lastTunnelCreatedAtKey = "instaTunnelLastCreatedAt"
    private let apiKeyDailyLimitResetAtKey = "instaTunnelApiKeyDailyLimitResetAt"

    private let urlRegex = try! NSRegularExpression(pattern: #"(https:\/\/[a-zA-Z0-9\-\.]+\.instatunnel\.my)"#, options: [])
    
    private init() {
        // Load initial logs from file
        if let savedLogs = try? String(contentsOf: logFileUrl, encoding: .utf8) {
            self.logs = savedLogs
            // Keep to recent logs on load
            if self.logs.count > 10000 {
                self.logs = String(self.logs.suffix(10000))
            }
            restoreSavedTunnels(from: savedLogs)
        }
        
        NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { _ in
            self.stop()
        }

        startHealthMonitoring()
        scheduleAPIKeyDailyLimitResetIfNeeded()
    }
    
    func start(port: Int) {
        guard !status.isRunning, status != .starting else { return }
        restartWorkItem?.cancel()
        restartWorkItem = nil
        retryWorkItem?.cancel()
        retryWorkItem = nil
        retryCount = 0
        consecutiveHealthCheckFailures = 0
        lastPublicHealthCheckAt = nil
        isRetrying = false
        shouldUseAnonymousFallback = isAPIKeyDailyLimitActive
        didAttemptAutomaticUpdate = false
        didAttemptArchitectureRepair = false
        startInstalledTunnel(port: port)
    }

    private func startInstalledTunnel(port: Int) {
        if logs.isEmpty { appendLog("Starting InstaTunnel...\n") }
        
        // Allow starting if stopped or in an error state
        let canStart: Bool
        switch status {
        case .stopped, .error: canStart = true
        case .starting: canStart = isRetrying && process == nil
        case .running: canStart = false
        }
        
        guard canStart, startRequestID == nil, !isAutomaticallyUpdating else { return }
        self.lastStartPort = port
        
        guard InstaTunnelDownloader.shared.isInstalled() else {
            let errorMsg = I18N.shared.t("instatunnel_not_installed")
            appendLog("Error: \(errorMsg)\n")
            self.status = .error(errorMsg)
            return
        }
        
        let binaryPath = InstaTunnelDownloader.shared.localInstaTunnelPath
        let requestID = UUID()
        startRequestID = requestID
        status = .starting
        
        checkPortAccessibility(port: port) { [weak self] accessible in
            DispatchQueue.main.async {
                guard let self, self.startRequestID == requestID else { return }
                self.startRequestID = nil
                if !accessible {
                    let msg = String(format: I18N.shared.t("port_not_accessible"), port)
                    self.appendLog("[ERROR] \(msg)\n")
                    self.status = .error(msg)
                    return
                }

                if !self.isRetrying {
                    self.retryCount = 0
                }
                self.launchProcess(binaryPath: binaryPath, port: port)
            }
        }
    }
    
    private func launchProcess(binaryPath: String, port: Int) {
        let executableURL = URL(fileURLWithPath: binaryPath)
        processOutputBuffer = ""
        isSuppressingCLIHelpOutput = false
        currentFailureAllowsExtendedRetry = false
        currentFailureIsTunnelLimit = false
        currentFailureIsAnonymousLimit = false
        currentFailureIsDailyRequestLimit = false
        currentFailureConfirmsMissingTunnel = false

        if let currentProcess = process, currentProcess.isRunning {
            pendingStartPort = port
            appendLog("Waiting for the previous InstaTunnel process to stop before restarting...\n")
            terminateProcess(currentProcess)
            return
        }

        let launchAPIKey = shouldUseAnonymousFallback ? nil : configuredAPIKey
        currentLaunchUsedAPIKey = launchAPIKey != nil
        currentLaunchTunnelStorageKey = tunnelStorageKey(apiKey: launchAPIKey)
        let reconnectSubdomain = reusableSubdomain
        currentLaunchSubdomain = reconnectSubdomain

        let process = Process()
        self.process = process
        process.executableURL = executableURL
        process.currentDirectoryURL = executableURL.deletingLastPathComponent()
        
        // Setup environment
        let env = ProcessInfo.processInfo.environment
        process.environment = env
        
        var args: [String]
        if let reconnectSubdomain {
            args = ["connect", String(port), "--subdomain", reconnectSubdomain]
        } else {
            args = [String(port)]
        }
        if let apiKey = launchAPIKey {
            args += ["--api-key", apiKey]
        }
        process.arguments = args

        let authenticationMessage: String
        if currentLaunchUsedAPIKey {
            authenticationMessage = "Authentication mode: API key (using the saved key).\n"
        } else if configuredAPIKey != nil && shouldUseAnonymousFallback {
            authenticationMessage = "Authentication mode: anonymous fallback. A saved API key is configured but is intentionally not passed to InstaTunnel. Reason: \(anonymousFallbackReason).\n"
        } else {
            authenticationMessage = "Authentication mode: anonymous (no API key configured).\n"
        }

        currentProcessStartedAt = Date()
        self.status = .starting
        self.appendLog("Starting InstaTunnel from: \(executableURL.path)\n")
        self.appendLog(authenticationMessage)
        if let reconnectSubdomain {
            self.appendLog("Reconnecting to existing tunnel: \(reconnectSubdomain)\n")
            ICloudManager.shared.reserveTunnel(url: "https://\(reconnectSubdomain).instatunnel.my")
        }

        let fm = FileManager.default
        if !fm.fileExists(atPath: executableURL.path) {
            self.appendLog("[ERROR] Binary not found at path: \(executableURL.path)\n")
        }

        let outPipe = Pipe()
        let errPipe = Pipe()
        process.standardOutput = outPipe
        process.standardError = errPipe
        
        // Wait for BOTH output streams to reach EOF before classifying the exit.
        // Otherwise the final stderr error can arrive after the retry decision.
        var openOutputStreams = 2
        var didTerminate = false
        let finishTermination = { [weak self, weak process] in
            guard didTerminate, openOutputStreams == 0,
                  let self, let p = process else { return }
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

            let wasRunning = self.status.isRunning
            if wasRunning {
                ICloudManager.shared.syncServer(url: nil, isOffline: true, preservingTunnelReservation: true)
                MQTTRemoteSync.shared.disconnect()
            }

            if exitStatus != 0 {
                if self.currentFailureIsDailyRequestLimit && self.currentLaunchUsedAPIKey {
                    self.rememberAPIKeyDailyLimit()
                }

                let dailyLimitRequiresAnonymous = self.currentFailureIsDailyRequestLimit
                    && self.currentLaunchUsedAPIKey
                let canAlternateTunnelMode = self.currentFailureIsTunnelLimit
                    && self.configuredAPIKey != nil
                    && !self.isAPIKeyDailyLimitActive
                let switchingToAnonymous = (canAlternateTunnelMode
                    && self.currentLaunchUsedAPIKey) || dailyLimitRequiresAnonymous
                let switchingBackToAPIKey = canAlternateTunnelMode
                    && !self.currentLaunchUsedAPIKey
                if canAlternateTunnelMode || dailyLimitRequiresAnonymous {
                    self.shouldUseAnonymousFallback = switchingToAnonymous
                }

                // EOF, timeouts, quota and authentication failures do not prove
                // that the old registration disappeared. Never spend another
                // slot merely because a reconnect attempt failed.
                if let reconnectSubdomain, !wasRunning, self.currentFailureConfirmsMissingTunnel {
                    self.appendLog("Server confirmed tunnel \(reconnectSubdomain) no longer exists. A new tunnel may be created.\n")
                    self.forgetReusableTunnel()
                } else if let reconnectSubdomain {
                    self.appendLog("Keeping saved tunnel \(reconnectSubdomain) for reconnection; its removal has not been confirmed.\n")
                }

                self.status = .error("Exit code \(exitStatus)")
                // Auto-restart on error
                self.handleRetry(
                    port: self.lastStartPort,
                    allowExtendedRecovery: self.currentFailureAllowsExtendedRetry,
                    isTunnelLimit: self.currentFailureIsTunnelLimit,
                    isAnonymousLimit: self.currentFailureIsAnonymousLimit,
                    isDailyRequestLimit: self.currentFailureIsDailyRequestLimit,
                    switchingToAnonymous: switchingToAnonymous,
                    switchingBackToAPIKey: switchingBackToAPIKey
                )
            } else {
                self.status = .stopped
            }
        }
        let outputClosed = {
            openOutputStreams -= 1
            finishTermination()
        }
        setupPipeReader(outPipe, process: process, onEOF: outputClosed)
        setupPipeReader(errPipe, process: process, onEOF: outputClosed)
        process.terminationHandler = { _ in
            DispatchQueue.main.async {
                didTerminate = true
                finishTermination()
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
    
    private func handleRetry(port: Int, allowExtendedRecovery: Bool = false, isTunnelLimit: Bool = false, isAnonymousLimit: Bool = false, isDailyRequestLimit: Bool = false, switchingToAnonymous: Bool = false, switchingBackToAPIKey: Bool = false, didCheckUnusedTunnels: Bool = false) {
        if isTunnelLimit, !isAnonymousLimit, currentLaunchUsedAPIKey, !didCheckUnusedTunnels,
           lastTunnelCleanupAt.map({ Date().timeIntervalSince($0) >= tunnelLimitRetryDelay }) ?? true {
            status = .starting
            isRetrying = true
            cleanupUnusedAccountTunnels { [weak self] releasedSlot in
                guard let self else { return }
                if releasedSlot {
                    self.shouldUseAnonymousFallback = false
                    self.retryCount = 0
                }
                self.handleRetry(port: port, allowExtendedRecovery: allowExtendedRecovery,
                                 isTunnelLimit: releasedSlot ? false : isTunnelLimit,
                                 isAnonymousLimit: isAnonymousLimit, isDailyRequestLimit: isDailyRequestLimit,
                                 switchingToAnonymous: releasedSlot ? false : switchingToAnonymous,
                                 switchingBackToAPIKey: switchingBackToAPIKey, didCheckUnusedTunnels: true)
            }
            return
        }
        guard retryCount < maxAutomaticRetries || allowExtendedRecovery || isTunnelLimit || isDailyRequestLimit else {
            self.isRetrying = false
            self.retryCount = 0
            appendLog("Automatic retry limit reached. Start the tunnel again to retry.\n")
            return
        }

        retryCount += 1
        isRetrying = true
        status = .starting

        // Tunnel limits require an existing tunnel to be released, so rapid retries
        // cannot succeed and just keep hitting the server.
        let delay = switchingToAnonymous ? 2 : (isTunnelLimit ? tunnelLimitRetryDelay : retryDelay(for: retryCount))
        if isDailyRequestLimit && switchingToAnonymous {
            appendLog("InstaTunnel API key daily request limit reached. Trying an anonymous tunnel until the limit resets...\n")
        } else if switchingToAnonymous {
            appendLog("InstaTunnel account tunnel limit reached. Trying an anonymous tunnel...\n")
        } else if switchingBackToAPIKey {
            appendLog("Anonymous tunnel limit reached. Retrying with the configured API key in \(Int(delay / 60)) minutes...\n")
        } else if isAnonymousLimit && configuredAPIKey != nil && shouldUseAnonymousFallback {
            appendLog("Anonymous tunnel limit reached for this network. Remaining in anonymous fallback because \(anonymousFallbackReason). Retrying in \(Int(delay / 60)) minutes...\n")
        } else if isAnonymousLimit {
            appendLog("Anonymous tunnel limit reached for this network. Earlier tunnels are released when they expire (up to 24 hours). Set an InstaTunnel API key to avoid this limit. Retrying in \(Int(delay / 60)) minutes...\n")
        } else if isTunnelLimit {
            appendLog("InstaTunnel account tunnel limit reached. Close an unused active tunnel or increase the account limit. Retrying in \(Int(delay / 60)) minutes...\n")
        } else if retryCount <= maxAutomaticRetries {
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

    private func protectedSubdomainsForCleanup(apiKey: String) throws -> Set<String> {
        var protected = try ICloudManager.shared.protectedTunnelSubdomains()
        if let currentLaunchSubdomain { protected.insert(currentLaunchSubdomain.lowercased()) }
        if let data = UserDefaults.standard.data(forKey: tunnelStorageKey(apiKey: apiKey)),
           let saved = try? JSONDecoder().decode(SavedTunnel.self, from: data) {
            protected.insert(saved.subdomain.lowercased())
        }
        return protected
    }

    private func requestAccountTunnels(apiKey: String, completion: @escaping (Result<[AccountTunnel], Error>) -> Void) {
        var request = URLRequest(url: URL(string: "https://api.instatunnel.my/api/tunnels")!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: request) { data, response, error in
            let result: Result<[AccountTunnel], Error>
            do {
                if let error { throw error }
                guard let response = response as? HTTPURLResponse, response.statusCode == 200, let data else {
                    throw NSError(domain: "TunnelCleanup", code: 6, userInfo: [NSLocalizedDescriptionKey: "could not read the account tunnel list"])
                }
                result = .success(try JSONDecoder().decode([AccountTunnel].self, from: data))
            } catch { result = .failure(error) }
            DispatchQueue.main.async { completion(result) }
        }.resume()
    }

    private func cleanupUnusedAccountTunnels(completion: @escaping (Bool) -> Void) {
        lastTunnelCleanupAt = Date()
        guard let apiKey = configuredAPIKey else { completion(false); return }
        let protected: Set<String>
        do { protected = try protectedSubdomainsForCleanup(apiKey: apiKey) }
        catch {
            appendLog("Skipping unused tunnel cleanup: \(error.localizedDescription).\n")
            completion(false)
            return
        }
        let requestID = UUID()
        cleanupRequestID = requestID
        appendLog("Account tunnel limit reached. Checking iCloud device usage before releasing all unused registrations...\n")
        let finish: (Bool) -> Void = { [weak self] released in
            guard let self, self.cleanupRequestID == requestID else { return }
            self.cleanupRequestID = nil
            completion(released)
        }
        requestAccountTunnels(apiKey: apiKey) { [weak self] result in
            guard let self, self.cleanupRequestID == requestID else { return }
            guard self.configuredAPIKey == apiKey else { finish(false); return }
            guard case .success(let tunnels) = result else {
                self.appendLog("Could not list account tunnels. Keeping all remote registrations.\n")
                finish(false)
                return
            }
            let candidates = tunnels.filter { $0.canClose(protected: protected) }.sorted { $0.updated_at < $1.updated_at }
            guard !candidates.isEmpty else {
                self.appendLog("No unused account tunnel could be confirmed from iCloud. Keeping all registrations.\n")
                finish(false)
                return
            }
            self.appendLog("Found \(candidates.count) unused account tunnels. Rechecking and closing each registration...\n")
            func closeNext(_ index: Int, releasedCount: Int) {
                guard self.cleanupRequestID == requestID else { return }
                guard self.configuredAPIKey == apiKey else { finish(releasedCount > 0); return }
                guard index < candidates.count else {
                    self.appendLog("Unused account tunnel cleanup completed: \(releasedCount) of \(candidates.count) registrations released.\n")
                    finish(releasedCount > 0)
                    return
                }
                let candidate = candidates[index]
                // Recheck BOTH sources for every deletion. A device can recover
                // while earlier candidates in the same batch are being closed.
                self.requestAccountTunnels(apiKey: apiKey) { [weak self] result in
                    guard let self, self.cleanupRequestID == requestID else { return }
                    guard self.configuredAPIKey == apiKey else { finish(releasedCount > 0); return }
                    do {
                        let latestProtected = try self.protectedSubdomainsForCleanup(apiKey: apiKey)
                        guard case .success(let latest) = result else {
                            self.appendLog("Stopping cleanup because the account tunnel list could not be rechecked.\n")
                            finish(releasedCount > 0)
                            return
                        }
                        guard let unchanged = latest.first(where: { $0.id == candidate.id && $0.subdomain == candidate.subdomain }),
                              unchanged.canClose(protected: latestProtected) else {
                            self.appendLog("Tunnel \(candidate.subdomain) usage changed during cleanup. Keeping it and checking the next registration.\n")
                            closeNext(index + 1, releasedCount: releasedCount)
                            return
                        }
                    } catch {
                        self.appendLog("Stopping cleanup because iCloud could not be rechecked: \(error.localizedDescription).\n")
                        finish(releasedCount > 0)
                        return
                    }
                    var request = URLRequest(url: URL(string: "https://api.instatunnel.my/api/tunnels/\(candidate.id)")!, timeoutInterval: 15)
                    request.httpMethod = "DELETE"
                    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
                    URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
                        DispatchQueue.main.async {
                            guard let self, self.cleanupRequestID == requestID else { return }
                            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                            let released = error == nil && ((200..<300).contains(code) || code == 404)
                            self.appendLog(released
                                ? "Released unused account tunnel \(candidate.subdomain) (not used or reserved by any iCloud device).\n"
                                : "Could not release unused account tunnel \(candidate.subdomain) (HTTP \(code)). Continuing cleanup...\n")
                            closeNext(index + 1, releasedCount: releasedCount + (released ? 1 : 0))
                        }
                    }.resume()
                }
            }
            closeNext(0, releasedCount: 0)
        }
    }
    
    func stop(preservingTunnelReservation: Bool = false) {
        startRequestID = nil
        cleanupRequestID = nil
        binaryRepairRequestID = nil
        isAutomaticallyUpdating = false
        restartWorkItem?.cancel()
        restartWorkItem = nil
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
        
        
        // Sync to iCloud as offline
        ICloudManager.shared.syncServer(url: nil, isOffline: true, preservingTunnelReservation: preservingTunnelReservation)
        
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
        let requestID = UUID()
        binaryRepairRequestID = requestID
        isAutomaticallyUpdating = true

        InstaTunnelDownloader.shared.downloadInstaTunnel { [weak self] success in
            guard let self, self.binaryRepairRequestID == requestID else { return }
            self.binaryRepairRequestID = nil
            self.isAutomaticallyUpdating = false
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
        stop(preservingTunnelReservation: true)
        let workItem = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.restartWorkItem = nil
            self.start(port: self.lastStartPort)
        }
        restartWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0, execute: workItem)
    }

    private var configuredAPIKey: String? {
        let key = (UserDefaults.standard.string(forKey: ICloudAPIKeySync.apiKeyDefaultsKey) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return key.isEmpty ? nil : key
    }

    private var anonymousFallbackReason: String {
        if let resetAt = UserDefaults.standard.object(forKey: apiKeyDailyLimitResetAtKey) as? Date,
           resetAt > Date() {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd HH:mm:ss zzz"
            return "the API key daily request limit was reached; API key mode is scheduled to retry after \(formatter.string(from: resetAt))"
        }
        return "the API key account tunnel limit was reached"
    }

    private var isAPIKeyDailyLimitActive: Bool {
        guard let resetAt = UserDefaults.standard.object(forKey: apiKeyDailyLimitResetAtKey) as? Date else {
            return false
        }
        if resetAt > Date() {
            return true
        }
        UserDefaults.standard.removeObject(forKey: apiKeyDailyLimitResetAtKey)
        return false
    }

    private func rememberAPIKeyDailyLimit() {
        let calendar = Calendar.current
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: Date()) ?? Date().addingTimeInterval(24 * 3600)
        let resetAt = calendar.startOfDay(for: tomorrow).addingTimeInterval(5 * 60)
        UserDefaults.standard.set(resetAt, forKey: apiKeyDailyLimitResetAtKey)
        scheduleAPIKeyDailyLimitResetIfNeeded()
    }

    private func scheduleAPIKeyDailyLimitResetIfNeeded() {
        dailyLimitResetTimer?.invalidate()
        dailyLimitResetTimer = nil

        guard let resetAt = UserDefaults.standard.object(forKey: apiKeyDailyLimitResetAtKey) as? Date,
              resetAt > Date() else { return }

        dailyLimitResetTimer = Timer.scheduledTimer(withTimeInterval: resetAt.timeIntervalSinceNow, repeats: false) { [weak self] _ in
            guard let self else { return }
            UserDefaults.standard.removeObject(forKey: self.apiKeyDailyLimitResetAtKey)
            self.shouldUseAnonymousFallback = false
            self.appendLog("InstaTunnel API key daily request limit window has reset. The next connection will use the API key; keeping any working tunnel.\n")
            if self.configuredAPIKey != nil,
               !self.currentLaunchUsedAPIKey,
               UserDefaults.standard.bool(forKey: "autoStartTunnel"),
               !self.status.isRunning, self.status != .stopped {
                self.restart()
            }
        }
    }

    func applyAPIKeyChange() {
        // A quota failure belongs to the previous key. Also allow an explicit
        // submission of the same key to recheck the service instead of trusting
        // the locally estimated reset time.
        UserDefaults.standard.removeObject(forKey: apiKeyDailyLimitResetAtKey)
        dailyLimitResetTimer?.invalidate()
        dailyLimitResetTimer = nil
        shouldUseAnonymousFallback = false
        lastTunnelCleanupAt = nil
        appendLog("API key settings applied. Cleared the cached daily limit and anonymous fallback state; the next launch will use the configured key if present.\n")

        switch status {
        case .running, .starting:
            if currentLaunchTunnelStorageKey == tunnelStorageKey(apiKey: configuredAPIKey), status.isRunning {
                appendLog("The running tunnel already uses these authentication settings. Keeping the current connection.\n")
                return
            }
            appendLog("InstaTunnel API key changed. Restarting tunnel...\n")
            restart()
        case .stopped, .error:
            break
        }
    }

    private var reusableSubdomain: String? {
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: currentLaunchTunnelStorageKey),
           let tunnel = try? JSONDecoder().decode(SavedTunnel.self, from: data) {
            return tunnel.subdomain
        }
        // Migrate the old single record without assuming that age means deletion.
        guard let subdomain = defaults.string(forKey: lastTunnelSubdomainKey) else { return nil }
        let createdAt = defaults.object(forKey: lastTunnelCreatedAtKey) as? Date ?? Date()
        saveTunnel(SavedTunnel(subdomain: subdomain, createdAt: createdAt), key: currentLaunchTunnelStorageKey)
        defaults.removeObject(forKey: lastTunnelSubdomainKey)
        defaults.removeObject(forKey: lastTunnelCreatedAtKey)
        return subdomain
    }

    private func tunnelStorageKey(apiKey: String?) -> String {
        guard let apiKey else { return "instaTunnelSavedTunnel.anonymous" }
        let fingerprint = SHA256.hash(data: Data(apiKey.utf8)).map { String(format: "%02x", $0) }.joined()
        return "instaTunnelSavedTunnel.apiKey.\(fingerprint)"
    }

    private func saveTunnel(_ tunnel: SavedTunnel, key: String) {
        guard let data = try? JSONEncoder().encode(tunnel) else { return }
        UserDefaults.standard.set(data, forKey: key)
        UserDefaults.standard.removeObject(forKey: lastTunnelSubdomainKey)
        UserDefaults.standard.removeObject(forKey: lastTunnelCreatedAtKey)
    }

    private func rememberTunnel(subdomain: String) {
        guard reusableSubdomain != subdomain else { return }
        saveTunnel(SavedTunnel(subdomain: subdomain, createdAt: Date()), key: currentLaunchTunnelStorageKey)
    }

    private func forgetReusableTunnel() {
        UserDefaults.standard.removeObject(forKey: currentLaunchTunnelStorageKey)
    }

    private func restoreSavedTunnels(from savedLogs: String) {
        // Older versions erased the saved subdomain on EOF. Recover only a URL
        // this Mac actually brought online, with an explicitly logged auth mode.
        var storageKey: String?
        var candidates: [String: SavedTunnel] = [:]
        let keyUpdatedAt = UserDefaults.standard.object(forKey: "instaTunnelApiKeyUpdatedAt") as? Date ?? .distantPast
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        for line in savedLogs.components(separatedBy: .newlines) {
            if line.contains("Starting InstaTunnel from:") { storageKey = nil }
            if line.contains("API key settings applied") || line.contains("Received InstaTunnel API key from iCloud") {
                candidates.removeValue(forKey: tunnelStorageKey(apiKey: configuredAPIKey))
                storageKey = nil
            }
            if line.contains("Authentication mode: API key"), configuredAPIKey != nil {
                storageKey = tunnelStorageKey(apiKey: configuredAPIKey)
            } else if line.contains("Authentication mode: anonymous") || line.contains("Running in anonymous mode") {
                storageKey = tunnelStorageKey(apiKey: nil)
            }
            guard let storageKey, line.count > 21,
                  let date = formatter.date(from: String(line.dropFirst().prefix(19))),
                  (storageKey == tunnelStorageKey(apiKey: nil) || date >= keyUpdatedAt),
                  line.lowercased().contains("your app is now live at"),
                  let match = urlRegex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
                  let range = Range(match.range(at: 1), in: line),
                  let host = URL(string: String(line[range]))?.host, host != "api.instatunnel.my" else { continue }
            candidates[storageKey] = SavedTunnel(subdomain: String(host.dropLast(".instatunnel.my".count)), createdAt: date)
        }
        for (key, tunnel) in candidates where UserDefaults.standard.data(forKey: key) == nil {
            saveTunnel(tunnel, key: key)
            appendLog("Recovered this Mac's saved tunnel from its successful connection log: \(tunnel.subdomain). It will be checked before creating a new tunnel.\n")
        }
    }

    private func startHealthMonitoring() {
        healthCheckTimer?.invalidate()
        healthCheckTimer = Timer.scheduledTimer(withTimeInterval: healthCheckInterval, repeats: true) { [weak self] _ in
            self?.checkTunnelHealthIfNeeded()
        }
    }

    private func checkTunnelHealthIfNeeded() {
        guard UserDefaults.standard.bool(forKey: "autoStartTunnel"),
              ProcessManager.shared.isRunning else {
            consecutiveHealthCheckFailures = 0
            return
        }

        switch status {
        case .stopped, .error:
            guard restartWorkItem == nil, !isAutomaticallyUpdating else { return }
            appendLog("Automatic public access check found the tunnel stopped. Restarting...\n")
            start(port: configuredPort)

        case .starting:
            guard startRequestID == nil, restartWorkItem == nil, cleanupRequestID == nil else { return }
            // Active retries and updates already own their recovery schedule. A starting
            // state without any of those means the process disappeared unexpectedly.
            if process == nil && retryWorkItem == nil && !isAutomaticallyUpdating {
                appendLog("Automatic public access check found the tunnel unavailable. Restarting...\n")
                status = .stopped
                start(port: configuredPort)
            } else if process?.isRunning == true && retryWorkItem == nil && !isAutomaticallyUpdating {
                // The CLI is alive but never reported a public URL.
                if let startedAt = currentProcessStartedAt,
                   Date().timeIntervalSince(startedAt) >= healthCheckInterval * Double(healthCheckFailureThreshold) {
                    appendLog("Tunnel has been starting for too long without a public URL. Restarting...\n")
                    restart()
                }
            }

        case .running(let url):
            guard process?.isRunning == true else {
                appendLog("Automatic public access check found the tunnel process closed. Restarting...\n")
                status = .stopped
                start(port: configuredPort)
                return
            }
            let now = Date()
            if lastPublicHealthCheckAt.map({ now.timeIntervalSince($0) >= publicHealthCheckInterval }) ?? true {
                lastPublicHealthCheckAt = now
                checkPublicURL(url)
            }
        }
    }

    private var configuredPort: Int {
        let port = UserDefaults.standard.integer(forKey: "port")
        return port != 0 ? port : lastStartPort
    }

    private func checkPublicURL(_ urlString: String) {
        guard let url = URL(string: urlString), let checkedProcess = process else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 10

        URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
            DispatchQueue.main.async {
                guard let self = self,
                      self.process === checkedProcess,
                      UserDefaults.standard.bool(forKey: "autoStartTunnel"),
                      case .running(let currentURL) = self.status,
                      currentURL == urlString else { return }

                if response != nil {
                    self.consecutiveHealthCheckFailures = 0
                    return
                }

                self.consecutiveHealthCheckFailures += 1
                guard self.consecutiveHealthCheckFailures >= self.healthCheckFailureThreshold else { return }

                self.consecutiveHealthCheckFailures = 0
                let detail = error?.localizedDescription ?? "no response"
                self.appendLog("Public URL health check failed repeatedly (\(detail)). Restarting tunnel...\n")
                self.restart()
            }
        }.resume()
    }
    
    private func setupPipeReader(_ pipe: Pipe, process: Process, onEOF: @escaping () -> Void) {
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty {
                handle.readabilityHandler = nil
                DispatchQueue.main.async(execute: onEOF)
                return
            }
            // Pipe boundaries can split the CLI's emoji. Keep the ASCII status
            // and URL text even when a chunk contains an incomplete UTF-8 scalar.
            let str = String(decoding: data, as: UTF8.self)
            if !str.isEmpty {
                DispatchQueue.main.async {
                    guard let self, self.process === process, self.status != .stopped else { return }
                    let visibleOutput = self.outputWithoutCLIHelp(str)
                    self.appendLog(visibleOutput)
                    self.parseProcessOutput(str, from: process)
                }
            }
        }
    }

    private func outputWithoutCLIHelp(_ text: String) -> String {
        guard !isSuppressingCLIHelpOutput else { return "" }

        let pattern = #"(?m)^Usage:\s*$"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let range = Range(match.range, in: text) else {
            return text
        }

        isSuppressingCLIHelpOutput = true
        return String(text[..<range.lowerBound])
    }

    private func parseProcessOutput(_ text: String, from process: Process) {
        guard self.process === process, self.status != .stopped else { return }

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
            "no route to host",
            "temporary failure",
            "tls handshake timeout",
            "status code 429",
            "status code 500",
            "status code 502",
            "status code 503",
            "status code 504"
        ]
        if transientFailureMarkers.contains(where: processOutputBuffer.contains) {
            currentFailureAllowsExtendedRetry = true
        }
        if let subdomain = currentLaunchSubdomain {
            currentFailureConfirmsMissingTunnel = processOutputBuffer.contains("tunnel with subdomain \(subdomain.lowercased()) not found")
                || processOutputBuffer.contains("tunnel has expired")
        }
        if processOutputBuffer.contains("tunnel limit reached") {
            currentFailureIsTunnelLimit = true
        }
        if processOutputBuffer.contains("anonymous tunnel limit reached") {
            currentFailureIsAnonymousLimit = true
        }
        if processOutputBuffer.contains("daily request limit exceeded") {
            currentFailureIsDailyRequestLimit = true
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
        let requestID = UUID()
        binaryRepairRequestID = requestID
        retryWorkItem?.cancel()
        retryWorkItem = nil
        processBeingReplaced = staleProcess
        appendLog("Installed InstaTunnel version is no longer supported. Downloading the latest version automatically...\n")
        staleProcess.terminate()

        InstaTunnelDownloader.shared.downloadInstaTunnel { [weak self] success in
            guard let self, self.binaryRepairRequestID == requestID else { return }
            self.binaryRepairRequestID = nil
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
        // `connect` never prints the full public URL ("Connecting to existing tunnel:
        // xxx.instatunnel.my"), so rebuild it from the subdomain once connected.
        if let reconnectSubdomain = currentLaunchSubdomain,
           text.contains("tunnel connected and ready") {
            markTunnelRunning(url: "https://\(reconnectSubdomain).instatunnel.my")
            return
        }

        // Errors and help output also contain URLs such as api.instatunnel.my.
        // Only a URL on the CLI's explicit success line represents a live tunnel.
        let successLine = text.components(separatedBy: .newlines).first { line in
            line.contains("your app is now live at")
                || line.contains("tunnel created:")
                || line.contains("public url:")
                || line.contains("tunnel url:")
                || line.contains("forwarding https://")
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

        markTunnelRunning(url: url)
    }

    private func markTunnelRunning(url: String) {
        guard let host = URL(string: url)?.host else { return }

        if case .starting = self.status {
            self.status = .running(url: url)
            self.retryCount = 0
            self.consecutiveHealthCheckFailures = 0
            self.isRetrying = false
            self.didAttemptAutomaticUpdate = false

            let subdomain = String(host.dropLast(".instatunnel.my".count))
            rememberTunnel(subdomain: subdomain)

            // Sync to iCloud
            ICloudManager.shared.syncServer(url: url, isOffline: false)

            // Publish to MQTT for cross-network remote access
            MQTTRemoteSync.shared.publishURL(url)

            // Keep working sessions connected. On an actual expiry/failure, try
            // the saved subdomain first and let the server confirm its lifetime.
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
    @AppStorage("instaTunnelApiKey") private var apiKey: String = ""

    @State private var showingQRPopover = false
    
    @State private var showingErrorAlert = false
    @State private var errorMessage = ""
    
    var body: some View {
        VStack(spacing: 12) {
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
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(Color(NSColor.controlBackgroundColor).opacity(0.8))
        .cornerRadius(12)
    }
    
    @ViewBuilder
    private var optionsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
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

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(i18n.t("instatunnel_api_key"))
                        .font(.headline)
                        .fixedSize()
                    SecureField(i18n.t("instatunnel_api_key_placeholder"), text: $apiKey)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit {
                            ICloudAPIKeySync.shared.push()
                            tunnelManager.applyAPIKeyChange()
                        }
                    Link(i18n.t("instatunnel_signup"), destination: URL(string: "https://instatunnel.my/get-started")!)
                        .font(.caption)
                        .foregroundColor(.blue)
                        .fixedSize()
                }
                Text(i18n.t("instatunnel_api_key_desc"))
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()

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
        .padding(.horizontal)
        .padding(.vertical, 12)
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
                .frame(minHeight: 120, maxHeight: .infinity)
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
