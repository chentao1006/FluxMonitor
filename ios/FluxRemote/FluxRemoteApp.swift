import SwiftUI

@main
struct FluxRemoteApp: App {
    @State private var apiClient = RemoteAPIClient()
    
    var body: some Scene {
        WindowGroup {
            AppContainerView()
                .environment(apiClient)
        }
    }
}
