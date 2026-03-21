
import SwiftUI
import Charts

struct DashboardView: View {
    @Environment(RemoteAPIClient.self) private var apiClient
    @State private var stats: RemoteSystemStats?
    @State private var history: [MetricPoint] = []
    @State private var timer: Timer?
    @State private var prevNetBytes: RemoteNetBytes?
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    
    struct MetricPoint: Identifiable {
        let id = UUID()
        let date: Date
        let cpu: Double
        let memory: Double
        let netIn: Double
        let netOut: Double
    }
    @State private var terminalCommand: String = ""
    @State private var terminalOutput: String = ""
    @State private var isExecutingCommand = false
    

    // 判断是否为 iPhone 横屏
    var isIPhoneLandscape: Bool {
        UIDevice.current.userInterfaceIdiom == .phone &&
        horizontalSizeClass == .compact &&
        verticalSizeClass == .compact
    }

    // Chart 区域的列数
    var chartColumns: [GridItem] {
        if isIPhoneLandscape {
            return Array(repeating: GridItem(.flexible()), count: 3)
        } else if horizontalSizeClass == .regular {
            return Array(repeating: GridItem(.flexible()), count: 3)
        } else {
            return [GridItem(.flexible())]
        }
    }
    
    var body: some View {
        Group {
            if let stats {
                ScrollView {
                    VStack(spacing: 20) {
                        // Metric Charts Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("性能监控")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            LazyVGrid(columns: chartColumns, spacing: 16) {
                                ChartTile(title: "CPU 使用率", 
                                         value: "\(Int((stats.cpu?.user ?? 0) + (stats.cpu?.sys ?? 0)))%", 
                                         subValue: "User: \(Int(stats.cpu?.user ?? 0))% | Sys: \(Int(stats.cpu?.sys ?? 0))%",
                                         color: .blue, 
                                         data: history, 
                                         keyPath: \.cpu)
                                
                                ChartTile(title: "内存使用率", 
                                         value: "\(Int(Double(stats.memory.usedMB) / Double(stats.memory.totalMB) * 100))%", 
                                         subValue: "\(stats.memory.usedMB) MB / \(stats.memory.totalMB) MB",
                                         color: .orange, 
                                         data: history, 
                                         keyPath: \.memory)
                                
                                ChartTile(title: "网络流量 (KB/s)", 
                                         value: "↓\(Int(history.last?.netIn ?? 0)) ↑\(Int(history.last?.netOut ?? 0))", 
                                         subValue: "总流量: ↓\(formatBytes(stats.netBytes?.in ?? 0)) ↑\(formatBytes(stats.netBytes?.out ?? 0))",
                                         color: .green, 
                                         data: history, 
                                         isNetwork: true)
                            }
                            .padding(.horizontal)
                        }
                        
                        // System Details Tiles Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("系统信息")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            let detailColumns = horizontalSizeClass == .regular ? 
                                [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())] : 
                                [GridItem(.flexible()), GridItem(.flexible())]
                            
                            LazyVGrid(columns: detailColumns, spacing: 12) {
                                SystemDetailTile(icon: "desktopcomputer", title: "主机名", value: stats.hostname)
                                SystemDetailTile(icon: "info.circle", title: "系统版本", value: stats.osVersion)
                                SystemDetailTile(icon: "clock", title: "运行时间", value: stats.uptime.components(separatedBy: ",").first ?? "N/A")
                                SystemDetailTile(icon: "cpu", title: "架构", value: stats.arch)
                                SystemDetailTile(icon: "internaldrive", title: "磁盘空间", value: "\(stats.disk.used) / \(stats.disk.total)")
                                SystemDetailTile(icon: "gauge", title: "负载", value: stats.loadAvg)
                                
                                if let battery = stats.battery {
                                    SystemDetailTile(icon: "battery.100", title: "电池", value: battery)
                                }
                                if let memPressure = stats.memPressure {
                                    SystemDetailTile(icon: "memorychip", title: "内存压力", value: memPressure)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(.vertical)
                    .refreshable {
                        await fetchData()
                    }
                }
            } else {
                ContentUnavailableView {
                    Label("正在同步状态", systemImage: "waveform.path.ecg.rectangle.fill")
                } description: {
                    Text("连接到远程服务器负载监控中...")
                } actions: {
                    ProgressView().controlSize(.large)
                }
            }
        }
        .navigationTitle("系统概览")
        .background(Color(.systemGroupedBackground))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: takeScreenshot) {
                    if isCapturingScreenshot {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "camera")
                            .font(.system(size: 16, weight: .semibold))
                    }
                }
                .disabled(isCapturingScreenshot)
            }
        }
        .sheet(isPresented: $showScreenshotSheet) {
            if let image = capturedImage {
                ScreenshotPreviewView(image: image)
            }
        }
        .onAppear {
            startTimer()
        }
        .onDisappear {
            stopTimer()
        }
    }
    
    func fetchData() async {
        do {
            let response: RemoteStatsResponse = try await apiClient.request("/api/system/stats")
            await MainActor.run {
                self.stats = response.data
                updateHistory(with: response.data)
            }
        } catch {
            print("Fetch stats error: \(error)")
        }
    }
    
    private func updateHistory(with stats: RemoteSystemStats) {
        let cpu = (stats.cpu?.user ?? 0) + (stats.cpu?.sys ?? 0)
        let mem = Double(stats.memory.usedMB) / Double(stats.memory.totalMB) * 100
        
        var netIn: Double = 0
        var netOut: Double = 0
        
        if let currentNet = stats.netBytes, let prevNet = prevNetBytes {
            // Assume 2s interval
            netIn = Double(currentNet.in - prevNet.in) / 1024 / 2.0
            netOut = Double(currentNet.out - prevNet.out) / 1024 / 2.0
        }
        
        self.prevNetBytes = stats.netBytes
        
        let point = MetricPoint(date: Date(), cpu: cpu, memory: mem, netIn: max(0, netIn), netOut: max(0, netOut))
        history.append(point)
        if history.count > 60 { history.removeFirst() }
    }
    
    func startTimer() {
        Task { await fetchData() }
        timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
            Task { await fetchData() }
        }
    }
    
    func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
    
    @State private var aiAnalysis: String?
    @State private var isAnalyzing = false
    
    func analyzeSystem() {
        guard let stats = stats else { return }
        isAnalyzing = true
        Task {
            do {
                let prompt = "Help me analyze this system status output:\n\(stats)\nPlease provide comments on health, resource usage, and any suggestions in Chinese."
                let aiResponse: AIResponse = try await apiClient.request("/api/ai", method: "POST", body: ["prompt": prompt])
                await MainActor.run {
                    withAnimation {
                        self.aiAnalysis = aiResponse.data
                        self.isAnalyzing = false
                    }
                }
            } catch {
                await MainActor.run {
                    self.aiAnalysis = "分析失败: \(error.localizedDescription)"
                    self.isAnalyzing = false
                }
            }
        }
    }
    
    @State private var isCapturingScreenshot = false
    @State private var capturedImage: UIImage?
    @State private var showScreenshotSheet = false
    
    func takeScreenshot() {
        isCapturingScreenshot = true
        Task {
            do {
                let response: ScreenshotResponse = try await apiClient.request("/api/system/screenshot", method: "POST")
                if let base64 = response.data?.components(separatedBy: ",").last,
                   let data = Data(base64Encoded: base64),
                   let image = UIImage(data: data) {
                    await MainActor.run {
                        self.capturedImage = image
                        self.showScreenshotSheet = true
                        self.isCapturingScreenshot = false
                    }
                } else {
                    throw NSError(domain: "ScreenshotError", code: 0, userInfo: [NSLocalizedDescriptionKey: "解码图像失败"])
                }
            } catch {
                await MainActor.run {
                    self.isCapturingScreenshot = false
                }
            }
        }
    }
    
    private func formatBytes(_ bytes: Int64) -> String {
        let gb = Double(bytes) / 1024 / 1024 / 1024
        if gb >= 1.0 {
            return String(format: "%.1f GB", gb)
        } else {
            let mb = Double(bytes) / 1024 / 1024
            return String(format: "%.0f MB", mb)
        }
    }
}

