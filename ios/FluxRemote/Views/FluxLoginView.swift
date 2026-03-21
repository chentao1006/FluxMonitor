import SwiftUI

struct FluxLoginView: View {
    @Environment(RemoteAPIClient.self) private var apiClient
    
    @State private var panelURL: String = ""
    @State private var username: String = ""
    @State private var password: String = ""
    @FocusState private var focusedField: Field?
    
    enum Field {
        case url, username, password
    }
    
    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            
            // Header
            VStack(spacing: 12) {
                Image("logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 80, height: 80)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .shadow(color: .black.opacity(0.1), radius: 10, x: 0, y: 5)
                
                Text("浮光远控")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("FluxRemote 安全连接")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            
            // Login Form
            VStack(spacing: 20) {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("服务器地址 (https://...)", text: $panelURL)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .focused($focusedField, equals: .url)
                        .submitLabel(.next)
                    
                    TextField("用户名", text: $username)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .focused($focusedField, equals: .username)
                        .submitLabel(.next)
                    
                    SecureField("访问密钥", text: $password)
                        .textFieldStyle(.roundedBorder)
                        .focused($focusedField, equals: .password)
                        .submitLabel(.go)
                }
                .onSubmit {
                    switch focusedField {
                    case .url: focusedField = .username
                    case .username: focusedField = .password
                    default: login()
                    }
                }
                .padding(.horizontal)
                
                if let error = apiClient.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                }
                
                Button(action: login) {
                    if apiClient.isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("立即登录")
                            .fontWeight(.semibold)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(apiClient.isLoading || panelURL.isEmpty || username.isEmpty || password.isEmpty)
            }
            .frame(maxWidth: 400)
            
            Spacer()
            
            Text("v1.0.0 (Native Build)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(uiColor: .systemGroupedBackground))
    }
    
    func login() {
        Task {
            await apiClient.login(urlString: panelURL, credentials: [
                "username": username,
                "password": password
            ])
        }
    }
}

#Preview {
    FluxLoginView()
        .environment(RemoteAPIClient())
}
