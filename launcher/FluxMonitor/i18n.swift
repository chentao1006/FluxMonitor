import Foundation


class I18N: ObservableObject {
    static let shared = I18N()
    
    @Published var language: Language = .system {
        didSet {
            UserDefaults.standard.set(language.rawValue, forKey: "appLanguage")
            if language != .system {
                let code = language == .zh ? "zh-Hans" : "en"
                UserDefaults.standard.set([code], forKey: "AppleLanguages")
            } else {
                UserDefaults.standard.removeObject(forKey: "AppleLanguages")
            }
        }
    }
    
    var isZh: Bool {
        let currentLang = language == .system ? getSystemLang() : language
        return currentLang == .zh
    }
    
    init() {
        if let saved = UserDefaults.standard.string(forKey: "appLanguage"),
           let lang = Language(rawValue: saved) {
            self.language = lang
        }
    }
    
    func t(_ key: String) -> String {
        let currentLang = language == .system ? getSystemLang() : language
        let dict = currentLang == .zh ? zhDict : enDict
        return dict[key] ?? key
    }
    
    private func getSystemLang() -> Language {
        let preferred = Locale.preferredLanguages.first ?? "en"
        return (preferred.hasPrefix("zh-Hans") || preferred.hasPrefix("zh")) ? .zh : .en
    }
    
    private let zhDict = [
        "app_title": "浮光面板启动器",
        "service": "服务",
        "settings": "设置",
        "general": "通用",
        "status": "状态",
        "running": "正在运行",
        "stopped": "已停止",
        "start": "启动",
        "stop": "停止",
        "address": "服务地址",
        "logs": "运行日志",
        "clear_logs": "清除日志",
        "service_config": "服务配置",
        "username": "用户名",
        "password": "密码",
        "port": "端口",
        "behavior": "行为",
        "launch_at_login": "开机启动",
        "auto_start_service": "自动启动服务",
        "auto_start_tunnel": "自动启动公网访问",
        "save": "保存设置",
        "silent_start": "静默启动 (打开时不显示窗口)",
        "language": "界面语言",
        "check_updates": "检查更新",
        "quit": "退出",
        "open_dashboard": "打开控制面板",
        "flux_monitor": "打开浮光面板 (网页版)",
        "settings_dots": "设置...",
        "about": "关于",
        "copy": "复制",
        "select_all": "全选",
        "welcome_title": "欢迎使用 浮光面板",
        "welcome_message": "请设置您的初始登录凭据和端口号以继续。",
        "get_started": "开始使用",
        "download_node_title": "需要下载 Node.js",
        "download_node_message": "为了运行后台服务，我们需要下载并安装 Node.js (约 100MB)。",
        "download": "下载",
        "cancel": "取消",
        "tunnel": "公网",
        "tunnel_title": "公网访问 (InstaTunnel)",
        "tunnel_subdomain": "自定义子域名 (可选)",
        "tunnel_subdomain_placeholder": "例如 my-service",
        "tunnel_quick_desc": "集成第三方 InstaTunnel 服务。无需账号，自动生成公网访问地址。",
        "view_details": "查看详情",
        "public_url": "公网地址",
        "download_instatunnel_title": "需要下载 InstaTunnel",
        "download_instatunnel_message": "为了使用公网访问功能，我们需要下载 instatunnel 二进制文件 (约 5MB)。",
        "starting": "正在启动",
        "error": "错误",
        "service_not_running_title": "本地服务未启动",
        "service_not_running_message": "请先在“服务”标签页中启动本地服务，然后再开启公网访问。",
        "reset_env": "重置环境",
        "instatunnel_checking": "正在检查 InstaTunnel...",
        "instatunnel_preparing": "正在准备 InstaTunnel...",
        "instatunnel_ready": "InstaTunnel 已就绪",
        "instatunnel_not_installed": "InstaTunnel 未安装",
        "instatunnel_downloading": "正在下载 InstaTunnel (%d%%)...",
        "instatunnel_error": "错误: %@",
        "port_not_accessible": "本地端口 %d 无法访问，请确保服务已启动",
        "node_idle": "空闲",
        "node_downloading": "正在下载 Node.js (%d%%)...",
        "node_extracting": "正在解压...",
        "node_completed": "安装完成",
        "node_failed": "错误: %@",
        "edit": "编辑",
        "version_format": "版本 %@ (%@)",
        "about_desc": "浮光面板 桌面管理程序。",
        "mit_license": "© 2026 Tao Chen. MIT 许可证。",
        "follow_system": "跟随系统",
        "node_mirror_url": "https://npmmirror.com/mirrors/node",
        "icloud_sync": "iCloud 同步",
        "icloud_sync_desc": "同步后便于让移动设备远程访问此服务器。",
        "icloud_sync_manage": "管理同步到 iCloud 的公网访问地址",
        "icloud_sync_starting": "正在同步到 iCloud...",
        "icloud_sync_success": "iCloud 同步成功",
        "icloud_sync_error": "iCloud 同步失败: %@",
        "icloud_sync_removed": "已从 iCloud 移除同步",
        "icloud_unavailable": "iCloud 服务不可用，请检查登录状态",
        "open_icloud_folder": "打开 iCloud 文件夹",
        "ios_app_title": "浮光远控 (iOS) 已推出",
        "ios_app_desc": "在 iPhone 或 iPad 上远程查看和管理您的服务器。",
        "view_on_app_store": "下载移动客户端",
        "dismiss": "稍后再说",
        "app_store_badge": "AppStoreBadgeZH"
    ]
    
