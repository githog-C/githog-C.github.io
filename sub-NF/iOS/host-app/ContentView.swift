// Optional drop-in for the iOS host app that
// `safari-web-extension-converter` generates. It replaces Apple's placeholder
// screen with a short "how to turn me on" guide. The host app does nothing at
// runtime except point the user at Settings — all the real work happens in the
// Safari extension.
//
// To use: after running build-ios.sh, replace the generated ContentView.swift
// (iOS target) with this file, or paste its body in.

import SwiftUI

struct ContentView: View {
    private let steps: [(String, String)] = [
        ("1", "Open Settings → Apps → Safari → Extensions → sub-NF and turn it on. (On older iOS: Settings → Safari → Extensions.)"),
        ("2", "Set netflix.com permission to Allow."),
        ("3", "Open netflix.com in Safari and sign in."),
        ("4", "Play a title, then tap the ᴀA / puzzle-piece button in the address bar → sub-NF to choose your two languages."),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 6).fill(Color.red).frame(width: 34, height: 12)
                    RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.85)).frame(width: 22, height: 12)
                }
                Text("sub-NF")
                    .font(.largeTitle).bold()
                Text("Bilingual subtitles for Netflix in Safari.")
                    .font(.headline).foregroundStyle(.secondary)

                Divider()

                ForEach(steps, id: \.0) { step in
                    HStack(alignment: .top, spacing: 12) {
                        Text(step.0)
                            .font(.headline)
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(Color.red.opacity(0.15)))
                        Text(step.1)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Text("Open Settings")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.red)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(.top, 4)

                Text("You watch in Safari, not the Netflix app — that is the only way to get real dual subtitles on iOS without jailbreaking. See FEASIBILITY.md in the project for why.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, 8)

                Text("Personal, language-learning use. Not affiliated with or endorsed by Netflix.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(24)
        }
    }
}

#Preview {
    ContentView()
}
