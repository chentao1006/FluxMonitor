import SwiftUI

struct SettingsView: View {
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var serverSettings: ServerSettings?
    @State private var isLoading = true
    @State private var autoSaveTask: Task<Void, Never>?
    @State private var isSaving = false
    @State private var lastSavedTime: Date?
    
    var body: some View {
        Form {
            if isLoading {
                ProgressView("正在同步设置...")
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            } else {
                Section(header: Text("面板连接")) {
                    LabeledContent("服务器", value: apiClient.baseURL?.absoluteString ?? "未配置")
                    LabeledContent("版本", value: serverSettings?.version ?? "未知")
                }
                
                Section(header: Text("AI 服务配置")) {
                    TextField("API URL", text: Binding(
                        get: { serverSettings?.ai?.url ?? "" },
                        set: { serverSettings?.ai?.url = $0; triggerAutoSave() }
                    ))
                    SecureField("API Key", text: Binding(
                        get: { serverSettings?.ai?.key ?? "" },
                        set: { serverSettings?.ai?.key = $0; triggerAutoSave() }
                    ))
                    #if os(iOS)
                    .textContentType(.password)
                    #endif
                    TextField("模型名称", text: Binding(
                        get: { serverSettings?.ai?.model ?? "" },
                        set: { serverSettings?.ai?.model = $0; triggerAutoSave() }
                    ))
                }
                
                Section(header: Text("功能模块控制")) {
                    Toggle("监控概览", isOn: featureBinding(\.monitor))
                    Toggle("进程管理", isOn: featureBinding(\.processes))
                    Toggle("日志分析", isOn: featureBinding(\.logs))
                    Toggle("配置管理", isOn: featureBinding(\.configs))
                    Toggle("自启服务", isOn: featureBinding(\.launchagent))
                    Toggle("Docker", isOn: featureBinding(\.docker))
                    Toggle("Nginx", isOn: featureBinding(\.nginx))
                }
                
                Section("账户") {
                    LabeledContent("当前用户", value: apiClient.currentUser ?? "未知")
                    Button("同步全局数据", action: { Task { await fetchData() } })
                    Button("退出登录", role: .destructive) {
                        apiClient.logout()
                    }
                }
                
                Section("本地设置") {
                    Text("FluxRemote 是原生 iOS 客户端，严格遵循 Web 版的功能与布局，为您提供极致的监控体验。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("系统设置")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if isSaving {
                    ProgressView().controlSize(.small)
                } else if let _ = lastSavedTime {
                    Text("已保存")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .onAppear {
            Task { await fetchData() }
        }
    }
    
    private func featureBinding(_ keyPath: WritableKeyPath<FeatureToggles, Bool?>) -> Binding<Bool> {
        Binding(
            get: { serverSettings?.features?[keyPath: keyPath] ?? true },
            set: { 
                serverSettings?.features?[keyPath: keyPath] = $0
                triggerAutoSave()
            }
        )
    }
    
    private func triggerAutoSave() {
        autoSaveTask?.cancel()
        autoSaveTask = Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second debounce
            guard !Task.isCancelled else { return }
            await saveSettings()
        }
    }
    
    func fetchData() async {
        isLoading = true
        do {
            let response: ServerSettingsResponse = try await apiClient.request("/api/settings")
            await MainActor.run {
                self.serverSettings = response.data
                self.isLoading = false
            }
        } catch {
            print("Fetch settings failed: \(error)")
            await MainActor.run { self.isLoading = false }
        }
    }
    
    func saveSettings() async {
        guard let settings = serverSettings else { return }
        await MainActor.run { isSaving = true }
        do {
            let _: ActionResponse = try await apiClient.request("/api/settings", method: "POST", encodableBody: settings)
            await MainActor.run {
                if let feats = settings.features {
                    apiClient.features = feats
                }
                self.isSaving = false
                self.lastSavedTime = Date()
            }
        } catch {
            print("Auto-save failed: \(error)")
            await MainActor.run {
                self.isSaving = false
            }
        }
    }
}

#Preview {
    NavigationStack {
        SettingsView()
            .environment(RemoteAPIClient())
    }
}
