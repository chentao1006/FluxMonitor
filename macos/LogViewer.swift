import SwiftUI

struct LogViewer: View {
    @StateObject var pm = ProcessManager.shared
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                Text(pm.logs)
                    .font(.system(.footnote, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
            .background(Color.black.opacity(0.8))
            .foregroundColor(.green)
            
            HStack {
                Button("Clear Logs") {
                    pm.logs = ""
                }
                .keyboardShortcut("k", modifiers: .command)
                
                Spacer()
                
                Text(pm.isRunning ? "🟢 Running" : "🔴 Stopped")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(10)
            .background(Color(NSColor.windowBackgroundColor))
        }
        .frame(minWidth: 400, minHeight: 300)
    }
}
