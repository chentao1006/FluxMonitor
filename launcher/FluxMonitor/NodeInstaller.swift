import Foundation
import Combine

class NodeInstaller: ObservableObject {
    static let shared = NodeInstaller()
    
    enum InstallStatus: Equatable {
        case idle
        case downloading(progress: Double)
        case extracting
        case completed
        case failed(error: String)
        
        var description: String {
            let i18n = I18N.shared
            switch self {
            case .idle: return i18n.t("node_idle")
            case .downloading(let p): return String(format: i18n.t("node_downloading"), Int(p * 100))
            case .extracting: return i18n.t("node_extracting")
            case .completed: return i18n.t("node_completed")
            case .failed(let e): return String(format: i18n.t("node_failed"), e)
            }
        }
    }
    
    @Published var status: InstallStatus = .idle
    @Published var showingConfirmation = false
    
    private var cancellables = Set<AnyCancellable>()
    private var downloadTask: URLSessionDownloadTask?
    private var installationCompletion: ((Bool) -> Void)?
    
    private let nodeVersion = "20.11.1"
    private var appSupportDir: URL {
        let bundleID = Bundle.main.bundleIdentifier!
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent(bundleID, isDirectory: true)
    }
    
    var localNodePath: String {
        appSupportDir.appendingPathComponent("bin").appendingPathComponent("node").path
    }
    
    func isNodeInstalled() -> Bool {
        return FileManager.default.fileExists(atPath: localNodePath) && 
               FileManager.default.isExecutableFile(atPath: localNodePath)
    }
    
