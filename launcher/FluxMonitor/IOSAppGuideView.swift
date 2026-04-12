import SwiftUI

struct IOSAppGuideView: View {
    @StateObject var i18n = I18N.shared
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        VStack(spacing: 25) {
            HStack {
                Spacer()
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding([.top, .trailing], 15)
            
            VStack(spacing: 15) {
                Image("QRCode")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 200, height: 200)
                    .cornerRadius(12)
                    .shadow(color: Color.blue.opacity(0.3), radius: 10, x: 0, y: 5)
                
                VStack(spacing: 8) {
                    Text(i18n.t("ios_app_title"))
                        .font(.title3.bold())
                    
                    Text(i18n.t("ios_app_desc"))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
            }
            
            VStack(spacing: 12) {
                Link(destination: URL(string: "https://apps.apple.com/app/flux-remote/id6761290185")!) {
                    Image(i18n.t("app_store_badge"))
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(height: 44)
                }
                .buttonStyle(.plain)
                
                Button(action: { dismiss() }) {
                    Text(i18n.t("dismiss"))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }
            
            Spacer()
        }
        .frame(width: 350, height: 480)
    }
}
