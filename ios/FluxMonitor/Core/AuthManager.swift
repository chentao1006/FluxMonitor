import Foundation
import SwiftUI

class AuthManager: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var currentUser: String?
    @Published var panelURL: String = ""
    
    private let apiClient: APIClient
    private let userDefaults = UserDefaults.standard
    
    init(apiClient: APIClient) {
        self.apiClient = apiClient
        loadSession()
    }
    
    func loadSession() {
        if let savedURL = userDefaults.string(forKey: "panel_url") {
            self.panelURL = savedURL
            apiClient.setBaseURL(savedURL)
        }
        
        // Check if we have a valid session (this is a simplified check)
        // In a real app, we might want to check the Keychain or hit a /me endpoint
        self.isAuthenticated = userDefaults.bool(forKey: "is_authenticated")
        self.currentUser = userDefaults.string(forKey: "current_user")
    }
    
    func login(urlString: String, username: String, password: String) async throws {
        // Clean URL string (remove trailing slash)
        var cleanURL = urlString
        if cleanURL.hasSuffix("/") {
            cleanURL.removeLast()
        }
        
        apiClient.setBaseURL(cleanURL)
        
        let loginData: [String: String] = [
            "username": username,
            "password": password
        ]
        
        let body = try JSONEncoder().encode(loginData)
        let response: LoginResponse = try await apiClient.request("/api/auth/login", method: "POST", body: body)
        
        if response.success {
            DispatchQueue.main.async {
                self.isAuthenticated = true
                self.currentUser = username
                self.panelURL = cleanURL
                
                self.userDefaults.set(cleanURL, forKey: "panel_url")
                self.userDefaults.set(true, forKey: "is_authenticated")
                self.userDefaults.set(username, forKey: "current_user")
            }
        } else {
            throw APIError.unauthorized
        }
    }
    
    func logout() {
        // In a real app, hit /api/auth/logout
        DispatchQueue.main.async {
            self.isAuthenticated = false
            self.currentUser = nil
            self.userDefaults.set(false, forKey: "is_authenticated")
            self.userDefaults.removeObject(forKey: "current_user")
        }
    }
}

struct LoginResponse: Codable {
    let success: Bool
    let error: String?
}
