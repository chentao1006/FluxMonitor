import SwiftUI

struct NginxModuleView: View {
        @State private var confirmDeleteSite: NginxSite? = nil
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var sites: [NginxSite] = []
    @State private var serviceStatus: NginxResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    
    @State private var showingAddSite = false
    @State private var editingSite: NginxSite?
    @State private var showingErrorLog = false
    @State private var loadingAction: [String: String] = [:] // key: site.name or "service", value: action
    
    var body: some View {
        List {
            if isLoading && sites.isEmpty {
                HStack {
                    Spacer()
                    ProgressView("正在同步数据...")
                    Spacer()
                }
                .listRowBackground(Color.clear)
            } else if let error = errorMessage {
                ContentUnavailableView("同步失败", systemImage: "wifi.exclamationmark.fill", description: Text(error))
                    .listRowBackground(Color.clear)
            } else {
                serviceSection
                siteSection
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Nginx")
        .refreshable {
            await fetchData()
        }
        .onAppear {
            Task { await fetchData() }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: { showingAddSite = true }) {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingAddSite) {
            NavigationStack {
                NginxSiteEditView(site: nil) { await fetchData() }
            }
        }
        .sheet(item: $editingSite) { site in
            NavigationStack {
                NginxSiteEditView(site: site) { await fetchData() }
            }
        }
        .sheet(isPresented: $showingErrorLog) {
            NavigationStack {
                NginxErrorLogView()
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button(action: { showingErrorLog = false }) { Image(systemName: "xmark") }
                        }
                    }
            }
        }
    }
    
    private var serviceSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    StatusBadge(status: serviceStatus?.running == true ? "running" : "stopped")
                        .padding(.top, 2)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("运行状态")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let pids = serviceStatus?.pids, !pids.isEmpty {
                            Text("PIDs: \(pids.joined(separator: ", "))")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                    }
                    Spacer()
                }
                
                if let binPath = serviceStatus?.binPath {
                    Text("路径: \(binPath)")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
                
                HStack(spacing: 20) {
                    let isRunning = serviceStatus?.running == true
                    actionButton(icon: isRunning ? "stop" : "play", color: isRunning ? .red : .green, label: isRunning ? "停止" : "启动", isLoading: loadingAction["service"] == (isRunning ? "stop" : "start")) {
                        await performAction(isRunning ? "stop" : "start")
                    }

                    actionButton(icon: "arrow.clockwise", color: .blue, label: "重启", isLoading: loadingAction["service"] == "restart") {
                        await performAction("restart")
                    }

                    actionButton(icon: "checkmark.shield", color: .orange, label: "测试", isLoading: loadingAction["service"] == "test") {
                        await performAction("test")
                    }

                    Spacer()
                }
            }
            .padding(.vertical, 8)
            
            Button {
                showingErrorLog = true
            } label: {
                Label("查看错误日志", systemImage: "doc.text")
                    .foregroundStyle(.blue)
            }
        } header: {
            Text("服务控制")
        }
    }
    
    private var siteSection: some View {
        Section {
            ForEach($sites) { $site in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        StatusBadge(status: site.status == "enabled" ? "running" : "stopped")
                        VStack(alignment: .leading, spacing: 2) {
                            Text(site.name)
                                .font(.headline)
                            Text("\(site.serverName):\(site.port)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    HStack(spacing: 16) {
                        let isEnabled = site.status == "enabled"
                        actionButton(icon: isEnabled ? "stop" : "play", color: isEnabled ? .red : .green, isLoading: loadingAction[site.name] == (isEnabled ? "disable" : "enable")) {
                            await toggleSite(site)
                        }
                        actionButton(icon: "pencil", color: .blue) {
                            editingSite = site
                        }
                        Spacer()
                        actionButton(icon: "trash.fill", color: .red, isLoading: loadingAction[site.name] == "delete") {
                            confirmDeleteSite = site
                        }
                        .alert(item: $confirmDeleteSite) { site in
                            Alert(
                                title: Text("确认删除？"),
                                message: Text("确定要删除 \(site.name) 吗？此操作不可恢复。"),
                                primaryButton: .destructive(Text("删除")) {
                                    Task { await deleteSite(site) }
                                },
                                secondaryButton: .cancel()
                            )
                        }
                    }
                    .padding(.top, 4)
                }
                .padding(.vertical, 4)
            }
        } header: {
            Text("站点管理")
        }
    }
    
    private func actionButton(icon: String, color: Color, label: String? = nil, isLoading: Bool = false, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            HStack(spacing: 6) {
                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: icon)
                        .font(.subheadline)
                }
                if let label = label {
                    Text(label)
                        .font(.subheadline)
                }
            }
            .padding(8)
            .background(color.opacity(0.1))
            .foregroundStyle(color)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }
    
    func fetchData() async {
        isLoading = true
        errorMessage = nil
        do {
            async let sitesTask: NginxResponse = apiClient.request("/api/nginx/sites")
            async let statusTask: NginxResponse = apiClient.request("/api/nginx/action", method: "POST", body: ["action": "status"])
            
            let (sRes, stRes) = try await (sitesTask, statusTask)
            
            await MainActor.run {
                self.sites = sRes.data ?? []
                self.serviceStatus = stRes
                self.isLoading = false
                self.errorMessage = nil
            }
        } catch {
            print("Fetch nginx failed: \(error)")
            await MainActor.run { 
                self.errorMessage = error.localizedDescription
                self.isLoading = false 
            }
        }
    }
    
    func performAction(_ action: String) async {
        loadingAction["service"] = action
        do {
            let response: ActionResponse = try await apiClient.request("/api/nginx/action", method: "POST", body: ["action": action])
            if response.success {
                await fetchData()
            } else if response.requiresPassword == true {
                await MainActor.run {
                    self.errorMessage = "需要 sudo 密码。请前往网页版操作或等候后续集成密码输入。"
                }
            } else {
                await MainActor.run {
                    self.errorMessage = response.details ?? response.error ?? "执行失败"
                }
            }
        } catch {
            print("Action failed: \(error)")
            await MainActor.run {
                self.errorMessage = error.localizedDescription
            }
        }
        loadingAction["service"] = nil
    }
    
    func toggleSite(_ site: NginxSite) async {
        let action = site.status == "enabled" ? "disable" : "enable"
        loadingAction[site.name] = action
        do {
            let _: ActionResponse = try await apiClient.request("/api/nginx/sites", method: "POST", body: ["action": action, "filename": site.name])
            await fetchData()
        } catch {
            print("Toggle site failed: \(error)")
            await MainActor.run {
                self.errorMessage = error.localizedDescription
            }
        }
        loadingAction[site.name] = nil
    }
    
    func deleteSite(_ site: NginxSite) async {
        loadingAction[site.name] = "delete"
        do {
            let _: ActionResponse = try await apiClient.request("/api/nginx/sites", method: "POST", body: ["action": "delete", "filename": site.name])
            await fetchData()
        } catch {
            print("Delete site failed: \(error)")
            await MainActor.run {
                self.errorMessage = error.localizedDescription
            }
        }
        loadingAction[site.name] = nil
    }
}

