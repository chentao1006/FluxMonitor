import SwiftUI
import Foundation

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

class ICloudManager: NSObject, ObservableObject, NSFilePresenter {
    static let shared = ICloudManager()
    
    // NSFilePresenter requirements
    var presentedItemURL: URL? {
        guard let containerURL = getUbiquityURL() else { return nil }
        return containerURL.appendingPathComponent(localFileName)
    }
    
    var presentedItemOperationQueue: OperationQueue = .main
    
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
    
    private override init() {
        super.init()
        createDirectoryIfNeeded()
        // Register as a file presenter to monitor for external changes
        NSFileCoordinator.addFilePresenter(self)
    }
    
    deinit {
        NSFileCoordinator.removeFilePresenter(self)
    }
    
    // Triggered when iCloud syncs a version from another device
    func presentedItemDidChange() {
        guard let url = presentedItemURL, 
              FileManager.default.fileExists(atPath: url.path),
              UserDefaults.standard.bool(forKey: "icloudSyncEnabled") else { return }
        
        // Use file coordinator to read the current state on disk
        let coordinator = NSFileCoordinator(filePresenter: self)
        coordinator.coordinate(readingItemAt: url, options: [], error: nil) { readURL in
            guard let data = try? Data(contentsOf: readURL),
                  let cloudData = try? JSONDecoder().decode(CloudServer.self, from: data) else { return }
            
            // Compare with our actual local state
            let currentTunnelStatus = TunnelManager.shared.status
            var isActuallyOffline = true
            var currentUrl: String? = nil
            
            if case .running(let url) = currentTunnelStatus {
                isActuallyOffline = false
                currentUrl = url
            }
            
            // If the file from cloud says we are offline but we are online, or has wrong URL
            // we re-assert our authority immediately.
            let needsCorrection = (cloudData.isOffline != isActuallyOffline) || 
                                  (cloudData.url != (currentUrl ?? ""))
            
            if needsCorrection {
                TunnelManager.shared.appendLog("[iCloud] External modification detected, re-asserting local authority...\n")
                self.syncServer(url: currentUrl, isOffline: isActuallyOffline)
            }
        }
    }
    
    func syncServer(url: String?, isOffline: Bool = false, retryCount: Int = 0) {
        let i18n = I18N.shared
        guard UserDefaults.standard.bool(forKey: "icloudSyncEnabled") else { return }
        
        guard let containerURL = ubiquityURL else {
            // If it's the first few retries, wait and try again
            if retryCount < 3 {
                let nextRetry = retryCount + 1
                TunnelManager.shared.appendLog("[iCloud] Container not ready, retrying (\(nextRetry)/3)...\n")
                DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                    self.syncServer(url: url, isOffline: isOffline, retryCount: nextRetry)
                }
            } else {
                TunnelManager.shared.appendLog("[iCloud] \(i18n.t("icloud_unavailable"))\n")
            }
            return
        }
        
        let targetStatus = isOffline ? "Offline" : "Online"
        TunnelManager.shared.appendLog("[iCloud] \(i18n.t("icloud_sync_starting")) (\(targetStatus))...\n")
        
        // 1. Sync to NEW individual file
        let fileURL = containerURL.appendingPathComponent(localFileName)
        let coordinator = NSFileCoordinator(filePresenter: self)
        
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
    }
    
    func removeFromCloud() {
        let i18n = I18N.shared
        guard let containerURL = ubiquityURL else { return }
        
        // 1. Remove NEW individual file
        let fileURL = containerURL.appendingPathComponent(localFileName)
        let coordinator = NSFileCoordinator(filePresenter: self)
        coordinator.coordinate(writingItemAt: fileURL, options: [.forDeleting], error: nil) { writeURL in
            try? FileManager.default.removeItem(at: writeURL)
            TunnelManager.shared.appendLog("[iCloud] \(i18n.t("icloud_sync_removed"))\n")
        }
    }
    
    private func createDirectoryIfNeeded() {
        guard let url = ubiquityURL else { return }
        if !FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        }
    }
}

// MARK: - InstaTunnel API Key Synchronization

// The key lives in the container root rather than Documents, so it is shared
// between Macs on the same iCloud account without showing up in iCloud Drive.
class ICloudAPIKeySync: NSObject, NSFilePresenter {
    static let shared = ICloudAPIKeySync()

    static let apiKeyDefaultsKey = "instaTunnelApiKey"
    private let updatedAtDefaultsKey = "instaTunnelApiKeyUpdatedAt"

    private struct Payload: Codable {
        var apiKey: String
        var updatedAt: Date
    }

    var presentedItemURL: URL? {
        FileManager.default.url(forUbiquityContainerIdentifier: "iCloud.com.ct106.flux.shared")?
            .appendingPathComponent("instatunnel.json")
    }

    var presentedItemOperationQueue: OperationQueue = .main

    private override init() {
        super.init()
        NSFileCoordinator.addFilePresenter(self)
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.pull()
        }
    }

    deinit {
        NSFileCoordinator.removeFilePresenter(self)
    }

    func start() {
        pull()
    }

    // Triggered when iCloud syncs a version from another device
    func presentedItemDidChange() {
        pull()
    }

    func push() {
        guard let url = presentedItemURL else {
            TunnelManager.shared.appendLog("[iCloud] \(I18N.shared.t("icloud_unavailable"))\n")
            return
        }

        let payload = Payload(
            apiKey: UserDefaults.standard.string(forKey: Self.apiKeyDefaultsKey) ?? "",
            updatedAt: Date()
        )
        UserDefaults.standard.set(payload.updatedAt, forKey: updatedAtDefaultsKey)

        let coordinator = NSFileCoordinator(filePresenter: self)
        coordinator.coordinate(writingItemAt: url, options: [], error: nil) { writeURL in
            if let data = try? JSONEncoder().encode(payload), (try? data.write(to: writeURL)) != nil {
                TunnelManager.shared.appendLog("[iCloud] InstaTunnel API key synced to iCloud\n")
            }
        }
    }

    private func pull() {
        guard let url = presentedItemURL else { return }
        try? FileManager.default.startDownloadingUbiquitousItem(at: url)
        guard FileManager.default.fileExists(atPath: url.path) else { return }

        var payload: Payload?
        let coordinator = NSFileCoordinator(filePresenter: self)
        coordinator.coordinate(readingItemAt: url, options: [], error: nil) { readURL in
            if let data = try? Data(contentsOf: readURL) {
                payload = try? JSONDecoder().decode(Payload.self, from: data)
            }
        }

        // Last write wins; ignore our own or older copies.
        guard let payload else { return }
        let localUpdatedAt = UserDefaults.standard.object(forKey: updatedAtDefaultsKey) as? Date ?? .distantPast
        guard payload.updatedAt > localUpdatedAt else { return }

        let changed = payload.apiKey != (UserDefaults.standard.string(forKey: Self.apiKeyDefaultsKey) ?? "")
        UserDefaults.standard.set(payload.apiKey, forKey: Self.apiKeyDefaultsKey)
        UserDefaults.standard.set(payload.updatedAt, forKey: updatedAtDefaultsKey)

        if changed {
            TunnelManager.shared.appendLog("[iCloud] Received InstaTunnel API key from iCloud\n")
            TunnelManager.shared.applyAPIKeyChange()
        }
    }
}
