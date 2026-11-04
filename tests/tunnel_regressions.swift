// Appended to the production managers by tunnel_regressions.py.
var checks = 0
func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    guard condition() else { fatalError(message) }
    checks += 1
}
func waitUntil(_ condition: () -> Bool) {
    let deadline = Date().addingTimeInterval(3)
    while !condition(), Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
    expect(condition(), "Timed out waiting for an asynchronous result")
}
func drain() { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
let manager = TunnelManager.shared
manager.healthCheckTimer?.invalidate()
let key = "regression-key"
let keyedStorage = manager.tunnelStorageKey(apiKey: key)
let anonymousStorage = manager.tunnelStorageKey(apiKey: nil)
func reset() {
    manager.stop()
    drain()
    regressionDefaults.removePersistentDomain(forName: suiteName)
    regressionDefaults.set(key, forKey: "instaTunnelApiKey")
    manager.currentLaunchTunnelStorageKey = keyedStorage
    manager.currentLaunchUsedAPIKey = true
    manager.currentLaunchSubdomain = nil
    manager.processOutputBuffer = ""
    manager.currentFailureAllowsExtendedRetry = false
    manager.currentFailureConfirmsMissingTunnel = false
    manager.lastTunnelCleanupAt = nil
    manager.shouldUseAnonymousFallback = false
    FakeHTTP.requests = []
    FakeHTTP.reply = { _ in (200, Data()) }
    for file in try! FileManager.default.contentsOfDirectory(at: regressionRoot.appendingPathComponent("cloud"), includingPropertiesForKeys: nil) {
        try! FileManager.default.removeItem(at: file)
    }
}
func writeCloud(_ record: CloudServer, old: Bool = false) {
    let url = regressionRoot.appendingPathComponent("cloud/server_\(record.id).json")
    try! JSONEncoder().encode(record).write(to: url)
    if old { try! FileManager.default.setAttributes([.modificationDate: Date().addingTimeInterval(-3600)], ofItemAtPath: url.path) }
}
func prepareCloud() {
    regressionDefaults.set(true, forKey: "icloudSyncEnabled")
    regressionDefaults.set("local", forKey: "icloud_local_server_id")
    writeCloud(CloudServer(id: "local", name: "Local", url: "", isOffline: true), old: true)
    writeCloud(CloudServer(id: "other", name: "Other", url: "https://other.instatunnel.my", isOffline: false))
    writeCloud(CloudServer(id: "reconnecting", name: "Reconnecting", url: "", isOffline: true, tunnelReservationURL: "https://reserved.instatunnel.my"))
}
func accountList() -> Data {
    let old = "2020-01-01T00:00:00.123456Z"
    let fresh = ISO8601DateFormatter().string(from: Date())
    return try! JSONSerialization.data(withJSONObject: [
        ["id": 1, "subdomain": "other", "status": "active", "updated_at": old],
        ["id": 2, "subdomain": "reserved", "status": "active", "updated_at": old],
        ["id": 3, "subdomain": "local-saved", "status": "active", "updated_at": old],
        ["id": 4, "subdomain": "orphan", "status": "active", "updated_at": old],
        ["id": 5, "subdomain": "fresh", "status": "active", "updated_at": fresh],
        ["id": 6, "subdomain": "expired", "status": "expired", "updated_at": old]
    ])
}

reset()
manager.saveTunnel(.init(subdomain: "local-saved", createdAt: Date().addingTimeInterval(-48 * 3600)), key: keyedStorage)
expect(manager.reusableSubdomain == "local-saved", "Age must not discard a server registration")
manager.currentLaunchTunnelStorageKey = anonymousStorage
manager.rememberTunnel(subdomain: "anonymous")
expect(manager.reusableSubdomain == "anonymous", "Anonymous mode must have its own record")
manager.currentLaunchTunnelStorageKey = keyedStorage
expect(manager.reusableSubdomain == "local-saved", "Fallback must not overwrite the keyed record")
manager.currentLaunchTunnelStorageKey = manager.tunnelStorageKey(apiKey: "different-key")
expect(manager.reusableSubdomain == nil, "Different keys must not share tunnel ownership")

// Exercise actual Process stderr/EOF/exit coordination, including the reported bug.
for (error, shouldForget) in [
    ("failed to check tunnel existence: Get endpoint: EOF", false),
    ("failed to check tunnel existence: no route to host", false),
    ("failed to check tunnel existence: unexpected status code: 401", false),
    ("failed to create tunnel: tunnel limit reached: 3/3 active tunnels", false),
    ("tunnel with subdomain local-saved not found", true)
] {
    reset()
    // Disable network cleanup here; test exit classification independently.
    manager.lastTunnelCleanupAt = Date()
    manager.saveTunnel(.init(subdomain: "local-saved", createdAt: Date()), key: keyedStorage)
    let script = "#!/bin/sh\nprintf '%s\\n' '\(error)' >&2\nexit 1\n"
    let path = InstaTunnelDownloader.shared.localInstaTunnelPath
    try! script.write(toFile: path, atomically: true, encoding: .utf8)
    try! FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: path)
    manager.launchProcess(binaryPath: path, port: 4210)
    expect(manager.process?.arguments?.prefix(2) == ["connect", "4210"][...], "Recovery must reconnect instead of creating")
    waitUntil { manager.process == nil && manager.retryWorkItem != nil }
    manager.currentLaunchTunnelStorageKey = keyedStorage
    expect((manager.reusableSubdomain == nil) == shouldForget, "Incorrect saved-tunnel decision for: \(error)")
    if error.contains("EOF") || error.contains("no route") {
        expect(manager.currentFailureAllowsExtendedRetry, "Reconnect network errors need extended retry")
    }
}

