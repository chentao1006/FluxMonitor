import SwiftUI

struct DockerModuleView: View {
        @State private var confirmDeleteContainer: DockerContainer? = nil
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var containers: [DockerContainer] = []
    @State private var images: [DockerImage] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedTab: Tab = .containers
    @State private var selectedContainerForLogs: DockerContainer?
    @State private var loadingAction: [String: String] = [:] // entry: [container.id: action]
    
    enum Tab: String, CaseIterable {
        case containers = "容器"
        case images = "镜像"
    }
    
    var body: some View {
        List {
            Section(header: 
                Picker("Tabs", selection: $selectedTab) {
                    ForEach(Tab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color(uiColor: .systemGroupedBackground))
            ) {
            
            Section {
                if isLoading && (containers.isEmpty && images.isEmpty) {
                    HStack {
                        Spacer()
                        ProgressView("正在同步 Docker 数据...")
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                } else if let error = errorMessage {
                    ContentUnavailableView("同步失败", systemImage: "exclamationmark.triangle.fill", description: Text(error))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                } else {
                    switch selectedTab {
                    case .containers:
                        containerList
                    case .images:
                        imageList
                    }
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Docker")
        .refreshable {
            await fetchData()
        }
        .onAppear {
            Task { await fetchData() }
        }
        .onChange(of: selectedTab) {
            Task { await fetchData() }
        }
        }
        .sheet(item: $selectedContainerForLogs) { container in
            NavigationStack {
                DockerLogView(containerId: container.id, containerName: container.name)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button(action: { selectedContainerForLogs = nil }) { Image(systemName: "xmark") }
                        }
                    }
            }
        }
    }
    
    private var containerRow: some View {
        EmptyView() // Placeholder if used elsewhere, but we have containerList
    }

    private var containerList: some View {
        ForEach($containers) { $container in
            VStack(alignment: .leading, spacing: 10) {
                Button {
                    selectedContainerForLogs = container
                } label: {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            StatusBadge(status: container.state)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(container.name)
                                    .font(.headline)
                                Text(container.image)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(container.status)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            if !container.ports.isEmpty {
                                HStack(spacing: 4) {
                                    Image(systemName: "network.fill")
                                    Text(container.ports)
                                }
                                .font(.system(size: 10))
                                .foregroundStyle(.blue)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                
                HStack(spacing: 12) {
                    let isUp = container.state == "running"
                    if isUp {
                        actionButton(icon: "arrow.clockwise", color: .orange, isLoading: loadingAction[container.id] == "restart") {
                            await performAction("restart", id: container.id)
                        }
                        actionButton(icon: "stop", color: .red, isLoading: loadingAction[container.id] == "stop") {
                            await performAction("stop", id: container.id)
                        }
                    } else {
                        actionButton(icon: "play", color: .green, isLoading: loadingAction[container.id] == "start") {
                            await performAction("start", id: container.id)
                        }
                        actionButton(icon: "trash", color: .red, isLoading: loadingAction[container.id] == "rm") {
                            confirmDeleteContainer = container
                        }
                        .alert(item: $confirmDeleteContainer) { container in
                            Alert(
                                title: Text("确认删除？"),
                                message: Text("确定要删除 \(container.name) 吗？此操作不可恢复。"),
                                primaryButton: .destructive(Text("删除")) {
                                    Task {
                                        loadingAction[container.id] = "rm"
                                        await performAction("rm", id: container.id)
                                        loadingAction[container.id] = nil
                                    }
                                },
                                secondaryButton: .cancel()
                            )
                        }
                    }
                    Spacer()
                    Label("日志", systemImage: "doc.text")
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.blue.opacity(0.1))
                        .foregroundStyle(.blue)
                        .clipShape(Capsule())
                }
                .padding(.top, 4)
                .padding(.bottom, 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .alignmentGuide(.listRowSeparatorLeading) { d in 0 }
        }
    }
    
    private var imageList: some View {
        ForEach(images) { image in
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(image.repository)
                        .font(.headline)
                    Spacer()
                    Text(image.tag)
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Color.blue.opacity(0.1))
                        .foregroundStyle(.blue)
                        .clipShape(Capsule())
                }
                
                HStack {
                    Text("ID: \(image.id.prefix(12))")
                    Spacer()
                    Text(image.size)
                }
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.secondary)
            }
            .padding(.vertical, 6)
        }
    }
    
    private func actionButton(icon: String, color: Color, isLoading: Bool = false, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            if isLoading {
                ProgressView()
                    .controlSize(.small)
                    .frame(width: 32, height: 32)
            } else {
                Image(systemName: icon)
                    .font(.caption)
                    .foregroundStyle(color)
                    .frame(width: 32, height: 32)
                    .background(color.opacity(0.1))
                    .clipShape(Circle())
            }
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }
    
    @State private var fetchTask: Task<Void, Never>?
    
    func fetchData() async {
        fetchTask?.cancel()
        
        fetchTask = Task {
            await MainActor.run { 
                isLoading = true
                errorMessage = nil 
            }
            
            do {
                switch selectedTab {
                case .containers:
                    let response: DockerResponse = try await apiClient.request("/api/docker/containers")
                    if !Task.isCancelled {
                        await MainActor.run {
                            self.containers = response.data
                            self.isLoading = false
                        }
                    }
                case .images:
                    let response: DockerImageResponse = try await apiClient.request("/api/docker/images")
                    if !Task.isCancelled {
                        await MainActor.run {
                            self.images = response.data
                            self.isLoading = false
                        }
                    }
                }
            } catch {
                if !Task.isCancelled {
                    await MainActor.run {
                        if let nsError = error as NSError?, let msg = nsError.userInfo[NSLocalizedDescriptionKey] as? String {
                            self.errorMessage = "同步失败: \(msg)"
                        } else {
                            self.errorMessage = "同步失败: \(error.localizedDescription)"
                        }
                        self.isLoading = false
                    }
                }
            }
        }
    }
    
    func performAction(_ action: String, id: String) async {
        loadingAction[id] = action
        do {
            let _: ActionResponse = try await apiClient.request("/api/docker/action", method: "POST", body: ["action": action, "id": id])
            await fetchData()
        } catch {
            print("Action failed: \(error)")
        }
        loadingAction[id] = nil
    }
}

// Sub-view for Docker Logs
struct DockerLogView: View {
    let containerId: String
    let containerName: String
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var logs: String = ""
    @State private var isLoading = true
    
    var body: some View {
        ScrollView {
            if isLoading {
                ProgressView().padding()
            }
            Text(logs)
                .font(.system(.caption2, design: .monospaced))
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.black.opacity(0.02))
        .refreshable {
            await fetchLogs()
        }
        .navigationTitle("\(containerName) 日志")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Task { await fetchLogs() }
        }
    }
    
    func fetchLogs() async {
        isLoading = true
        do {
            // Updated API for direct log fetching
            let response: GenericLogResponse = try await apiClient.request("/api/docker/logs?id=\(containerId)")
            await MainActor.run {
                self.logs = response.logs
                self.isLoading = false
            }
        } catch {
            print("Fetch Docker logs failed: \(error)")
            await MainActor.run { self.isLoading = false }
        }
    }
    
    func analyzeLogs() {
        // AI Analysis logic using /api/ai
    }
}


#Preview {
    NavigationStack {
        DockerModuleView()
            .environment(RemoteAPIClient())
    }
}
