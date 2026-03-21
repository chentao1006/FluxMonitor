import Foundation

// MARK: - System Stats Models

struct RemoteStatsResponse: Codable {
    let success: Bool
    let data: RemoteSystemStats
}

struct RemoteSystemStats: Codable {
    let hostname: String
    let osVersion: String
    let uptime: String
    let cpu: RemoteCPU?
    let memory: RemoteMemory
    let disk: RemoteDisk
    let loadAvg: String
    let arch: String
    let cpuModel: String?
    let kernel: String?
    let swap: String?
    let memPressure: String?
    let battery: String?
    let netBytes: RemoteNetBytes?
}

struct RemoteNetBytes: Codable {
    let `in`: Int64
    let out: Int64
}

struct RemoteCPU: Codable {
    let user: Double
    let sys: Double
    let idle: Double
}

struct RemoteMemory: Codable {
    let usedMB: Int
    let totalMB: Int
    let freeMB: Int
}

struct RemoteDisk: Codable {
    let percent: String
    let total: String
    let used: String
}

// MARK: - Docker Models

struct DockerResponse: Codable {
    let success: Bool
    let data: [DockerContainer]
}

struct DockerContainer: Codable, Identifiable {
    let id: String
    let names: [String]
    let image: String
    let state: String
    let status: String
    let ports: String
    
    var name: String {
        names.first?.replacingOccurrences(of: "/", with: "") ?? "unknown"
    }
    
    enum CodingKeys: String, CodingKey {
        case id = "ID"
        case names = "Names"
        case image = "Image"
        case state = "State"
        case status = "Status"
        case ports = "Ports"
    }
    
    init(id: String, names: [String], image: String, state: String, status: String, ports: String) {
        self.id = id
        self.names = names
        self.image = image
        self.state = state
        self.status = status
        self.ports = ports
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        // Handle ID or id
        if let idVal = try? container.decode(String.self, forKey: .id) {
            self.id = idVal
        } else {
            let altContainer = try decoder.container(keyedBy: DynamicCodingKeys.self)
            self.id = (try? altContainer.decode(String.self, forKey: DynamicCodingKeys(stringValue: "id")!)) ?? "unknown"
        }
        
        // Handle Names as [String] or String
        if let namesArray = try? container.decode([String].self, forKey: .names) {
            self.names = namesArray
        } else if let namesString = try? container.decode(String.self, forKey: .names) {
            self.names = [namesString]
        } else {
            self.names = []
        }
        
        // Handle others with fallbacks to lowercase if needed
        self.image = (try? container.decode(String.self, forKey: .image)) ?? 
                    (try? decoder.container(keyedBy: DynamicCodingKeys.self).decode(String.self, forKey: DynamicCodingKeys(stringValue: "image")!)) ?? ""
        self.state = (try? container.decode(String.self, forKey: .state)) ?? 
                    (try? decoder.container(keyedBy: DynamicCodingKeys.self).decode(String.self, forKey: DynamicCodingKeys(stringValue: "state")!)) ?? "unknown"
        self.status = (try? container.decode(String.self, forKey: .status)) ?? 
                    (try? decoder.container(keyedBy: DynamicCodingKeys.self).decode(String.self, forKey: DynamicCodingKeys(stringValue: "status")!)) ?? "unknown"
        self.ports = (try? container.decode(String.self, forKey: .ports)) ?? 
                    (try? decoder.container(keyedBy: DynamicCodingKeys.self).decode(String.self, forKey: DynamicCodingKeys(stringValue: "ports")!)) ?? ""
    }
}

private struct DynamicCodingKeys: CodingKey {
    var stringValue: String
    init?(stringValue: String) { self.stringValue = stringValue }
    var intValue: Int?
    init?(intValue: Int) { return nil }
}

struct DockerImage: Codable, Identifiable {
    let id: String
    let repository: String
    let tag: String
    let size: String
    let created: String
    
    enum CodingKeys: String, CodingKey {
        case id = "ID"
        case repository = "Repository"
        case tag = "Tag"
        case size = "Size"
        case created = "CreatedAt"
    }
}

struct DockerImageResponse: Codable {
    let success: Bool
    let data: [DockerImage]
}

// MARK: - Nginx Models

struct NginxResponse: Codable {
    let success: Bool
    let running: Bool?
    let pids: [String]?
    let binPath: String?
    let data: [NginxSite]?
    let error: String?
}

struct NginxSite: Codable, Identifiable {
    let name: String
    let port: String
    let serverName: String
    let status: String
    
    var id: String { name }
}

// MARK: - Process Models

struct ProcessResponse: Codable {
    let success: Bool
    let data: [RemoteProcess]
}

struct RemoteProcess: Codable, Identifiable {
    let pid: String
    let user: String
    let cpu: String
    let mem: String
    let command: String
    
    var id: String { pid }
}

// MARK: - Log Models

struct LogItem: Codable, Identifiable, Hashable {
    let path: String
    let name: String
    let dir: String
    let category: String
    let size: Int
    let mtime: Int64
    let isCustom: Bool
    
    var id: String { path }
}

struct LogResponse: Codable {
    let success: Bool
    let data: LogData
    let error: String?
    
    enum LogData: Codable {
        case list([LogItem])
        case content(String)
        case error(String)
        
        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let list = try? container.decode([LogItem].self) {
                self = .list(list)
            } else if let content = try? container.decode(String.self) {
                self = .content(content)
            } else {
                self = .error("Unknown log data format")
            }
        }
        
        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            switch self {
            case .list(let list): try container.encode(list)
            case .content(let content): try container.encode(content)
            case .error(let error): try container.encode(error)
            }
        }
    }
}

// MARK: - Config Models

struct ConfigItem: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let path: String
    let category: String
    let size: Int?
    let mtime: Double?
}

struct ConfigResponse: Codable {
    let success: Bool
    let data: [ConfigItem]?
    let content: String?
}

// MARK: - Launch Agent Models

struct LaunchAgentResponse: Codable {
    let success: Bool
    let data: [LaunchAgentItem]
}

struct LaunchAgentItem: Codable, Identifiable {
    let name: String
    let label: String?
    let path: String
    let isLoaded: Bool
    let size: Int64
    let mtime: Int64
    
    var id: String { path }
}

// MARK: - Settings Models

struct ServerSettingsResponse: Codable {
    let success: Bool
    let data: ServerSettings
}

struct ServerSettings: Codable {
    var ai: AIConfig?
    var features: FeatureToggles?
    var version: String?
}

struct AIConfig: Codable {
    var url: String?
    var key: String?
    var model: String?
}

struct FeatureToggles: Codable {
    var monitor: Bool?
    var processes: Bool?
    var logs: Bool?
    var configs: Bool?
    var launchagent: Bool?
    var docker: Bool?
    var nginx: Bool?
    var openclaw: Bool?
}

// MARK: - Common Response

struct ActionResponse: Codable {
    let success: Bool
    let error: String?
    let requiresPassword: Bool?
    let details: String?
}

struct AIResponse: Codable {
    let success: Bool
    let data: String
}

struct GenericLogResponse: Codable {
    let success: Bool
    let logs: String
}

struct ScreenshotResponse: Codable {
    let success: Bool
    let data: String? // Base64 encoded image
    let error: String?
}
