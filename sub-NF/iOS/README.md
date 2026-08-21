# sub-NF — iOS

## The short, honest answer

**Goal #1 — a native iOS app that makes the *Netflix app* display built-in
bilingual subtitles — is not possible** with public, App-Store-allowed iOS
APIs. This is not a "hard to build" problem; it is a wall. iOS sandboxes every
app: one app cannot read another app's memory, draw over another app's window,
or inject anything into it. There is no iOS equivalent of Android's
"draw over other apps" permission, and the one screen-capture API (ReplayKit)
returns black frames for DRM video like Netflix. The full analysis, including
every alternative considered and why each fails, is in
[`FEASIBILITY.md`](./FEASIBILITY.md).

So this folder does the achievable thing instead.

## What we ship on iOS: a Safari Web Extension

Since **iOS 15**, Safari on iPhone and iPad runs Web Extensions. The bilingual
overlay you get on desktop works the same way on iOS **when you watch Netflix in
Safari** (`netflix.com`) rather than in the Netflix app. Netflix web playback
works in iOS Safari, and our extension adds the second subtitle line on top of
it.

The extension under [`extension/`](./extension/) is the **same code** as the
Chrome and macOS-Safari builds — same page hook, same WebVTT parser, same
overlay. iOS needs no code changes; it only needs different packaging (an Xcode
app with an iOS target).

> **Trade-off, stated plainly:** you watch in Safari, not the Netflix app. If
> you must use the Netflix app itself, no App-Store solution exists (see
> `FEASIBILITY.md`). Watching in Safari is the price of getting real dual
> subtitles on iOS without jailbreaking.

## Build it

You need macOS with Xcode; iOS apps can only be built there.

```sh
# from sub-NF/iOS/
./build-ios.sh          # wraps xcrun safari-web-extension-converter for iOS
```

or by hand:

```sh
xcrun safari-web-extension-converter ./extension \
  --app-name "sub-NF" \
  --bundle-identifier com.example.subnf \
  --ios-only \
  --project-location ./build \
  --no-open
```

Then:

1. `open ./build/sub-NF/sub-NF.xcodeproj`.
2. Select the **sub-NF (iOS)** target, set your signing Team, choose your
   iPhone (or a Simulator), **Run** (⌘R).
3. On the device: **Settings → Apps → Safari → Extensions → sub-NF → turn on**,
   and set `netflix.com` permission to **Allow** (on older iOS:
   **Settings → Safari → Extensions**).
4. Open `netflix.com` in Safari, sign in, press play, then tap the **ᴀA** /
   puzzle-piece button in the address bar → **sub-NF** to pick your two
   languages.

The optional [`host-app/`](./host-app/) folder has a small SwiftUI screen you
can drop into the generated app so it greets users with these enable-me
instructions instead of Apple's placeholder.

## Requirements

- iOS/iPadOS 15 or newer (16.4+ recommended, matching the MV3 service worker).
- A Mac with Xcode 15+ to build and sign.
- To install on a physical iPhone you need a signing identity: a free Apple ID
  works for a 7-day personal build; a paid Apple Developer account is needed for
  a stable install or TestFlight/App Store.

## Controls and behaviour

Identical to the other builds — see [`../Chrome/README.md`](../Chrome/README.md).

## Responsible use

Personal, private, language-learning use. No video/subtitle downloading, saving,
or redistribution; no DRM circumvention. Respect Netflix's Terms of Use and your
local copyright law. "Netflix" is a trademark of Netflix, Inc.; this is an
independent tool with no affiliation or endorsement.

MIT, per the LICENSE at the repository root.
