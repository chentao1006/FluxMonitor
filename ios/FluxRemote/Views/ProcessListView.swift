import SwiftUI

struct ProcessListView: View {
        @State private var refreshTask: Task<Void, Never>? = nil
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var processes: [RemoteProcess] = []
    @State private var searchText: String = ""
    @State private var isLoading: Bool = false
    @State private var sortOrder: SortOrder = .cpu
    @State private var selectedUser: String = "All"
    @State private var users: [String] = ["All"]
    @State private var selectedProcess: RemoteProcess?
    @State private var errorMessage: String?
    @State private var loadingAction: [String: String] = [:] // pid: action
    
    enum SortOrder: String, CaseIterable {
        case cpu = "CPU"
        case mem = "MEM"
        case pid = "PID"
        case command = "名称"
    }
    
    var filteredAndSortedProcesses: [RemoteProcess] {
        var result = processes
        
        if selectedUser != "All" {
            result = result.filter { $0.user == selectedUser }
        }
        
        if !searchText.isEmpty {
            result = result.filter { $0.command.localizedCaseInsensitiveContains(searchText) || $0.pid.contains(searchText) }
        }
        
        switch sortOrder {
        case .cpu:
            result.sort { Double($0.cpu) ?? 0 > Double($1.cpu) ?? 0 }
        case .mem:
            result.sort { Double($0.mem) ?? 0 > Double($1.mem) ?? 0 }
        case .pid:
            result.sort { Int($0.pid) ?? 0 > Int($1.pid) ?? 0 }
        case .command:
            result.sort { $0.command.lowercased() < $1.command.lowercased() }
        }
        
        return result
    }
    
    var body: some View {
        List {
            Section {
                    if isLoading && processes.isEmpty {
                        ProgressView("正在读取进程数据...")
                            .frame(maxWidth: .infinity)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    } else if let error = errorMessage {
                        ContentUnavailableView("读取失败", systemImage: "exclamationmark.triangle", description: Text(error))
                    } else if processes.isEmpty && !isLoading {
                        ContentUnavailableView("无进程数据", systemImage: "cpu.fill")
                    } else {
                        ForEach(filteredAndSortedProcesses) { process in
                            Button {
                                selectedProcess = process
                            } label: {
                                HStack {
                                    Circle()
                                        .fill(Color.green)
                                        .frame(width: 8, height: 8)
                                        .padding(.trailing, 4)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(process.command)
                                            .font(.subheadline)
                                            .fontWeight(.medium)
                                            .lineLimit(1)
                                        Text("PID: \(process.pid) · 用户: \(process.user)")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text("\(process.cpu)% CPU")
                                            .font(.caption)
                                            .foregroundStyle(.blue)
                                            .monospacedDigit()
                                        Text("\(process.mem)% MEM")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                            .monospacedDigit()
                                    }
                                }
                                .padding(.vertical, 8)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task { await killProcess(pid: process.pid) }
                                } label: {
                                    Label("结束进程", systemImage: "xmark.circle")
                                }
                            }
                        }
                    }
                }
            }
        .listStyle(.plain)
        .navigationTitle("系统进程")
        .searchable(text: $searchText, prompt: "搜索名称或 PID...")
        // 自动静默刷新
        .onAppear {
            Task { await fetchData() }
            refreshTask?.cancel()
            refreshTask = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(5))
                    await fetchData(silent: true)
                }
            }
        }
        .onDisappear {
            refreshTask?.cancel()
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Menu {
                    Picker("排序", selection: $sortOrder) {
                        ForEach(SortOrder.allCases, id: \.self) { order in
                            Text(order.rawValue).tag(order)
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.up.arrow.down")
                        Text(sortOrder.rawValue)
                            .font(.caption2)
                    }
                }
                
                Menu {
                    Picker("用户", selection: $selectedUser) {
                        ForEach(users, id: \.self) { user in
                            Text(user).tag(user)
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "person")
                        Text(selectedUser == "All" ? "全部" : selectedUser).lineLimit(1)
                            .font(.caption2)
                    }
                }
            }
        }
        .sheet(item: $selectedProcess) { process in
            NavigationStack {
                ProcessDetailView(process: process)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button(action: { selectedProcess = nil }) { Image(systemName: "xmark") }
                        }
                    }
            }
        }
    }
    
    // ...existing code...
    func fetchData(silent: Bool = false) async {
        if !silent { isLoading = processes.isEmpty }
        errorMessage = nil
        do {
            let response: ProcessResponse = try await apiClient.request("/api/system/processes")
            await MainActor.run {
                self.processes = response.data
                self.users = ["All"] + Array(Set(response.data.map { $0.user })).sorted()
                self.isLoading = false
            }
        } catch {
            print("Fetch processes error: \(error)")
            await MainActor.run { 
                self.errorMessage = error.localizedDescription
                self.isLoading = false 
            }
        }
    }
    
    func killProcess(pid: String) async {
        loadingAction[pid] = "kill"
        do {
            let _: ActionResponse = try await apiClient.request("/api/system/processes", method: "POST", body: ["action": "kill", "pid": pid])
            await fetchData()
        } catch {
            print("Kill process error: \(error)")
        }
        loadingAction[pid] = nil
    }
}
struct ProcessDetailView: View {
    let process: RemoteProcess
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var detailedProcess: DetailedProcess?
    @State private var isLoading = true
    @State private var isExecutingAction = false
    
