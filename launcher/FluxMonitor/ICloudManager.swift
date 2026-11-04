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
    // Preserve a reconnecting device's registration while its public URL is offline.
    var tunnelReservationURL: String?
    // Explicitly distinguish a released reservation from a legacy client.
    var tunnelReservationSupported: Bool?
    
    enum CodingKeys: String, CodingKey {
        case id, name, url, username, isOffline, isLauncher, tunnelReservationURL, tunnelReservationSupported
    }
}

class ICloudManager: NSObject, ObservableObject, NSFilePresenter {
    static let shared = ICloudManager()
    private var reservedTunnelURL: String?
    private var syncRequestID = UUID()
    
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
                                  (cloudData.url != (currentUrl ?? "")) ||
                                  (cloudData.tunnelReservationURL != self.reservedTunnelURL)
            
            if needsCorrection {
                TunnelManager.shared.appendLog("[iCloud] External modification detected, re-asserting local authority...\n")
                self.syncServer(url: currentUrl, isOffline: isActuallyOffline, preservingTunnelReservation: true)
            }
        }
    }
    
    func reserveTunnel(url: String) {
        reservedTunnelURL = url
        syncServer(url: nil, isOffline: true, preservingTunnelReservation: true)
    }

    func syncServer(url: String?, isOffline: Bool = false, preservingTunnelReservation: Bool = false) {
        syncRequestID = UUID()
        if let url, !url.isEmpty {
            reservedTunnelURL = url
        } else if !preservingTunnelReservation {
            reservedTunnelURL = nil
        }
        writeServer(url: url, isOffline: isOffline, requestID: syncRequestID)
    }

    private func writeServer(url: String?, isOffline: Bool, requestID: UUID, retryCount: Int = 0) {
        guard requestID == syncRequestID else { return }
        let i18n = I18N.shared
        guard UserDefaults.standard.bool(forKey: "icloudSyncEnabled") else { return }
        
        guard let containerURL = ubiquityURL else {
            // If it's the first few retries, wait and try again
            if retryCount < 3 {
                let nextRetry = retryCount + 1
                TunnelManager.shared.appendLog("[iCloud] Container not ready, retrying (\(nextRetry)/3)...\n")
                DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                    self.writeServer(url: url, isOffline: isOffline, requestID: requestID, retryCount: nextRetry)
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
            isLauncher: true,
            tunnelReservationURL: reservedTunnelURL,
            tunnelReservationSupported: true
        )
        
        coordinator.coordinate(writingItemAt: fileURL, options: [], error: nil) { writeURL in
            if let data = try? JSONEncoder().encode(server) {
                try? data.write(to: writeURL)
                TunnelManager.shared.appendLog("[iCloud] \(i18n.t("icloud_sync_success"))\n")
            }
        }
    }

    // An incomplete cloud snapshot must never authorize closing a remote tunnel.
    func protectedTunnelSubdomains(now: Date = Date()) throws -> Set<String> {
        guard UserDefaults.standard.bool(forKey: "icloudSyncEnabled"),
              let directory = ubiquityURL else {
            throw NSError(domain: "TunnelCleanup", code: 1, userInfo: [NSLocalizedDescriptionKey: "iCloud sync is unavailable or disabled"])
        }
        let keys: Set<URLResourceKey> = [.isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey, .contentModificationDateKey]
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: Array(keys))
        guard files.contains(where: { $0.lastPathComponent == localFileName }) else {
            throw NSError(domain: "TunnelCleanup", code: 2, userInfo: [NSLocalizedDescriptionKey: "this device's iCloud record is not ready"])
        }
        var protected = Set<String>()
        for file in files {
            let name = file.lastPathComponent
            if name.hasPrefix(".server_"), name.hasSuffix(".icloud") {
                try? FileManager.default.startDownloadingUbiquitousItem(at: file)
                throw NSError(domain: "TunnelCleanup", code: 3, userInfo: [NSLocalizedDescriptionKey: "device records are still downloading"])
            }
            guard name.hasPrefix("server_"), file.pathExtension == "json" else { continue }
            let values = try file.resourceValues(forKeys: keys)
            if values.isUbiquitousItem == true, values.ubiquitousItemDownloadingStatus != .current {
                try? FileManager.default.startDownloadingUbiquitousItem(at: file)
                throw NSError(domain: "TunnelCleanup", code: 3, userInfo: [NSLocalizedDescriptionKey: "device records are still downloading"])
            }
            var record: CloudServer?
            var readError: Error?
            var coordinationError: NSError?
            NSFileCoordinator(filePresenter: self).coordinate(readingItemAt: file, options: [], error: &coordinationError) { readURL in
                do { record = try JSONDecoder().decode(CloudServer.self, from: Data(contentsOf: readURL)) }
                catch { readError = error }
            }
            if let coordinationError { throw coordinationError }
            if let readError { throw readError }
            guard let record else { throw NSError(domain: "TunnelCleanup", code: 4) }
            // Old clients have no reservation field. Give recent offline transitions
            // time to settle instead of deleting a tunnel during their restart.
            if name != localFileName, record.tunnelReservationSupported != true,
               record.isOffline == true, record.tunnelReservationURL == nil,
               let modifiedAt = values.contentModificationDate, now.timeIntervalSince(modifiedAt) < 10 * 60 {
                throw NSError(domain: "TunnelCleanup", code: 5, userInfo: [NSLocalizedDescriptionKey: "legacy offline device \(record.name) (\(record.id)) is still settling"])
            }
            for url in [record.isOffline == true ? nil : record.url, record.tunnelReservationURL].compactMap({ $0 }) {
                if let host = URL(string: url)?.host?.lowercased(), host.hasSuffix(".instatunnel.my") {
                    protected.insert(String(host.dropLast(".instatunnel.my".count)))
                }
            }
        }
        return protected
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

    private var metadataQuery: NSMetadataQuery?

    func start() {
        pull()
        startMetadataQuery()
    }

    // NSFilePresenter is not reliably notified when a file that did not exist at
    // registration arrives from iCloud, and the first copy may still be an
    // undownloaded placeholder. A metadata query reports both arrival and download.
    private func startMetadataQuery() {
        guard metadataQuery == nil else { return }
        let query = NSMetadataQuery()
        query.searchScopes = [NSMetadataQueryUbiquitousDataScope]
        query.predicate = NSPredicate(format: "%K == %@", NSMetadataItemFSNameKey, "instatunnel.json")
        NotificationCenter.default.addObserver(self, selector: #selector(metadataQueryDidUpdate), name: .NSMetadataQueryDidFinishGathering, object: query)
        NotificationCenter.default.addObserver(self, selector: #selector(metadataQueryDidUpdate), name: .NSMetadataQueryDidUpdate, object: query)
        metadataQuery = query
        query.start()
    }

    @objc private func metadataQueryDidUpdate(_ notification: Notification) {
        metadataQuery?.disableUpdates()
        defer { metadataQuery?.enableUpdates() }
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