    func fixPermissions(at path: String) -> Bool {
        do {
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: path)
            ProcessManager.shared.appendLog("Fixed executable permissions for \(path)\n")
            return true
        } catch {
            ProcessManager.shared.appendLog("Failed to fix permissions for \(path): \(error.localizedDescription)\n")
            return false
        }
    }
    
    func installIfNeeded(force: Bool = false, completion: @escaping (Bool) -> Void) {
        self.installationCompletion = completion
        
        if !force && isNodeInstalled() {
            completion(true)
            return
        }
        
        // Instead of starting immediately, show confirmation
        DispatchQueue.main.async {
            self.showingConfirmation = true
        }
    }
    
    func confirmDownload() {
        startInstall(completion: self.installationCompletion ?? { _ in })
    }
    
    private func startInstall(completion: @escaping (Bool) -> Void) {
        let arch = getArchitecture()
        
        // Use mirror for Chinese users to avoid TLS/Network issues
        let baseUrl = I18N.shared.t("node_mirror_url")
            
        let urlString = "\(baseUrl)/v\(nodeVersion)/node-v\(nodeVersion)-darwin-\(arch).tar.gz"
        
        guard let url = URL(string: urlString) else {
            let errorMsg = "Invalid URL: \(urlString)"
            ProcessManager.shared.appendLog("\(errorMsg)\n")
            self.status = .failed(error: errorMsg)
            completion(false)
            return
        }
        
        ProcessManager.shared.appendLog("Starting download from: \(urlString)\n")
        self.status = .downloading(progress: 0)
        self.installationCompletion = completion
        
        let session = URLSession(configuration: .default, delegate: DownloadDelegate(installer: self), delegateQueue: nil)
        downloadTask = session.downloadTask(with: url)
        downloadTask?.resume()
    }
    
    private func getArchitecture() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let identifier = machineMirror.children.reduce("") { identifier, element in
            guard let value = element.value as? Int8, value != 0 else { return identifier }
            return identifier + String(UnicodeScalar(UInt8(value)))
        }
        return identifier == "arm64" ? "arm64" : "x64"
    }
    
    fileprivate func handleDownloadFinish(url: URL) {
        self.status = .extracting
        
        let binDir = appSupportDir.appendingPathComponent("bin", isDirectory: true)
        // Clean wipe before extraction to ensure no stale/broken bits
        try? FileManager.default.removeItem(at: binDir)
        try? FileManager.default.createDirectory(at: binDir, withIntermediateDirectories: true)
        
        let arch = getArchitecture()
        _ = "node-v\(nodeVersion)-darwin-\(arch)" // Removed unused folderName dependency but leaving comment if needed
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/tar")
        // Extract to a NEW temporary directory first, then move contents to binDir
        let extractTempDir = appSupportDir.appendingPathComponent("extract_temp", isDirectory: true)
        try? FileManager.default.removeItem(at: extractTempDir)
        try? FileManager.default.createDirectory(at: extractTempDir, withIntermediateDirectories: true)
        
        process.arguments = ["-xzf", url.path, "-C", extractTempDir.path, "--strip-components=1"]
        
        do {
            try process.run()
            process.waitUntilExit()
            
            if process.terminationStatus == 0 {
                let extractedNodePath = extractTempDir.appendingPathComponent("bin").appendingPathComponent("node").path
                
                // Set executable permission via native FileManager API ON THE EXTRACTED FILE
                _ = fixPermissions(at: extractedNodePath)
                
                // Move from extraction temp to final localNodePath
                // This 'fresh' move into Application Support often helps with Sandbox execution bits
                do {
                    let fileManager = FileManager.default
                    if fileManager.fileExists(atPath: localNodePath) {
                        try fileManager.removeItem(atPath: localNodePath)
                    }
                    try fileManager.moveItem(atPath: extractedNodePath, toPath: localNodePath)
                    
                    // Final permission fix at the destination
                    _ = fixPermissions(at: localNodePath)
                    
                    // Double-safe quarantine removal
                    let nodeUrl = URL(fileURLWithPath: localNodePath)
                    try? (nodeUrl as NSURL).setResourceValue(false, forKey: URLResourceKey("NSURLIsQuarantinedKey"))
                    
                    // Cleanup extract temp
                    try? fileManager.removeItem(at: extractTempDir)
                    
                    ProcessManager.shared.appendLog("Successfully moved and prepared Node.js for execution\n")
                } catch {
                    ProcessManager.shared.appendLog("Failed to move/prepare Node.js: \(error.localizedDescription)\n")
                }
                
                DispatchQueue.main.async {
                    self.status = .completed
                    self.installationCompletion?(true)
                    self.installationCompletion = nil
                }
            } else {
                let errorMsg = "Extraction failed (code \(process.terminationStatus))"
                ProcessManager.shared.appendLog("\(errorMsg)\n")
                DispatchQueue.main.async {
                    self.status = .failed(error: errorMsg)
                    self.installationCompletion?(false)
                    self.installationCompletion = nil
                }
            }
        } catch {
            let errorMsg = "Extraction error: \(error.localizedDescription)"
            ProcessManager.shared.appendLog("\(errorMsg)\n")
            DispatchQueue.main.async {
                self.status = .failed(error: errorMsg)
                self.installationCompletion?(false)
                self.installationCompletion = nil
            }
        }
    }
}

class DownloadDelegate: NSObject, URLSessionDownloadDelegate {
    let installer: NodeInstaller
    
    init(installer: NodeInstaller) {
        self.installer = installer
    }
    
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        let progress = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
        DispatchQueue.main.async {
            self.installer.status = .downloading(progress: progress)
        }
    }
    
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // Move to a persistent location for tar to work reliably
        let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent("node_install.tar.gz")
        try? FileManager.default.removeItem(at: tempUrl)
        try? FileManager.default.moveItem(at: location, to: tempUrl)
        
        installer.handleDownloadFinish(url: tempUrl)
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            let errorMsg = "Download failed: \(error.localizedDescription)"
            ProcessManager.shared.appendLog("[ERROR] \(errorMsg)\n")
            DispatchQueue.main.async {
                self.installer.status = .failed(error: errorMsg)
                self.installer.completionHandler?(false)
                self.installer.clearCompletionHandler()
            }
        }
    }
}

extension NodeInstaller {
    fileprivate var completionHandler: ((Bool) -> Void)? {
        get { return installationCompletion }
    }
    
    fileprivate func clearCompletionHandler() {
        self.installationCompletion = nil
    }
}
