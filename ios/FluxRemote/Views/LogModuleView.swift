import SwiftUI

struct LogModuleView: View {
        // Add autoRefresh property (always enabled)
        var autoRefresh: Bool { true }

        // Add categoryCount function
        func categoryCount(_ category: String) -> Int {
            if category == "全部" { return logs.count }
            return logs.filter { $0.category == category }.count
        }
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var logs: [LogItem] = []
    @State private var selectedCategory: String = "全部"
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedLog: LogItem?
    @State private var showingAddLog = false
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var searchText = ""
    
    let categories = ["全部", "system", "service", "app", "other"]
    
    var filteredFiles: [LogItem] {
        let categoryFiltered = selectedCategory == "全部" ? logs : logs.filter { $0.category == selectedCategory }
        if searchText.isEmpty { return categoryFiltered }
        return categoryFiltered.filter { $0.name.localizedCaseInsensitiveContains(searchText) || $0.path.localizedCaseInsensitiveContains(searchText) }
    }
    
    var body: some View {
        fileList
            .navigationTitle("日志分析")
            .searchable(text: $searchText, prompt: "搜索日志文件...")
            .sheet(item: $selectedLog) { log in
                NavigationStack {
                    LogDetailView(file: log)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button(action: { selectedLog = nil }) { Image(systemName: "xmark") }
                            }
                        }
                }
            }
            .onAppear {
                Task { await fetchData() }
            }
            .refreshable {
                await fetchData()
            }
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Menu {
                        Picker("系统分类", selection: $selectedCategory) {
                            ForEach(categories, id: \.self) { category in
                                Text("\(category) (\(categoryCount(category)))").tag(category)
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "tag")
                            Text("\(selectedCategory) (\(categoryCount(selectedCategory)))").lineLimit(1)
                                .font(.caption2)
                        }
                    }
                    
                    Button {
                        showingAddLog = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddLog) {
                NavigationStack {
                    AddPathView(title: "添加日志路径") { path, name in
                        let _: ActionResponse = try await apiClient.request("/api/logs", method: "POST", body: ["path": path, "name": name])
                        await fetchData()
                    }
                }
            }
    }
    
    private var categoryPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(categories, id: \.self) { category in
                    Button {
                        selectedCategory = category
                    } label: {
                        Text(categoryDisplay(category))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(selectedCategory == category ? Color.blue : Color.secondary.opacity(0.1))
                            .foregroundStyle(selectedCategory == category ? .white : .primary)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
    }
    
    var fileList: some View {
        List {
            Section {
                if isLoading && logs.isEmpty {
                    ProgressView("正在同步日志...")
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                } else if let error = errorMessage {
                    ContentUnavailableView("同步失败", systemImage: "exclamationmark.triangle.fill", description: Text(error))
                } else if logs.isEmpty {
                    ContentUnavailableView("无日志文件", systemImage: "doc.text.fill")
                } else {
                    ForEach(filteredFiles) { file in
                        Button {
                            selectedLog = file
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(file.name)
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                Text(file.path)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                HStack {
                                    Text(categoryDisplay(file.category))
                                        .font(.system(size: 10, weight: .bold))
                                        .padding(.horizontal, 4)
                                        .padding(.vertical, 2)
                                        .background(Color.blue.opacity(0.1))
                                        .foregroundStyle(.blue)
                                        .clipShape(RoundedRectangle(cornerRadius: 4))
                                    Text(formatSize(file.size))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                        .monospacedDigit()
                                    Spacer(minLength: 0)
                                    Text(formatDate(file.mtime))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowSeparator(.hidden)
                    }
                }
            }
        }
        .listStyle(.plain)
    }
    
    private func fileRow(for file: LogItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(file.name)
                .font(.subheadline)
                .fontWeight(.medium)
            Text(file.path)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            HStack {
                Text(categoryDisplay(file.category))
                    .font(.system(size: 10, weight: .bold))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(Color.blue.opacity(0.1))
                    .foregroundStyle(.blue)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                
                Text(formatSize(file.size))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
    
    func categoryDisplay(_ cat: String) -> String {
        switch cat {
        case "system": return "系统"
        case "service": return "服务"
        case "app": return "应用"
        case "other": return "其他"
        default: return cat
        }
    }
    
    func formatSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / (1024 * 1024))
    }
    
    func formatDate(_ timestamp: Int64) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(timestamp) / 1000.0)
        let formatter = DateFormatter()
        formatter.dateFormat = "MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }
    
    func fetchData() async {
        isLoading = true
        errorMessage = nil
        do {
            let response: LogResponse = try await apiClient.request("/api/logs")
            await MainActor.run {
                if case .list(let items) = response.data {
                    self.logs = items
                }
                self.isLoading = false
            }
        } catch {
            print("Fetch logs failed: \(error)")
            await MainActor.run { 
                self.errorMessage = error.localizedDescription
                self.isLoading = false 
            }
        }
    }
}

struct LogDetailView: View {
        // Add autoRefresh property (always enabled)
        var autoRefresh: Bool { true }
    let file: LogItem
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var logContent: String = ""
    @State private var isReading = false
    @State private var refreshTask: Task<Void, Never>? = nil
    @State private var isSilentRefresh = false // 静默刷新标记
    
    var body: some View {
        ScrollViewReader { proxy in
            Group {
                if logContent.isEmpty && (isReading || isSilentRefresh) {
                    ProgressView("正在读取...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if !logContent.isEmpty {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            let lines = logContent.components(separatedBy: .newlines)
                            let displayLines = lines.suffix(5000)
                            ForEach(Array(displayLines.enumerated()), id: \ .offset) { index, line in
                                Text(line)
                                    .font(.system(.caption2, design: .monospaced))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 1)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(index % 2 == 0 ? Color.clear : Color.black.opacity(0.02))
                                    .id(index) // Add ID for scrolling
                            }
                        }
                    }
                } else if !isReading && !isSilentRefresh {
                    ContentUnavailableView("无日志内容", systemImage: "doc.text.fill")
                }
            }
            .onChange(of: logContent) {
                // Scroll to the bottom when content changes
                let lines = logContent.components(separatedBy: .newlines)
                let displayLines = lines.suffix(5000)
                if displayLines.count > 0 {
                    withAnimation {
                        proxy.scrollTo(displayLines.count - 1, anchor: .bottom)
                    }
                }
            }
        }
        .navigationTitle(file.name)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Task { await readLog(silent: false) }
            refreshTask?.cancel()
            refreshTask = Task {
                while !Task.isCancelled && autoRefresh {
                    try? await Task.sleep(for: .seconds(3))
                    await readLog(silent: true)
                }
            }
        }
        .onDisappear {
            refreshTask?.cancel()
        }
    }
    
    func readLog(silent: Bool = false) async {
        await MainActor.run {
            if silent {
                self.isSilentRefresh = true
            } else {
                self.isReading = true
                self.isSilentRefresh = false
            }
        }
        do {
            let path = "/api/logs?file=\(file.path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
            let response: LogResponse = try await apiClient.request(path)
            if case .content(let content) = response.data {
                await MainActor.run {
                    self.logContent = content
                    self.isReading = false
                    self.isSilentRefresh = false
                }
            }
        } catch {
            print("Read log failed: \(error)")
            await MainActor.run {
                self.isReading = false
                self.isSilentRefresh = false
            }
        }
    }
}

#Preview {
    LogModuleView()
        .environment(RemoteAPIClient())
}

struct AddPathView: View {
    @Environment(\.dismiss) var dismiss
    @State private var path: String = ""
    @State private var name: String = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    
    let title: String
    let onSave: (String, String) async throws -> Void
    
    var body: some View {
        Form {
            Section {
                TextField("路径 (绝对路径)", text: $path)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                
                TextField("显示名称 (可选)", text: $name)
            } footer: {
                if let error = errorMessage {
                    Text(error)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("取消") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                if isSaving {
                    ProgressView()
                } else {
                    Button("添加") {
                        Task {
                            isSaving = true
                            errorMessage = nil
                            do {
                                try await onSave(path, name)
                                dismiss()
                            } catch {
                                errorMessage = error.localizedDescription
                                isSaving = false
                            }
                        }
                    }
                    .disabled(path.isEmpty)
                }
            }
        }
    }
}