    private let enDict = [
        "app_title": "Flux Monitor Launcher",
        "service": "Service",
        "settings": "Settings",
        "general": "General",
        "status": "Status",
        "running": "Running",
        "stopped": "Stopped",
        "start": "Start",
        "stop": "Stop",
        "address": "Address",
        "logs": "Logs",
        "clear_logs": "Clear Logs",
        "service_config": "Service Configuration",
        "username": "Username",
        "password": "Password",
        "port": "Port",
        "behavior": "Behavior",
        "launch_at_login": "Launch at Login",
        "auto_start_service": "Auto-start Service",
        "auto_start_tunnel": "Auto-start Public Access",
        "save": "Save Settings",
        "view_details": "View Details",
        "silent_start": "Silent Start (No window on launch)",
        "language": "Language",
        "check_updates": "Check for Updates",
        "quit": "Quit",
        "open_dashboard": "Open Dashboard",
        "flux_monitor": "Open Flux Monitor (Web)",
        "settings_dots": "Settings...",
        "about": "About",
        "copy": "Copy",
        "select_all": "Select All",
        "welcome_title": "Welcome to Flux Monitor",
        "welcome_message": "Please set your initial login credentials and port to continue.",
        "get_started": "Get Started",
        "download_node_title": "Node.js Required",
        "download_node_message": "To run the background service, we need to download and install Node.js (approx. 100MB).",
        "download": "Download",
        "cancel": "Cancel",
        "tunnel": "Public",
        "tunnel_title": "Public Access (InstaTunnel)",
        "tunnel_subdomain": "Custom Subdomain (Optional)",
        "tunnel_subdomain_placeholder": "e.g. my-service",
        "tunnel_quick_desc": "Powered by third-party InstaTunnel. Automatically generated public URL, no account needed.",
        "public_url": "Public URL",
        "download_instatunnel_title": "InstaTunnel Required",
        "download_instatunnel_message": "To use public tunnel, we need to download the 'instatunnel' binary (approx. 5MB).",
        "starting": "Starting",
        "error": "Error",
        "service_not_running_title": "Service Not Running",
        "service_not_running_message": "Please start the local service in the 'Service' tab before enabling public access.",
        "reset_env": "Reset Env",
        "instatunnel_checking": "Checking InstaTunnel...",
        "instatunnel_preparing": "Preparing InstaTunnel...",
        "instatunnel_ready": "InstaTunnel is ready",
        "instatunnel_not_installed": "InstaTunnel not installed",
        "instatunnel_downloading": "Downloading InstaTunnel (%d%%)...",
        "instatunnel_error": "Error: %@",
        "port_not_accessible": "Local port %d is not accessible. Please make sure the service is running.",
        "node_idle": "Idle",
        "node_downloading": "Downloading Node.js (%d%%)...",
        "node_extracting": "Extracting...",
        "node_completed": "Installation Completed",
        "node_failed": "Error: %@",
        "edit": "Edit",
        "version_format": "Version %@ (%@)",
        "about_desc": "Flux Monitor Desktop Manager.",
        "mit_license": "© 2026 Tao Chen. MIT License.",
        "follow_system": "Follow System",
        "node_mirror_url": "https://nodejs.org/dist",
        "icloud_sync": "iCloud Sync",
        "icloud_sync_desc": "Sync this server to iCloud for easy remote access on mobile devices.",
        "icloud_sync_manage": "Manage sync of public URL to iCloud",
        "icloud_sync_starting": "Syncing to iCloud...",
        "icloud_sync_success": "iCloud sync successful",
        "icloud_sync_error": "iCloud sync failed: %@",
        "icloud_sync_removed": "Sync removed from iCloud",
        "icloud_unavailable": "iCloud service unavailable, please check login status",
        "open_icloud_folder": "Open iCloud Folder",
        "ios_app_title": "Flux Remote (iOS) Available",
        "ios_app_desc": "Monitor and manage your server remotely from your iPhone or iPad.",
        "view_on_app_store": "Download Mobile Client",
        "dismiss": "Maybe Later",
        "app_store_badge": "AppStoreBadgeEN"
    ]
}

enum Language: String, CaseIterable, Identifiable {
    case system = "Follow System"
    case en = "English"
    case zh = "简体中文"
    
    var id: String { self.rawValue }
    
    var localized: String {
        switch self {
        case .system: return I18N.shared.t("follow_system")
        case .en: return "English"
        case .zh: return "简体中文"
        }
    }
}
