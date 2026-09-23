import Foundation
import AppKit

class NetworkUtils {
    static func getLocalIPAddress() -> String {
        var address: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        
        if getifaddrs(&ifaddr) == 0 {
            var ptr = ifaddr
            while ptr != nil {
                defer { ptr = ptr?.pointee.ifa_next }
                
                guard let interface = ptr?.pointee else { continue }
                let addrFamily = interface.ifa_addr.pointee.sa_family
                
                if addrFamily == UInt8(AF_INET) {
                    let name = String(cString: interface.ifa_name)
                    // Check if it's en (Wifi/Ethernet) and not a loopback
                    if (name.hasPrefix("en") || name.hasPrefix("eth")),
                       !isHostOnlyAddress(interface) {
                        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                        getnameinfo(interface.ifa_addr, socklen_t(interface.ifa_addr.pointee.sa_len),
                                   &hostname, socklen_t(hostname.count),
                                   nil, socklen_t(0), NI_NUMERICHOST)
                        address = String(cString: hostname)
                        // Prefer 192, 172, or 10 prefixes if multiple enX exist
                        if let addr = address, (addr.hasPrefix("192.") || addr.hasPrefix("172.") || addr.hasPrefix("10.")) {
                            freeifaddrs(ifaddr)
                            return addr
                        }
                    }
                }
            }
            freeifaddrs(ifaddr)
        }
        return address ?? "localhost"
    }

    static func getAllLocalIPAddresses() -> [String] {
        var addresses: [String] = []
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        
        if getifaddrs(&ifaddr) == 0 {
            var ptr = ifaddr
            while ptr != nil {
                defer { ptr = ptr?.pointee.ifa_next }
                
                guard let interface = ptr?.pointee else { continue }
                let addrFamily = interface.ifa_addr.pointee.sa_family
                
                if addrFamily == UInt8(AF_INET) {
                    let name = String(cString: interface.ifa_name)
                    if (name.hasPrefix("en") || name.hasPrefix("eth")),
                       !isHostOnlyAddress(interface) {
                        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                        getnameinfo(interface.ifa_addr, socklen_t(interface.ifa_addr.pointee.sa_len),
                                   &hostname, socklen_t(hostname.count),
                                   nil, socklen_t(0), NI_NUMERICHOST)
                        let address = String(cString: hostname)
                        if !addresses.contains(address) {
                            addresses.append(address)
                        }
                    }
                }
            }
            freeifaddrs(ifaddr)
        }
        return addresses
    }

    private static func isHostOnlyAddress(_ interface: ifaddrs) -> Bool {
        guard let netmask = interface.ifa_netmask else { return true }

        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        let result = getnameinfo(
            netmask,
            socklen_t(netmask.pointee.sa_len),
            &hostname,
            socklen_t(hostname.count),
            nil,
            0,
            NI_NUMERICHOST
        )
        guard result == 0 else { return true }

        // macOS may attach VPN/virtual-network aliases to a physical enX
        // interface. A /32 mask identifies a host-only alias, not a LAN
        // address that another device can normally use to reach this Mac.
        return String(cString: hostname) == "255.255.255.255"
    }
}

class AptabaseTracker {
    static let shared = AptabaseTracker()
    
    private var appKey: String?
    private var host: String = "https://aptabase.com"
    private var sessionId: String = UUID().uuidString
    private var isReady = false
    private var queuedEvents: [(String, [String: Any])] = []
    
    func setup(appKey: String) {
        if appKey.isEmpty { return }
        self.appKey = appKey
        let parts = appKey.components(separatedBy: "-")
        if parts.count >= 2, parts[0] == "A" {
            let region = parts[1].lowercased()
            self.host = "https://\(region).aptabase.com"
        }
        self.isReady = true
        for event in queuedEvents {
            trackEvent(event.0, props: event.1)
        }
        queuedEvents.removeAll()
    }
    
    func tryInitializeFromBundle() {
        if let url = Bundle.main.url(forResource: "analytics", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let config = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let key = config["aptabaseKey"] as? String, !key.isEmpty {
            setup(appKey: key)
        }
    }
    
    func trackEvent(_ eventName: String, props: [String: Any] = [:]) {
        guard isReady, let appKey = appKey else {
            queuedEvents.append((eventName, props))
            return
        }
        
        let urlString = "\(host)/api/v0/events"
        guard let url = URL(string: urlString) else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(appKey, forHTTPHeaderField: "App-Key")
        
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        let osVersion = ProcessInfo.processInfo.operatingSystemVersionString
        
        let systemProps: [String: Any] = [
            "osName": "macOS",
            "osVersion": osVersion,
            "locale": Locale.current.identifier,
            "appVersion": version,
            "appBuildNumber": build,
            "sdkVersion": "aptabase-swift@0.3.0"
        ]
        
        let payload: [String: Any] = [
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "sessionId": sessionId,
            "eventName": eventName,
            "systemProps": systemProps,
            "props": props
        ]
        
        let payloadArray = [payload]
        
        guard let dataPayload = try? JSONSerialization.data(withJSONObject: payloadArray) else { return }
        request.httpBody = dataPayload
        
        URLSession.shared.dataTask(with: request) { _, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    ProcessManager.shared.appendLog("[Aptabase] Failed to track '\(eventName)': \(error.localizedDescription)\n")
                } else if let response = response as? HTTPURLResponse, response.statusCode >= 200 && response.statusCode < 300 {
                    ProcessManager.shared.appendLog("[Aptabase] Tracked event: \(eventName)\n")
                }
            }
        }.resume()
    }
}