reset()
manager.start(port: 4210)
let requestID = manager.startRequestID
manager.start(port: 4210)
expect(requestID != nil && manager.startRequestID == requestID, "Concurrent starts must share one port check")
manager.stop()
drain()
expect(manager.process == nil && manager.status == .stopped, "A late port check must not undo stop")
manager.restart()
expect(manager.restartWorkItem != nil, "Restart should own its delayed start")
manager.stop()
expect(manager.restartWorkItem == nil, "Manual stop must cancel delayed restart")
manager.currentLaunchTunnelStorageKey = keyedStorage
manager.status = .running(url: "https://local-saved.instatunnel.my")
manager.applyAPIKeyChange()
expect(manager.status.isRunning && manager.restartWorkItem == nil, "Submitting an unchanged key must keep a working connection")

reset()
manager.repairIncompatibleBinary(port: 4210)
expect(manager.isAutomaticallyUpdating, "Binary repair must own recovery while downloading")
manager.stop()
InstaTunnelDownloader.shared.pendingCompletion?(true)
expect(manager.status == .stopped && manager.startRequestID == nil, "A completed repair must not restart a stopped tunnel")
expect(!manager.isAutomaticallyUpdating, "Cancelled repair must release its recovery state")

reset()
let log = """
[2026-01-01 00:00:00] Starting InstaTunnel from: fake
[2026-01-01 00:00:00] Authentication mode: API key (using the saved key).
[2026-01-01 00:00:01] Your app is now live at https://recovered.instatunnel.my
[2026-01-01 01:00:00] Starting InstaTunnel from: fake
[2026-01-01 01:00:00] Authentication mode: anonymous fallback.
[2026-01-01 01:00:01] Your app is now live at https://anonymous.instatunnel.my
"""
manager.restoreSavedTunnels(from: log)
expect(manager.reusableSubdomain == "recovered", "Recover erased keyed metadata from successful local logs")
manager.currentLaunchTunnelStorageKey = anonymousStorage
expect(manager.reusableSubdomain == "anonymous", "Recover anonymous logs into their own record")
reset()
regressionDefaults.set(Date(), forKey: "instaTunnelApiKeyUpdatedAt")
manager.restoreSavedTunnels(from: log)
expect(manager.reusableSubdomain == nil, "Never assign a prior key's log to a replacement key")

reset()
prepareCloud()
manager.saveTunnel(.init(subdomain: "local-saved", createdAt: Date()), key: keyedStorage)
let protected = try! manager.protectedSubdomainsForCleanup(apiKey: key)
expect(protected == ["other", "reserved", "local-saved"], "Protect online, reconnecting and local saved tunnels")
FakeHTTP.reply = { request in
    expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(key)", "Account operations must authenticate")
    return request.httpMethod == "DELETE" ? (204, Data()) : (200, accountList())
}
var cleaned: Bool?
manager.cleanupUnusedAccountTunnel { cleaned = $0 }
waitUntil { cleaned != nil }
expect(cleaned == true, "An unreferenced idle registration should free a slot")
let deletes = FakeHTTP.requests.filter { $0.httpMethod == "DELETE" }
expect(deletes.count == 1 && deletes[0].url!.path == "/api/tunnels/4", "Close only one orphan; protect all used and fresh registrations")

reset()
prepareCloud()
manager.saveTunnel(.init(subdomain: "local-saved", createdAt: Date()), key: keyedStorage)
var reads = 0
FakeHTTP.reply = { _ in
    reads += 1
    if reads == 2 {
        writeCloud(CloudServer(id: "new-owner", name: "New Owner", url: "https://orphan.instatunnel.my", isOffline: false))
    }
    return (200, accountList())
}
cleaned = nil
manager.cleanupUnusedAccountTunnel { cleaned = $0 }
waitUntil { cleaned != nil }
expect(cleaned == false && FakeHTTP.requests.allSatisfy { $0.httpMethod != "DELETE" }, "Recheck iCloud before deletion to protect a new owner")

