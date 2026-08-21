# sub-NF — Chrome

A Manifest V3 extension that shows **two subtitle languages at once** on
`netflix.com`, drawn from Netflix's own subtitle tracks. Built for
language-learning: read the dialogue in the language you are studying and your
native language on the same frame.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. **Load unpacked** → pick this `Chrome/` folder.
4. Open a title on `netflix.com`, press play, then click the sub-NF toolbar
   icon to choose the two languages.

Works in any Chromium browser with the same steps: Edge (`edge://extensions`),
Brave, Opera, Vivaldi.

## How it works

Netflix already downloads subtitle tracks to your browser to render captions.
The extension reads that same data — it never touches the video, audio, or DRM.

| Piece | World | Job |
|---|---|---|
| `src/inject.js` | page (MAIN) | Wraps `JSON.parse`. Netflix parses its player *manifest* through it; that manifest lists every subtitle track with a WebVTT download URL. We forward just the track list. |
| `src/content.js` | isolated | Resolves your two chosen languages against that list, asks the background worker to fetch each WebVTT file, parses it, and renders a two-line overlay kept in sync with `video.currentTime`. |
| `src/background.js` | service worker | Fetches the WebVTT file from Netflix's caption CDN (`*.nflxvideo.net`). Doing it here sidesteps page CORS. Returns plain text, stores nothing. |
| `src/vtt.js` | isolated | WebVTT parser, split out so it can be unit-tested (`node test/run-tests.js`). |
| `popup/` | — | Language pickers + appearance controls. |

The page hook is the well-known "wrap `JSON.parse` and watch for the manifest
shape" technique (as used by the open-source *Subadub* subtitle downloader).
This code is an independent implementation, not copied from it.

### Why a page-world hook at all

A normal content script runs in an *isolated* world and cannot see Netflix's
`JSON.parse` calls. So `content.js` injects `inject.js` as a real page script;
the two halves talk over `window.postMessage` with a `__subnf` tag. This is the
most compatible route (it also works on Safari and older browsers, which is why
the Safari and iOS builds reuse these exact files).

## Controls

- **On/off**, and **第一語言 / 第二語言** — the two languages, top and bottom.
  The dropdowns list the languages this title actually offers once you have
  pressed play; before that they show a common-language fallback.
- **上下對調** — swap which language is on top.
- **隱藏 Netflix 原生字幕** — hide Netflix's built-in caption line so you do not
  get it three times.
- **優先使用 CC 字幕** — prefer the closed-caption variant when a language has
  both.
- **外觀與微調** — font size, vertical position, line gap, and a per-language
  timing offset (±5 s) for the odd out-of-sync track.

Settings live in `chrome.storage.local` and apply live.

## Limits and failure modes

- **Netflix only.** The manifest shape is Netflix-specific.
- **Play first.** The language list only appears after Netflix has fetched the
  manifest for the title, i.e. a few seconds into playback.
- **A language you pick may not exist for a title.** The popup says so.
- **Netflix can change the manifest shape.** If dual subtitles stop appearing
  after a Netflix update, `inject.js` is where the manifest shape is read; the
  extraction is isolated in `tracksFromManifest()` with tests to make a fix
  easy.
- Subtitle download URLs are short-lived signed CDN links; the extension
  re-reads them from each fresh manifest rather than caching across sessions.

## Tests

```
node test/run-tests.js
```

Covers WebVTT time/entity/tag parsing, cue lookup (including overlaps), and
manifest track extraction. No dependencies, no build step.

## Please use it responsibly

This is for personal, private, language-learning use. It does not download,
save, or redistribute subtitles or video, and it does not defeat any copy
protection. Respect Netflix's Terms of Use and your local copyright law.

MIT, per the LICENSE at the repository root.
