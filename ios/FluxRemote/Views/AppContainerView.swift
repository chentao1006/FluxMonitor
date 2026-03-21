import SwiftUI

struct AppContainerView: View {
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var selection: NavigationItem? = .monitor
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    
    enum NavigationItem: String, CaseIterable, Identifiable {
        case monitor, processes, logs, configs, launchagent, docker, nginx, settings
        
        var id: String { self.rawValue }
        
        var title: String {
            switch self {
            case .monitor: return "系统概览"
            case .processes: return "进程管理"
            case .logs: return "日志分析"
            case .configs: return "配置管理"
            case .launchagent: return "自启服务"
            case .docker: return "Docker"
            case .nginx: return "Nginx"
            case .settings: return "设置"
            }
        }
        
        var icon: String {
            switch self {
            case .monitor: return "waveform.path.ecg.rectangle.fill"
            case .processes: return "cpu.fill"
            case .logs: return "doc.text.fill"
            case .configs: return "gearshape.fill"
            case .launchagent: return "paperplane.fill"
            case .docker: return "shippingbox.fill"
            case .nginx: return "server.rack"
            case .settings: return "slider.horizontal.3"
            }
        }
    }
    
    @State private var showingQuickTerminal = false
    
    var body: some View {
        if !apiClient.isAuthenticated {
            FluxLoginView()
        } else {
            ZStack(alignment: .bottomTrailing) {
                responsiveContent
                    .onAppear {
                        Task { await apiClient.fetchSettings() }
                    }
                
                // Floating Terminal Button
                if horizontalSizeClass != .regular || selection != nil {
                    Button {
                        showingQuickTerminal = true
                    } label: {
                        Image(systemName: "terminal")
                            .font(.title2)
                            .foregroundStyle(.white)
                            .frame(width: 56, height: 56)
                            .background(Color.blue)
                            .clipShape(Circle())
                            .shadow(radius: 4, y: 2)
                    }
                    .padding(16)
                    .padding(.bottom, horizontalSizeClass == .regular ? 0 : 50) // Adjust for TabBar
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .sheet(isPresented: $showingQuickTerminal) {
                QuickTerminalView()
            }
        }
    }
    
    @ViewBuilder
    private var responsiveContent: some View {
        if horizontalSizeClass == .regular {
            NavigationSplitView {
                sidebarContent
                    .navigationTitle("浮光远控")
            } detail: {
                if let selection = selection {
                    NavigationStack {
                        contentView(for: selection)
                    }
                } else {
                    Text("请选择一个选项")
                }
            }
        } else {
            TabView {
                if isFeatureEnabled(for: .monitor) {
                    NavigationStack { contentView(for: .monitor) }
                        .tabItem { Label(NavigationItem.monitor.title, systemImage: NavigationItem.monitor.icon) }
                }
                
                if isFeatureEnabled(for: .processes) {
                    NavigationStack { contentView(for: .processes) }
                        .tabItem { Label(NavigationItem.processes.title, systemImage: NavigationItem.processes.icon) }
                }
                
                if isFeatureEnabled(for: .logs) {
                    NavigationStack { contentView(for: .logs) }
                        .tabItem { Label(NavigationItem.logs.title, systemImage: NavigationItem.logs.icon) }
                }
                
                if isFeatureEnabled(for: .configs) {
                    NavigationStack { contentView(for: .configs) }
                        .tabItem { Label(NavigationItem.configs.title, systemImage: NavigationItem.configs.icon) }
                }
                
                NavigationStack {
                    moreView
                        .navigationDestination(for: NavigationItem.self) { item in
                            contentView(for: item)
                        }
                }
                .tabItem { Label("更多", systemImage: "ellipsis.circle.fill") }
            }
        }
    }
    
    private var moreView: some View {
        List {
            Section("服务管理") {
                if isFeatureEnabled(for: .launchagent) { tabRow(for: .launchagent) }
                if isFeatureEnabled(for: .docker) { tabRow(for: .docker) }
                if isFeatureEnabled(for: .nginx) { tabRow(for: .nginx) }
            }
            
            Section("系统") {
                tabRow(for: .settings)
            }
        }
        .navigationTitle("更多")
    }
    
    private var sidebarContent: some View {
        List(selection: $selection) {
            Section("主页") {
                if isFeatureEnabled(for: .monitor) { tabRow(for: .monitor) }
            }
            
            Section("系统工具") {
                if isFeatureEnabled(for: .processes) { tabRow(for: .processes) }
                if isFeatureEnabled(for: .logs) { tabRow(for: .logs) }
                if isFeatureEnabled(for: .configs) { tabRow(for: .configs) }
            }
            
            Section("服务管理") {
                if isFeatureEnabled(for: .launchagent) { tabRow(for: .launchagent) }
                if isFeatureEnabled(for: .docker) { tabRow(for: .docker) }
                if isFeatureEnabled(for: .nginx) { tabRow(for: .nginx) }
            }
            
            Section("系统") {
                tabRow(for: .settings)
            }
        }
        .listStyle(.sidebar)
    }
    
    private func isFeatureEnabled(for item: NavigationItem) -> Bool {
        switch item {
        case .monitor: return apiClient.features.monitor ?? true
        case .processes: return apiClient.features.processes ?? true
        case .logs: return apiClient.features.logs ?? true
        case .configs: return apiClient.features.configs ?? true
        case .launchagent: return apiClient.features.launchagent ?? true
        case .docker: return apiClient.features.docker ?? true
        case .nginx: return apiClient.features.nginx ?? true
        case .settings: return true
        }
    }
    
    private func tabRow(for item: NavigationItem) -> some View {
        NavigationLink(value: item) {
            Label(item.title, systemImage: item.icon)
        }
        .tag(item)
    }
    
    @ViewBuilder
    private func contentView(for item: NavigationItem) -> some View {
        switch item {
        case .monitor: DashboardView()
        case .processes: ProcessListView()
        case .logs: LogModuleView()
        case .configs: ConfigsModuleView()
        case .launchagent: LaunchAgentModuleView()
        case .docker: DockerModuleView()
        case .nginx: NginxModuleView()
        case .settings: SettingsView()
        }
    }
}

struct QuickTerminalView: View {
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var command: String = ""
    @State private var output: String = ""
    @State private var isExecuting = false
    @Environment(\.dismiss) private var dismiss
    @State private var executionTask: Task<Void, Never>?
    
    let commonCommands = [
        ("目录", "ls -FhG"),
        ("磁盘", "df -h"),
        ("内存排行", "ps -e -o pmem,comm | sort -rn | head -n 10"),
        ("CPU 排行", "ps -e -o pcpu,comm | sort -rn | head -n 10"),
        ("本机 IP", "ifconfig | grep \"inet \" | grep -v 127.0.0.1"),
        ("监听端口", "lsof -i -P | grep LISTEN"),
        ("运行时间", "uptime"),
        ("Brew", "brew list --versions"),
        ("系统版本", "sw_vers"),
        ("进程数", "ps aux | wc -l"),
        ("空间详情", "du -sh ~/* | sort -rh | head -n 5"),
        ("下载历史", "ls -lt ~/Downloads | head -n 5"),
        ("硬件架构", "uname -m"),
        ("活跃用户", "who"),
        ("DNS 配置", "cat /etc/resolv.conf")
    ]
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Common Commands (Top)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(commonCommands, id: \.1) { label, cmd in
                            Button {
                                command = cmd
                            } label: {
                                Text(label)
                                    .font(.caption)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Color.blue.opacity(0.1))
                                    .foregroundStyle(.blue)
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding()
                }
                
                // Input Bar
                VStack(spacing: 0) {
                    HStack(spacing: 12) {
                        Image(systemName: "chevron.right.square")
                            .foregroundStyle(.blue)
                        
                        TextField("输入命令...", text: $command, axis: .vertical)
                            .lineLimit(1...3)
                            .font(.system(.subheadline, design: .monospaced))
                            .onSubmit { 
                                if !isExecuting {
                                    executionTask = Task { await execute() } 
                                }
                            }
                        
                        if isExecuting {
                            Button {
                                executionTask?.cancel()
                                isExecuting = false
                            } label: {
                                Image(systemName: "stop.circle.fill")
                                    .foregroundStyle(.red)
                            }
                        } else {
                            Button {
                                executionTask = Task { await execute() }
                            } label: {
                                Image(systemName: "play.circle.fill")
                                    .foregroundStyle(command.isEmpty ? Color.secondary : Color.blue)
                            }
                            .disabled(command.isEmpty)
                        }
                    }
                    .padding(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .background(.ultraThinMaterial)
                    Divider()
                }
                
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        SectionHeader(title: "终端输出")
                        
                        if output.isEmpty {
                            Text("等待指令...")
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, minHeight: 100, alignment: .center)
                                .background(Color.black.opacity(0.02))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .padding(.horizontal)
                        } else {
                            Text(output)
                                .font(.system(.caption2, design: .monospaced))
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.black.opacity(0.05))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .padding(.horizontal)
                        }
                    }
                    .padding(.vertical)
                }
            }
            .navigationTitle("命令执行")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: { dismiss() }) { Image(systemName: "xmark") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { output = "" }) {
                        Image(systemName: "eraser")
                    }
                    .disabled(output.isEmpty)
                }
            }
        }
    }
    
    private func execute() async {
        guard !command.isEmpty else { return }
        isExecuting = true
        output = "正在执行: \(command)...\n\n"
        
        do {
            guard let baseURL = apiClient.baseURL else { throw NSError(domain: "API", code: 400, userInfo: [NSLocalizedDescriptionKey: "No base URL"]) }
            var request = URLRequest(url: baseURL.appendingPathComponent("/api/system/command"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["command": command])
            
            let (result, response) = try await apiClient.session.bytes(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                let errorData = try await result.reduce(into: Data(), { @Sendable (data, byte) in data.append(byte) })
                throw NSError(domain: "Terminal", code: 1, userInfo: [NSLocalizedDescriptionKey: String(data: errorData, encoding: .utf8) ?? "Server Error"])
            }
            
            for try await line in result.lines {
                if Task.isCancelled { throw CancellationError() }
                await MainActor.run {
                    self.output += line + "\n"
                }
            }
            
            await MainActor.run {
                self.output += "\n[执行完毕]"
                self.isExecuting = false
            }
        } catch {
            await MainActor.run {
                if error is CancellationError || (error as? URLError)?.code == .cancelled {
                    self.output += "\n[操作已停止]"
                } else {
                    self.output += "\n[执行出错: \(error.localizedDescription)]"
                }
                self.isExecuting = false
            }
        }
    }
}

struct SectionHeader: View {
    let title: String
    var body: some View {
        Text(title)
            .font(.caption)
            .fontWeight(.bold)
            .foregroundStyle(.secondary)
            .padding(.horizontal)
            .textCase(.uppercase)
    }
}
