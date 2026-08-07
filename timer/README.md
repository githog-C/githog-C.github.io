# timer

A bookmarklet that keeps back-to-back presentations to the same time limit.

Live page: <https://githog-c.github.io/timer/index.html>

Open the page, set the limit and the pre-warning point, then drag the black
button onto your bookmarks bar. Click it when a speaker starts.

## Behaviour

| Moment | What happens |
|---|---|
| First click | Starts the clock. A pill appears at the top-right for one second, then hides. |
| Pre-warning (default minute 4) | Pill reappears with the time remaining and a single beep, then hides after one second. |
| Time up (default minute 5) | A red panel appears and **stays**, counting the overtime. |
| Click again while running | Opens a small menu: speaker number, elapsed time, and next / stop / dismiss. |

"Next" bumps the speaker number and restarts from zero, so everyone gets the
same allowance.

## Staying out of the way

The tool is meant to sit on top of whatever page is being presented, so it
tries hard not to interfere:

- the container is `display:none` while idle — it only exists visually for the
  second or two it is warning
- it carries `pointer-events:none`, so even when visible it never swallows a
  click; only the three menu buttons are interactive
- `all:initial` isolation means it neither inherits nor leaks CSS, and
  `z-index:2147483647` keeps it above sticky headers
- sizing is `clamp()`-based with `max-width:calc(100vw - 24px)`, so it still
  fits when devtools are docked and the viewport is narrow

## Notes

- Progress is kept in `localStorage` under `__timerState__`: navigating within
  the same origin resumes the run, but crossing to another origin does not.
  Re-click the bookmarklet when that happens.
- Timing is computed from timestamps rather than interval counts, so background
  tab throttling does not skew it. Audio may still be deferred by the OS.
- Beeps use the Web Audio API, which browsers unlock on a user gesture — that
  is why starting the clock plays one very short confirmation tone.
- Sites with a strict Content Security Policy block bookmarklets outright.

Single self-contained HTML file. No build step, no dependencies, no network
calls. Works in any current browser on any platform.

## Editing

`timer(TOTAL, WARN, SOUND, DOT)` in `index.html` is the only source of truth;
the `javascript:` URL is regenerated from `timer.toString()` at page load. The
compressor strips whole-line comments and collapses whitespace, so when
editing: keep comments on their own lines, never put two consecutive spaces
inside a string literal, and terminate every statement with a semicolon.
Anything injected into the host page uses the `__timer` prefix.

MIT, per the LICENSE at the repository root.

---

Published 2026-08-07 as `report-timer`; renamed to `timer` the same day. The
old path is gone rather than redirected — it was live for roughly two hours.
