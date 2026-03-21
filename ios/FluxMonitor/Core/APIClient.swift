import Foundation
import Combine

enum APIError: Error {
    case invalidURL
    case requestFailed
    case decodingFailed
    case unauthorized
}

class APIClient {
    private var baseURL: URL?
    private let session: URLSession
    
    init(baseURL: String? = nil) {
        if let urlString = baseURL {
            self.baseURL = URL(string: urlString)
        }
        
        // Use a session configuration that manages cookies
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        self.session = URLSession(configuration: config)
    }
    
    func setBaseURL(_ urlString: String) {
        self.baseURL = URL(string: urlString)
    }
    
    func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        guard let url = baseURL?.appendingPathComponent(path) else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        
        if let body = body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.requestFailed
        }
        
        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.requestFailed
        }
        
        do {
            let decoder = JSONDecoder()
            return try decoder.decode(T.self, from: data)
        } catch {
            print("Decoding error: \(error)")
            throw APIError.decodingFailed
        }
    }
}
