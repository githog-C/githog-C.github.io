# sub-NF — Netflix bilingual subtitles

Show **two subtitle languages at once** on Netflix, from Netflix's own subtitle
tracks. Built for language learning: the language you are studying and your
native language on the same frame.

## What was asked, and what is actually possible

The original goal was, in order of preference:

1. An **iOS app** that makes the **Netflix app** show built-in bilingual
   subtitles.
2. Failing that, browser extensions: **Safari** and **Chrome**.

Goal 1 is **not achievable** with public, App-Store-allowed iOS APIs — and not
for lack of effort. iOS sandboxes every app: none may read another app's screen
or draw over another app's window, and the one screen-capture path returns black
frames for DRM video like Netflix. Android apps that do this lean on two
permissions iOS has never given third parties ("draw over other apps" and an
accessibility service that reads other apps). The full analysis is in
[`iOS/FEASIBILITY.md`](./iOS/FEASIBILITY.md).

So this project delivers the achievable thing, everywhere it *is* achievable —
Netflix **in a browser**:

| Folder | Platform | Status |
|---|---|---|
| [`Chrome/`](./Chrome/) | Chrome / Edge / Brave / any Chromium | ✅ Load-unpacked and go |
| [`Safari/`](./Safari/) | Safari on macOS | ✅ Build once in Xcode, then enable |
| [`iOS/`](./iOS/) | Safari on iPhone / iPad (iOS 15+) | ✅ Same extension, iOS Xcode target |

The **iOS deliverable is a Safari Web Extension** — the closest thing to goal 1
that exists: it adds the second subtitle line when you watch `netflix.com` in
Safari on your iPhone/iPad. The trade-off is that you watch in Safari, not the
Netflix app.

## One engine, three packages

The extension code is written once and is **byte-identical** across the three
folders (`Chrome/` is the reference; `Safari/extension/` and `iOS/extension/`
are copies). Only the packaging differs: Chrome loads a folder directly; Safari
and iOS must be wrapped in a signed app with Xcode.

How it works, in one paragraph: Netflix already downloads subtitle tracks to the
browser to draw captions. A page-world hook gets that track list — via Netflix's
own player API, or by watching `JSON.parse` / `fetch` / `XHR` for the player
manifest — then the extension fetches the two languages you chose, parses the
WebVTT, and renders a two-line overlay synced to the video clock. Either line
can instead be set to **Netflix 目前顯示的字幕**, which reads Netflix's own
rendered caption straight out of the page and so needs no track list at all.
It never touches the video, audio, or DRM, and it stores/redistributes nothing.
Details, the diagnostics panel, and the failure modes are in
[`Chrome/README.md`](./Chrome/README.md).

## Quick start (Chrome)

1. `chrome://extensions` → **Developer mode** on → **Load unpacked** →
   choose [`Chrome/`](./Chrome/).
2. Open a title on `netflix.com`, press play.
3. Click the sub-NF icon, pick your two languages.

Safari and iOS need a one-time Xcode build — see each folder's `BUILD.md` /
`README.md`.

## Tests

```
cd Chrome && node test/run-tests.js
```

Pure-logic unit tests (WebVTT parsing, cue lookup, manifest extraction), no
dependencies.

## Responsible use

Personal, private, language-learning use. It does not download, save, or
redistribute subtitles or video, and it does not defeat copy protection. Respect
Netflix's Terms of Use and your local copyright law. "Netflix" is a trademark of
Netflix, Inc.; this is an independent, unaffiliated tool.

MIT, per the LICENSE at the repository root.
