import Foundation

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
                    if (name.hasPrefix("en") || name.hasPrefix("eth")) {
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
}
