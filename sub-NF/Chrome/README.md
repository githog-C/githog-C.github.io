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
| `src/content.js` | isolated | Resolves the two chosen sources, downloads + parses each into its **own** cue array, and renders two independent lines synced to `video.currentTime`. |
| `src/background.js` | service worker | Fetches a WebVTT file from Netflix's caption CDN. Doing it here sidesteps page CORS. Returns plain text, stores nothing. |
| `src/vtt.js` | isolated | WebVTT **and TTML** parsing, plus reading Netflix's own caption out of the DOM. Split out so it is unit-testable (`node test/run-tests.js`). |
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

### Two independent lines

Each line keeps **its own cue array**, parsed from its own downloaded track and
looked up by binary search against `video.currentTime` every animation frame.
That independence is the whole point: it is what lets the two lines show two
different languages, and what keeps them working when Netflix's own subtitles
are switched off entirely.

With **隱藏 Netflix 原生字幕** on, the extension really does turn Netflix's track
off — it calls `setTimedTextTrack()` with the player's own "none" track, rather
than just hiding the element. Our cues are already downloaded and keyed to the
video clock, so they are unaffected.

### The fallback source: `Netflix 目前顯示的字幕`

Either line can instead mirror whatever Netflix is drawing, read out of
`.player-timedtext`. It needs no track list at all, so it still works if every
capture path fails — but it is a fallback, not the normal path: setting *both*
lines to it just shows the same text twice. When a line is using it, Netflix's
caption is hidden with `opacity: 0` rather than switched off, since Netflix has
to keep rendering it for us to read it.

### Why tracks used to come back empty

Three bugs in the extractor, all fixed and all now covered by tests:

- **Track types arrive UPPERCASE** in real manifests (`SUBTITLES`,
  `CLOSEDCAPTIONS`); the comparison was case-sensitive and only looked for
  `subtitles`, so real tracks were dropped.
- **The `try/catch` sat outside the loop.** One malformed track threw and
  silently zeroed the *entire* batch. It is now per track.
- **Only WebVTT was accepted.** Tracks offering just a TTML variant
  (`imsc1.1`, `dfxp-ls-sdh`) were discarded, so whole languages went missing.
  There is now a format fallback chain and a TTML parser.

With no cues at all, the renderer had nothing to draw but Netflix's own caption
— which is why both lines showed the same text, and why turning the native
subtitles off left the overlay blank.

### The manifest goes past once

It cannot be re-requested, so whatever any path captures is cached in
`chrome.storage.local`, keyed by movie id (last 12 titles, 6-hour TTL, since the
CDN URLs are short-lived signed links). An expired URL is not memoised as a
failure, so a later poll with a fresh URL can still succeed.

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
| 上行 / 下行 cue 數 | That line has no cues: its language has no track on this title, or the download failed. |
| 原生字幕可讀 | Only matters if a line is set to the native mirror. |
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
- Subtitle download URLs are short-lived signed CDN links. The captured track
  list is cached for 6 hours; past that a stale URL simply fails and the next
  poll re-captures a fresh one.

## Tests

```
node test/run-tests.js
```

62 cases covering WebVTT and TTML parsing, cue lookup (including overlaps), and
track extraction — with explicit regression tests for uppercase track types, a
throwing track not zeroing the batch, and same-language CC/SUBTITLES pairs. No
dependencies, no build step.

## Please use it responsibly

This is for personal, private, language-learning use. It does not download,
save, or redistribute subtitles or video, and it does not defeat any copy
protection. Respect Netflix's Terms of Use and your local copyright law.

MIT, per the LICENSE at the repository root.
