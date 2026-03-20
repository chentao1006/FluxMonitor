import Foundation

enum Language: String, CaseIterable, Identifiable {
    case en = "English"
    case zh = "简体中文"
    case system = "Follow System"
    
    var id: String { self.rawValue }
}

class I18N: ObservableObject {
    static let shared = I18N()
    
    @Published var language: Language = .system {
        didSet {
            UserDefaults.standard.set(language.rawValue, forKey: "appLanguage")
        }
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
        let locale = Locale.current.language.languageCode?.identifier ?? "en"
        return locale == "zh" ? .zh : .en
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
        "settings_dots": "设置..."
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
        "settings_dots": "Settings..."
    ]
}