struct ScreenshotPreviewView: View {
    let image: UIImage
    @Environment(\.dismiss) private var dismiss
    
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    
    var body: some View {
        NavigationStack {
            VStack {
                GeometryReader { geo in
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(
                            MagnificationGesture()
                                .onChanged { value in
                                    let delta = value / lastScale
                                    lastScale = value
                                    scale *= delta
                                }
                                .onEnded { _ in
                                    lastScale = 1.0
                                    if scale < 1.0 {
                                        withAnimation {
                                            scale = 1.0
                                            offset = .zero
                                        }
                                    }
                                }
                        )
                        .simultaneousGesture(
                            DragGesture()
                                .onChanged { value in
                                    if scale > 1.0 {
                                        offset = CGSize(
                                            width: lastOffset.width + value.translation.width,
                                            height: lastOffset.height + value.translation.height
                                        )
                                    }
                                }
                                .onEnded { _ in
                                    lastOffset = offset
                                }
                        )
                        .onTapGesture(count: 2) {
                            withAnimation {
                                if scale > 1.0 {
                                    scale = 1.0
                                    offset = .zero
                                    lastOffset = .zero
                                } else {
                                    scale = 2.0
                                }
                            }
                        }
                        .frame(width: geo.size.width, height: geo.size.height)
                }
                .clipped()
                .background(Color.black.opacity(0.05))
                .cornerRadius(12)
                .padding()
            }
            .navigationTitle("屏幕快照")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.secondary)
                    }
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 20) {
                        ShareLink(item: Image(uiImage: image), preview: SharePreview("屏幕快照", image: Image(uiImage: image))) {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                }
            }
        }
    }
}