reset()
prepareCloud()
manager.saveTunnel(.init(subdomain: "local-saved", createdAt: Date()), key: keyedStorage)
reads = 0
FakeHTTP.reply = { _ in
    reads += 1
    if reads == 2 {
        let formatter = ISO8601DateFormatter()
        var list = try! JSONSerialization.jsonObject(with: accountList()) as! [[String: Any]]
        list[3]["updated_at"] = formatter.string(from: Date())
        return (200, try! JSONSerialization.data(withJSONObject: list))
    }
    return (200, accountList())
}
cleaned = nil
manager.cleanupUnusedAccountTunnel { cleaned = $0 }
waitUntil { cleaned != nil }
expect(cleaned == false && FakeHTTP.requests.allSatisfy { $0.httpMethod != "DELETE" }, "A newly reconnected server registration must survive cleanup")

for failure in ["list-error", "delete-error"] {
    reset()
    prepareCloud()
    manager.saveTunnel(.init(subdomain: "local-saved", createdAt: Date()), key: keyedStorage)
    FakeHTTP.reply = { request in
        if failure == "list-error" || request.httpMethod == "DELETE" { return (503, Data()) }
        return (200, accountList())
    }
    cleaned = nil
    manager.cleanupUnusedAccountTunnel { cleaned = $0 }
    waitUntil { cleaned != nil }
    expect(cleaned == false, "Never report a freed slot when an API operation failed")
    if failure == "list-error" {
        expect(FakeHTTP.requests.allSatisfy { $0.httpMethod != "DELETE" }, "A failed account listing must prohibit deletion")
    }
}

reset()
prepareCloud()
manager.saveTunnel(.init(subdomain: "local-saved", createdAt: Date()), key: keyedStorage)
manager.shouldUseAnonymousFallback = true
manager.retryCount = manager.maxAutomaticRetries
FakeHTTP.reply = { request in request.httpMethod == "DELETE" ? (204, Data()) : (200, accountList()) }
manager.handleRetry(port: 4210, isTunnelLimit: true, switchingToAnonymous: true)
waitUntil { manager.cleanupRequestID == nil && manager.retryWorkItem != nil }
expect(!manager.shouldUseAnonymousFallback, "A released slot should retry the key before anonymous fallback")

reset()
manager.shouldUseAnonymousFallback = true
manager.handleRetry(port: 4210, isTunnelLimit: true, switchingToAnonymous: true)
expect(manager.shouldUseAnonymousFallback && manager.retryWorkItem != nil, "Unavailable iCloud must preserve the existing anonymous fallback")

for invalidCloud in ["disabled", "corrupt", "missing-local", "recent-offline"] {
    reset()
    prepareCloud()
    switch invalidCloud {
    case "disabled": regressionDefaults.set(false, forKey: "icloudSyncEnabled")
    case "corrupt": try! Data("invalid".utf8).write(to: regressionRoot.appendingPathComponent("cloud/server_bad.json"))
    case "missing-local": try! FileManager.default.removeItem(at: regressionRoot.appendingPathComponent("cloud/server_local.json"))
    default: writeCloud(CloudServer(id: "recent", name: "Recent", url: "", isOffline: true))
    }
    cleaned = nil
    manager.cleanupUnusedAccountTunnel { cleaned = $0 }
    expect(cleaned == false && FakeHTTP.requests.isEmpty, "Incomplete iCloud must prevent cleanup: \(invalidCloud)")
}

reset()
prepareCloud()
FakeHTTP.reply = { _ in (200, accountList()) }
manager.cleanupUnusedAccountTunnel { _ in fatalError("Cancelled cleanup must not schedule recovery") }
manager.stop()
drain()
expect(FakeHTTP.requests.allSatisfy { $0.httpMethod != "DELETE" }, "Stopping must cancel pending destructive cleanup")

reset()
prepareCloud()
FakeHTTP.reply = { _ in (200, accountList()) }
cleaned = nil
manager.cleanupUnusedAccountTunnel { cleaned = $0 }
regressionDefaults.set("changed-key", forKey: "instaTunnelApiKey")
waitUntil { cleaned != nil }
expect(cleaned == false && manager.cleanupRequestID == nil, "Changing credentials must not leave recovery permanently waiting")
expect(FakeHTTP.requests.allSatisfy { $0.httpMethod != "DELETE" }, "Changed credentials must cancel deletion")

reset()
prepareCloud()
ICloudManager.shared.reserveTunnel(url: "https://local-saved.instatunnel.my")
expect(try! ICloudManager.shared.protectedTunnelSubdomains().contains("local-saved"), "Publish a reservation before reconnecting")
ICloudManager.shared.syncServer(url: nil, isOffline: true, preservingTunnelReservation: true)
expect(try! ICloudManager.shared.protectedTunnelSubdomains().contains("local-saved"), "Recovery offline state must retain its reservation")
ICloudManager.shared.syncServer(url: nil, isOffline: true)
expect(ICloudManager.shared.reservedTunnelURL == nil, "Explicit stop should release the reservation")
regressionDefaults.removePersistentDomain(forName: suiteName)
print("Passed \(checks) tunnel regression checks; HTTP and iCloud were isolated.")
