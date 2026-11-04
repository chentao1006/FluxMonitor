#!/usr/bin/env python3
"""Exercise the production managers with temporary defaults, cloud files and fake HTTP.

Runs no application and never contacts InstaTunnel or the user's iCloud container.
Usage: python3 tests/tunnel_regressions.py
"""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
tunnel = (ROOT / "launcher/FluxMonitor/TunnelView.swift").read_text()
tunnel = tunnel[tunnel.index("enum TunnelStatus:"):tunnel.index("struct TunnelView: View")]
cloud = (ROOT / "launcher/FluxMonitor/ICloudManager.swift").read_text()
cloud = cloud[cloud.index("struct CloudServer:"):cloud.index("// MARK: - InstaTunnel API Key Synchronization")]
cloud = cloud.replace('FileManager.default.url(forUbiquityContainerIdentifier: "iCloud.com.ct106.flux.shared")?.appendingPathComponent("Documents")', 'regressionRoot.appendingPathComponent("cloud")')
source = (cloud + tunnel).replace("private ", "")
source = source.replace("UserDefaults.standard", "regressionDefaults")
source = source.replace("URLSession.shared", "regressionSession")
source = source.replace("Bundle.main.bundleIdentifier!", '"regression"')
source = source.replace("FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!", "regressionRoot")

with tempfile.TemporaryDirectory(prefix="flux-tunnel-regressions-") as directory:
    directory = Path(directory)
    (directory / "cloud").mkdir()
    prefix = r'''
import Foundation
import SwiftUI
import CryptoKit
import Darwin

let regressionRoot = URL(fileURLWithPath: ProcessInfo.processInfo.environment["FLUX_REGRESSION_ROOT"]!)
let suiteName = "flux.tunnel.regressions." + UUID().uuidString
let regressionDefaults = UserDefaults(suiteName: suiteName)!
class I18N { static let shared = I18N(); func t(_ key: String) -> String { key } }
class ConfigManager { static let shared = ConfigManager(); func loadConfig() -> (String?, String?, String?) { (nil, nil, nil) } }
class ProcessManager { static let shared = ProcessManager(); var isRunning = true }
class MQTTRemoteSync { static let shared = MQTTRemoteSync(); func disconnect() {}; func publishURL(_ url: String) {} }
class ICloudAPIKeySync { static let apiKeyDefaultsKey = "instaTunnelApiKey" }
class InstaTunnelDownloader {
    static let shared = InstaTunnelDownloader()
    var pendingCompletion: ((Bool) -> Void)?
    var localInstaTunnelPath: String { regressionRoot.appendingPathComponent("fake-cli").path }
    func isInstalled() -> Bool { true }
    func downloadInstaTunnel(completion: @escaping (Bool) -> Void) { pendingCompletion = completion }
}
class FakeHTTP: URLProtocol {
    static var requests: [URLRequest] = []
    static var reply: (URLRequest) -> (Int, Data) = { _ in (200, Data()) }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
            Self.requests.append(self.request)
            let (code, data) = Self.reply(self.request)
            self.client?.urlProtocol(self, didReceive: HTTPURLResponse(url: self.request.url!, statusCode: code, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: data)
            self.client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() {}
}
let sessionConfig = URLSessionConfiguration.ephemeral
sessionConfig.protocolClasses = [FakeHTTP.self]
let regressionSession = URLSession(configuration: sessionConfig)
'''
    main = (ROOT / "tests/tunnel_regressions.swift").read_text()
    swift = directory / "main.swift"
    swift.write_text(prefix + source + main)
    executable = directory / "regressions"
    subprocess.run(["swiftc", "-swift-version", "5", "-module-cache-path", str(directory / "module-cache"), str(swift), "-o", str(executable)], check=True)
    subprocess.run([str(executable)], env={**os.environ, "FLUX_REGRESSION_ROOT": str(directory)}, check=True, timeout=40)