struct ChartTile: View {
    let title: String
    let value: String
    let subValue: String
    let color: Color
    let data: [DashboardView.MetricPoint]
    var keyPath: KeyPath<DashboardView.MetricPoint, Double>? = nil
    var isNetwork: Bool = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            
            // Value Row
            Group {
                if isNetwork {
                    let down = Int(data.last?.netIn ?? 0)
                    let up = Int(data.last?.netOut ?? 0)
                    HStack(spacing: 8) {
                        Label("\(down)", systemImage: "arrow.down")
                            .foregroundStyle(.blue)
                        Label("\(up)", systemImage: "arrow.up")
                            .foregroundStyle(.green)
                    }
                    .font(.title3)
                    .fontWeight(.bold)
                } else {
                    Text(value)
                        .font(.title3)
                        .fontWeight(.bold)
                        .foregroundStyle(color)
                }
            }
            .frame(height: 28)
            
            // SubValue Row
            Text(subValue)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(height: 14)
            
            chartContent
                .frame(height: 100)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
    
    @ViewBuilder
    private var chartContent: some View {
        Chart(data) { point in
            if isNetwork {
                // 下载
                AreaMark(
                    x: .value("Time", point.date),
                    y: .value("下载", point.netIn)
                )
                .foregroundStyle(.blue.opacity(0.18))
                .interpolationMethod(.monotone)
                LineMark(
                    x: .value("Time", point.date),
                    y: .value("下载", point.netIn)
                )
                .foregroundStyle(.blue)
                .lineStyle(StrokeStyle(lineWidth: 2))
                .interpolationMethod(.monotone)
                // 上传
                AreaMark(
                    x: .value("Time", point.date),
                    y: .value("上传", point.netOut)
                )
                .foregroundStyle(.green.opacity(0.18))
                .interpolationMethod(.monotone)
                LineMark(
                    x: .value("Time", point.date),
                    y: .value("上传", point.netOut)
                )
                .foregroundStyle(.green)
                .lineStyle(StrokeStyle(lineWidth: 2))
                .interpolationMethod(.monotone)
            } else if let keyPath = keyPath {
                AreaMark(
                    x: .value("Time", point.date),
                    y: .value("Value", point[keyPath: keyPath])
                )
                .foregroundStyle(color.opacity(0.1))
                .interpolationMethod(.monotone)
                LineMark(
                    x: .value("Time", point.date),
                    y: .value("Value", point[keyPath: keyPath])
                )
                .foregroundStyle(color)
                .lineStyle(StrokeStyle(lineWidth: 2))
                .interpolationMethod(.monotone)
            }
        }
        .chartXAxis(.hidden)
        .chartXScale(domain: Date().addingTimeInterval(-120)...Date())
        .chartYAxis {
            if isNetwork {
                AxisMarks(position: .trailing)
            } else {
                AxisMarks(position: .trailing, values: [0, 50, 100])
            }
        }
        .chartYScale(domain: chartsDomain)
    }
    
    private var chartsDomain: ClosedRange<Double> {
        if isNetwork {
            let maxVal = data.map { max($0.netIn, $0.netOut) }.max() ?? 10
            return 0.0...max(10.0, maxVal * 1.2)
        } else {
            return 0.0...100.0
        }
    }
}

struct SystemDetailTile: View {
    let icon: String
    let title: String
    let value: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.caption2)
                .foregroundStyle(.secondary)
            
            Text(value)
                .font(.subheadline)
                .fontWeight(.bold)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct StatRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(.primary)
                .lineLimit(1)
        }
        Divider()
    }
}

#Preview {
    NavigationStack {
        DashboardView()
            .environment(RemoteAPIClient())
    }
}
