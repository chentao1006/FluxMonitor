import SwiftUI

struct LogViewer: View {
    @StateObject var pm = ProcessManager.shared
    
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(pm.logs)
                        .font(.custom("Menlo", size: 12))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .id("bottom")
                }
            }
            .background(Color(NSColor.textBackgroundColor))
            .onChange(of: pm.logs) { _ in
                withAnimation {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
            .onAppear {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }
}
