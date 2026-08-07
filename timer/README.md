# timer

A timer that keeps back-to-back presentations to the same limit.

Live page: <https://githog-c.github.io/timer/index.html>

Two modes ship on that page. Pick by how much you trust the pages you will be
presenting on.

## Floating window (recommended)

Press **開啟浮動計時視窗** to open a small always-on-top window via the
Document Picture-in-Picture API. It lives outside the page being presented, so
a hostile Content Security Policy, hostile CSS, an SPA re-render, or navigating
to a different origin cannot touch it. It is the only mode that genuinely works
everywhere.

The trade-off: the window is always visible rather than appearing only when it
has something to say. Keep the timer page open in a tab (backgrounded is fine)
for the window to exist. Needs Chrome or Edge 116+.

## Bookmarklet overlay

Set the limit and the pre-warning point, drag the black button onto your
bookmarks bar, click it when a speaker starts. Stays invisible until it needs
your attention.

| Moment | What happens |
|---|---|
| First click | Starts the clock. A pill appears at the top-right for 2.5 seconds, then hides. |
| Pre-warning (default minute 4) | Pill reappears with the time remaining and a single beep, then hides after one second. |
| Time up (default minute 5) | A red panel appears and **stays**, counting the overtime. |
| Click again while running | Opens a small menu: speaker number, elapsed time, and next / stop / dismiss. |

"Next" bumps the speaker number and restarts from zero, so everyone gets the
same allowance.

A second **顯示測試** bookmarklet drops a panel that does not auto-hide and
reports how it had to position itself. Click it once on a site to find out
whether that site can host the overlay at all.

## Why the overlay is hard, and what it does about it

An overlay injected into someone else's page has to survive that page. Each of
these was reproduced before it was fixed:

| Hazard | What goes wrong | What the overlay does |
|---|---|---|
| `body { transform \| filter \| will-change }` | The body becomes the containing block for `position:fixed`, so the overlay scrolls away with the document — measured at `top:-1478` after a 1500px scroll | Mounts on `<html>`, not `<body>`. If `<html>` is itself a containing block, a probe catches the miss and switches to absolute positioning that tracks scroll |
| `div { display:none !important }` | Page CSS erases it | Custom `<x-timer-hud>` tag so `div` selectors miss, content inside a shadow root, every critical property written inline with `!important` |
| SPA re-render | The node is removed | A 250 ms tick re-attaches when `isConnected` is false and re-asserts styles when computed style says it was hidden |
| Element fullscreen | Only the fullscreen element is painted | Re-parents itself into `document.fullscreenElement` on `fullscreenchange` |
| `#` or non-ASCII in the bookmarklet URL | Truncation risk | The generated URL is percent-escaped and pure ASCII |
| Content Security Policy | The bookmarklet never runs at all | Nothing can fix this from inside a bookmarklet — use the floating window |

The overlay also carries `pointer-events:none` while visible, so it never
swallows a click, and it is `display:none` the rest of the time.

## Notes

- Overlay progress is kept in `localStorage` under `__timerState__`: navigating
  within the same origin resumes the run, crossing to another origin does not.
  The floating window has no such limit.
- Timing comes from timestamps rather than interval counts, so background tab
  throttling does not skew it. Audio may still be deferred by the OS.
- Beeps use the Web Audio API, which browsers unlock on a user gesture — that
  is why starting the clock plays one very short confirmation tone.

Single self-contained HTML file. No build step, no dependencies, no network
calls.

## Editing

`timer(TOTAL, WARN, SOUND, DOT, TEST)` in `index.html` is the only source of
truth for the overlay; the `javascript:` URL is regenerated from
`timer.toString()` at page load, then percent-escaped. `TEST=1` is the display
test. The compressor strips whole-line comments and collapses whitespace, so
when editing: keep comments on their own lines, never put two consecutive
spaces inside a string literal, and terminate every statement with a semicolon.
Shadow-DOM rules are prefixed with the `@@` marker, replaced with either an
empty string or `x-timer-hud ` depending on whether `attachShadow` succeeded.

The floating-window code is not part of the injected function — it lives in the
page's own IIFE, since it never has to survive a foreign document.

MIT, per the LICENSE at the repository root.

---

Published 2026-08-07 as `report-timer`; renamed to `timer` and hardened to v2
the same day. The old path is gone rather than redirected.
