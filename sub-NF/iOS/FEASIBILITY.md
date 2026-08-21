# Can an iOS app put bilingual subtitles on the Netflix *app*?

Short answer: **no** — not with public, App-Store-allowed APIs, and not because
it is difficult. The iOS security model forbids the two things such an app would
have to do: read what another app is showing, and draw on top of another app.

This document records exactly what was investigated and why each route fails, so
nobody has to re-derive it.

## What the goal actually requires

To add a second subtitle line to the **Netflix app**, some code would have to:

1. Know what Netflix is drawing right now (at least the current caption, or the
   subtitle stream), **and**
2. Render a second language *over Netflix's own window*, tracking it as it
   plays and goes fullscreen.

On iOS an app can do neither to another app. Every process is sandboxed; UI is
per-app; there is no shared surface a third app may paint on.

## Routes considered, and why each one is a wall

### 1. An overlay window floating over other apps
The Android approach (`SYSTEM_ALERT_WINDOW`, "draw over other apps") has **no
iOS equivalent**. An app's `UIWindow`s exist only within that app; the moment
Netflix is foregrounded your windows are not on screen. There is no entitlement,
public or private-but-tolerated, that grants a cross-app overlay. Wall.

### 2. An App Extension
iOS extension points are a fixed menu — Share, Action, Widgets, Live Activities,
custom keyboard, Shortcuts, Broadcast Upload, etc. **None** of them is "draw a
subtitle over another app," and an extension still cannot see or cover Netflix's
UI. There is no subtitle/overlay extension point to target. Wall.

### 3. The Accessibility APIs
On macOS the AX API and on Android an `AccessibilityService` can read another
app's on-screen elements. **iOS deliberately exposes no such third-party API.**
VoiceOver / Switch Control / AssistiveTouch are system features; apps can
*describe themselves* to them but cannot use accessibility to inspect or overlay
a *different* app. Wall.

### 4. Screen capture + OCR (ReplayKit / Broadcast Upload Extension)
Even if you were willing to OCR the screen and somehow show the result, two
things kill it:
- **DRM blanks the capture.** Netflix plays FairPlay-protected video. Protected
  content is excluded from screen recording; ReplayKit hands you **black frames**
  where the video is. There is nothing to OCR.
- **You still can't draw over Netflix** (see route 1), so the OCR result has
  nowhere to go.

Wall, twice over.

### 5. Network interception (VPN / content filter — NEPacketTunnelProvider, NEFilter)
Capture Netflix's traffic, pull the subtitle track out, render it yourself?
- The Netflix app uses TLS and pins/validates its connections; a
  `NEPacketTunnelProvider` cannot transparently MITM and decrypt that stream.
- Even with the subtitle bytes in hand, route 1 still applies — no way to paint
  them over the Netflix app.
- It is also exactly the kind of user-hostile, terms-violating interception this
  project does not want to build.

Wall.

### 6. Your own browser app: Netflix in a `WKWebView` + injected JS
This *is* allowed — it is your app, your web view, your script. But:
- It is **not the Netflix app.** It is a browser you wrote. At that point you
  are "watching Netflix in a browser," which the Safari extension already does —
  better, inside real Safari, with the OS handling DRM.
- Netflix web playback in a **generic third-party `WKWebView`** is unreliable:
  FairPlay EME needs the app to drive an `AVContentKeySession`, and Netflix's
  web client expects a recognised browser; unknown web-view/app contexts are
  commonly blocked or capped.

So this route does not deliver "the Netflix app with dual subs"; it degrades
into "a browser with dual subs," which is route 7 done worse.

### 7. A Safari Web Extension — **the one that works**
Since iOS 15, Safari runs Web Extensions. Watching Netflix at `netflix.com` in
Safari, our extension reads Netflix's own subtitle tracks and renders the second
line — the identical engine as the desktop builds. It is App-Store-distributable
and needs no special entitlements. Its only cost: **you watch in Safari, not the
Netflix app.** This is what `../iOS/` ships.

### 8. A jailbreak tweak (for completeness)
A Cydia Substrate / Theos tweak hooking the Netflix app's rendering *could*
genuinely modify the app — but it requires a **jailbroken** device, cannot ship
on the App Store, and breaks with almost every iOS or Netflix update. It is out
of scope for "an iOS App" and is mentioned only so the list is complete.

## Why this is possible on Android but not iOS

Android bilingual-subtitle overlay apps rely on two permissions iOS has never
offered third parties: **draw over other apps** (`SYSTEM_ALERT_WINDOW`) and
**read other apps' screens** (`AccessibilityService`). iOS's sandbox omits both
by design. That single difference is the whole story: the feature is an
Android-shaped feature, and iOS is not that shape.

## Verdict

| Target | Possible? | How |
|---|---|---|
| Bilingual subs on the **Netflix iOS app** | ❌ | No public API; would need cross-app overlay + cross-app screen read, both forbidden. Only a jailbreak tweak could, and that is not an App Store app. |
| Bilingual subs on **Netflix in iOS Safari** | ✅ | Safari Web Extension (iOS 15+) — shipped in `../iOS/`. |
| Bilingual subs on **Netflix in desktop Chrome / Safari** | ✅ | `../Chrome/`, `../Safari/`. |

The honest fallback from "make the Netflix app do it" is "make Netflix-in-a-
browser do it," and that is exactly the extension in this repo.