    struct DetailedProcess: Codable {
        let pid: String
        let ppid: String
        let ppidName: String
        let cpu: String
        let mem: String
        let state: String
        let start: String
        let time: String
        let user: String
        let command: String
        let fullCommand: String
        let openFiles: [String]
    }
    
    struct DetailedProcessResponse: Codable {
        let success: Bool
        let data: DetailedProcess
    }
    
    var body: some View {
        List {
            if isLoading {
                ProgressView().frame(maxWidth: .infinity).padding()
            } else if let dp = detailedProcess {
                Section("基础信息") {
                    LabeledContent("PID", value: dp.pid)
                    LabeledContent("父进程", value: "\(dp.ppidName) (\(dp.ppid))")
                    LabeledContent("状态", value: dp.state)
                    LabeledContent("用户", value: dp.user)
                    LabeledContent("启动时间", value: dp.start)
                    LabeledContent("运行时长", value: dp.time)
                }
                
                Section("资源占用") {
                    LabeledContent("CPU 使用率", value: "\(dp.cpu)%")
                    LabeledContent("内存使用率", value: "\(dp.mem)%")
                }
                
                Section("全路径命令") {
                    Text(dp.fullCommand)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
                
                if !dp.openFiles.isEmpty {
                    Section("打开的文件 (LSOF)") {
                        ForEach(dp.openFiles, id: \.self) { file in
                            Text(file)
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                
            }
        }
        .navigationTitle(process.command)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if isExecutingAction {
                    ProgressView().controlSize(.small)
                } else {
                    Button {
                        showingStopConfirmation = true
                    } label: {
                        Image(systemName: "stop")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.orange)
                    }
                    
                    Button(role: .destructive) {
                        showingKillConfirmation = true
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.red)
                    }
                }
            }
        }
        .confirmationDialog("确定要安全停止进程吗 (SIGTERM)?", isPresented: $showingStopConfirmation, titleVisibility: .visible) {
            Button("停止进程", role: .destructive) {
                Task { await stopProcess() }
            }
            Button("取消", role: .cancel) {}
        }
        .confirmationDialog("确定要强制结束进程吗 (SIGKILL)?", isPresented: $showingKillConfirmation, titleVisibility: .visible) {
            Button("强制结束进程", role: .destructive) {
                Task { await killProcess() }
            }
            Button("取消", role: .cancel) {}
        }
        .onAppear {
            Task { await fetchDetails() }
        }
    }
    
    @State private var showingKillConfirmation = false
    @State private var showingStopConfirmation = false
    @Environment(\.dismiss) private var dismiss
    
    func killProcess() async {
        isExecutingAction = true
        do {
            let _: ActionResponse = try await apiClient.request("/api/system/processes", method: "POST", body: ["action": "kill", "pid": process.pid])
            dismiss()
        } catch {
            print("Kill process error: \(error)")
            isExecutingAction = false
        }
    }
    
    func stopProcess() async {
        isExecutingAction = true
        do {
            let _: ActionResponse = try await apiClient.request("/api/system/processes", method: "POST", body: ["action": "stop", "pid": process.pid])
            dismiss()
        } catch {
            print("Stop process error: \(error)")
            isExecutingAction = false
        }
    }
    
    func fetchDetails() async {
        isLoading = true
        do {
            let response: DetailedProcessResponse = try await apiClient.request("/api/system/processes?pid=\(process.pid)")
            await MainActor.run {
                self.detailedProcess = response.data
                self.isLoading = false
            }
        } catch {
            print("Fetch process details error: \(error)")
            await MainActor.run { self.isLoading = false }
        }
    }
}


#Preview {
    NavigationStack {
        ProcessListView()
            .environment(RemoteAPIClient())
    }
}