struct NginxSiteEditView: View {
    let site: NginxSite?
    var onSave: () async -> Void
    
    @Environment(RemoteAPIClient.self) private var apiClient
    @Environment(\.dismiss) private var dismiss
    @State private var filename: String = ""
    @State private var content: String = ""
    @State private var isLoading = false
    @State private var isSaving = false
    
    var body: some View {
        VStack(spacing: 0) {
            if site == nil {
                TextField("文件名 (例如 example.conf)", text: $filename)
                    .textFieldStyle(.roundedBorder)
                    .padding()
            }
            
            if isLoading {
                ProgressView().padding()
            }
            
            TextEditor(text: $content)
                .font(.system(.caption2, design: .monospaced))
                .padding(4)
        }
        .navigationTitle(site?.name ?? "添加站点")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) { Image(systemName: "xmark") }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: { Task { await save() } }) {
                    if isSaving {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "checkmark")
                    }
                }
                .disabled(isSaving || (site == nil && filename.isEmpty))
            }
        }
        .onAppear {
            if let site {
                filename = site.name
                Task { await fetchContent() }
            } else {
                content = """
server {
    listen 80;
    server_name example.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
"""
            }
        }
    }
    
    func fetchContent() async {
        isLoading = true
        do {
            let response: ConfigResponse = try await apiClient.request("/api/nginx/sites", method: "POST", body: ["action": "read", "filename": filename])
            await MainActor.run {
                self.content = response.content ?? ""
                self.isLoading = false
            }
        } catch {
            print("Fetch nginx site content failed: \(error)")
            await MainActor.run { self.isLoading = false }
        }
    }
    
    func save() async {
        isSaving = true
        do {
            let _: ActionResponse = try await apiClient.request("/api/nginx/sites", method: "POST", body: [
                "action": "write",
                "filename": filename,
                "content": content
            ])
            await onSave()
            dismiss()
        } catch {
            print("Save nginx site failed: \(error)")
            await MainActor.run { self.isSaving = false }
        }
    }
}

#Preview {
    NavigationStack {
        NginxModuleView()
            .environment(RemoteAPIClient())
    }
}

struct NginxErrorLogView: View {
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var logs: String = ""
    @State private var isLoading = true
    
    var body: some View {
        ScrollView {
            if isLoading {
                ProgressView().padding()
            }
            Text(logs.isEmpty ? "无日志数据" : logs)
                .font(.system(.caption2, design: .monospaced))
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.black.opacity(0.02))
        .refreshable {
            await fetchLogs()
        }
        .navigationTitle("Nginx 错误日志")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Task { await fetchLogs() }
        }
    }
    
    func fetchLogs() async {
        isLoading = true
        do {
            let response: GenericLogResponse = try await apiClient.request("/api/nginx/action", method: "POST", body: ["action": "logs"])
            await MainActor.run {
                self.logs = response.logs
                self.isLoading = false
            }
        } catch {
            print("Fetch Nginx logs failed: \(error)")
            await MainActor.run { self.isLoading = false }
        }
    }
}
