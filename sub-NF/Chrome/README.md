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
| `src/inject.js` | page (MAIN) | Gets the subtitle track list, four different ways (below). Forwards it over `window.postMessage`. |
| `src/content.js` | isolated | Resolves your two chosen sources, fetches + parses their WebVTT, and renders a two-line overlay synced to `video.currentTime`. |
| `src/background.js` | service worker | Fetches a WebVTT file from Netflix's caption CDN. Doing it here sidesteps page CORS. Returns plain text, stores nothing. |
| `src/vtt.js` | isolated | WebVTT parsing + reading Netflix's own caption out of the DOM. Split out so it is unit-testable (`node test/run-tests.js`). |
| `popup/` | — | Source pickers, appearance controls, diagnostics. |

### Getting the track list is the hard part — so there are four paths

There is no single reliable way to learn which subtitle tracks a title has, so
`inject.js` tries all of these and takes whichever answers first:

1. **`getTimedTextTrackList()`** — Netflix's own player API
   (`netflix.appContext…playerApp.getAPI().videoPlayer`). Tried first and
   re-polled every 2 s until it answers, because the track list only exists once
   playback has actually begun.
2. **`JSON.parse` hook** — Netflix parses its player *manifest* through it.
3. **`Response.prototype.json` / `.text` hooks** — for a manifest read straight
   off a `fetch()`.
4. **`XMLHttpRequest` load hook** — same, for the XHR path.

Paths 2–4 only see main-thread parsing. **Path 1 is the insurance policy:** if
Netflix decrypts and parses the manifest inside a Web Worker, no main-thread
hook can see it, but the player object still knows its own track list.

`inject.js` is registered as a `"world": "MAIN"` content script at
`document_start`, so the hooks are installed *before* any Netflix code runs.
(It is also injected as a `<script>` tag for browsers without MAIN-world
support; a guard stops it installing twice.)

### The path that always works: `Netflix 目前顯示的字幕`

Either line can be set to the special source **“Netflix 目前顯示的字幕”**, which
reads Netflix's own rendered caption straight out of the DOM
(`.player-timedtext`). It needs no manifest, no track list, and no download — so
it works even when all four capture paths fail.

Pick the language you want for that line in **Netflix's own subtitle menu**, and
sub-NF puts your second language on the other line. This is the default for the
top line, so the extension does something useful immediately.

When a line is using this source, Netflix's own caption is hidden with
`opacity: 0` rather than `display: none` — Netflix has to keep rendering it for
us to be able to read it.

## Controls

- **On/off**, and **第一語言 / 第二語言** — the two sources, top and bottom.
  Each dropdown offers **Netflix 目前顯示的字幕** plus the languages this title
  actually has, once playback has started; before that it shows a
  common-language fallback.
- **上下對調** — swap which language is on top.
- **隱藏 Netflix 原生字幕** — hide Netflix's built-in caption line so you do not
  get it three times.
- **優先使用 CC 字幕** — prefer the closed-caption variant when a language has
  both.
- **外觀與微調** — font size, vertical position, line gap, and a per-language
  timing offset (±5 s) for the odd out-of-sync track.

Settings live in `chrome.storage.local` and apply live.

## Troubleshooting

The popup has a **診斷** panel. Open it on the playing tab and read down:

| Row | If it says 否 / 0 |
|---|---|
| 播放頁 | You are not on a `/watch/…` page. |
| 頁面掛鉤有回應 | The page-world hook never loaded — check the extension is enabled for `netflix.com` and reload the tab. |
| Netflix 播放器 API | Netflix's player object was not reachable; capture path 1 is unavailable. Start playback and wait a few seconds. |
| 抓到字幕軌 | No track list from any of the four paths. Set one line to **Netflix 目前顯示的字幕** — that path does not need a track list. |
| 各路徑 | Which capture path answered (`api` / `json` / `resp` / `xhr`). All zero means Netflix changed something. |
| 原生字幕可讀 | Netflix is not currently drawing a caption — turn subtitles on in Netflix's own menu. |
| 下載成功 / 失敗 | A track was found but its WebVTT could not be fetched; **最後錯誤** gives the reason. |

## Limits and failure modes

- **Netflix only.** The manifest and player-API shapes are Netflix-specific.
- **Play first.** The track list only exists once playback has started, so give
  it a few seconds. The extension re-polls every 2 s until it appears.
- **A language you pick may not exist for a title.** The popup says so.
- **Netflix can change things.** That is why there are four capture paths plus a
  DOM-reading path that depends on none of them. Track extraction is isolated in
  `normaliseTracks()` and `tracksFromManifest()`, both unit-tested, so a fix is
  a small, well-covered edit.
- Subtitle download URLs are short-lived signed CDN links; the extension
  re-reads them rather than caching across sessions.

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
