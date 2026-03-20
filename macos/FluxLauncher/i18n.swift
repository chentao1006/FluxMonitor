import Foundation


class I18N: ObservableObject {
    static let shared = I18N()
    
    @Published var language: Language = .system {
        didSet {
            UserDefaults.standard.set(language.rawValue, forKey: "appLanguage")
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
        "app_title": "浮光启动器",
        "service": "服务",
        "settings": "设置",
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
        "save": "保存设置",
        "language": "界面语言",
        "check_updates": "检查更新",
        "quit": "退出",
        "open_dashboard": "打开控制面板",
        "flux_monitor": "打开浮光面板",
        "settings_dots": "设置...",
        "about": "关于",
        "copy": "复制",
        "select_all": "全选",
        "welcome_title": "欢迎使用 浮光启动器",
        "welcome_message": "请设置您的初始登录凭据和端口号以继续。",
        "get_started": "开始使用"
    ]
    
    private let enDict = [
        "app_title": "Flux Launcher",
        "service": "Service",
        "settings": "Settings",
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
        "save": "Save Settings",
        "language": "Language",
        "check_updates": "Check for Updates",
        "quit": "Quit",
        "open_dashboard": "Open Dashboard",
        "flux_monitor": "Open Flux Monitor",
        "settings_dots": "Settings...",
        "about": "About",
        "copy": "Copy",
        "select_all": "Select All",
        "welcome_title": "Welcome to Flux Launcher",
        "welcome_message": "Please set your initial login credentials and port to continue.",
        "get_started": "Get Started"
    ]
}

enum Language: String, CaseIterable, Identifiable {
    case system = "Follow System"
    case en = "English"
    case zh = "简体中文"
    
    var id: String { self.rawValue }
    
    var localized: String {
        switch self {
        case .system: return I18N.shared.isZh ? "跟随系统" : "Follow System"
        case .en: return "English"
        case .zh: return "简体中文"
        }
    }
}
