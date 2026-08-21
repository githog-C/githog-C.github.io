# host-app (optional)

`safari-web-extension-converter` already generates a complete host app when you
run [`../build-ios.sh`](../build-ios.sh). You do **not** need anything here to
ship — the host app is just the container the App Store requires around a Safari
extension, and Apple's generated one works.

`ContentView.swift` is an optional nicer landing screen: a short "how to enable
me" guide with an **Open Settings** button, instead of Apple's placeholder text.

## To use it

1. Run `../build-ios.sh` to generate the Xcode project.
2. In the project, open the **iOS app target**'s `ContentView.swift`.
3. Replace its contents with `ContentView.swift` from this folder (or copy the
   `body`).
4. Run.

It is plain SwiftUI with no dependencies. The host app has no runtime role
beyond pointing users at Settings; every subtitle feature lives in the extension
under [`../extension/`](../extension/).
