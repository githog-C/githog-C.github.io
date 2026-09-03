# unsee — changelog

## 1.1.0 — 2026-09-03

**The tag strip.** A row of your own search snippets above the results — `edu`,
`site:edu.tw`, `filetype:pdf`, whatever you keep typing.

| Gesture | What it does |
|---|---|
| Left click | Appends the text to the search box |
| Left click again | Takes it out |
| Shift + left click | Puts it in and submits |
| Ctrl (⌘) + left click | Puts it in as `"a phrase"` |
| Ctrl (⌘) + Shift + left click | Puts the phrase in and searches the whole box in a background tab |
| Right click | Copies to the clipboard |

A tag is **one switch**: whichever gesture put the term in, clicking again takes it
out, quoted form included. Without that, a plain click on a quoted term would leave
`"edu" edu` behind and the tag could not say whether it was on. Ctrl-Shift is the
single exception and only ever adds — removing a term and then searching for it
would be nonsense.

**The `""` tag**, pinned first and not a snippet. It works on the text already in the
box: select part of the query and click, and those words are quoted; click again and
the quotes come off the same words. Nothing selected means the whole query. Shift
searches with it, Ctrl-Shift searches in a background tab, right click copies the
quoted words. Ctrl alone does nothing extra — quoting is already the job.

Three things it would not work without. Pressing a tag now refuses the default
mousedown, so the box keeps focus and keeps the selection — a button that takes focus
takes the selection with it and there is nothing left to quote. The changed words are
left selected, because setting `.value` collapses the selection to the end and the
second click has to find the same words. And selecting the words *inside* `"…"` undoes
just as well as selecting the phrase with its quotes: they are the same gesture to
anyone doing it, and without that case the second click produces `""def""`.

The last selection is remembered as a fallback for pages that discard it when focus
moves, but putting the caret down clears that memory — a collapsed selection is a
decision, not an accident. The strip now appears even with no snippets at all, since
the `""` tag is always in it.

**The strip moved out of the way of the suggestion list.** It began above the
results, directly under the search box, which is the one place on the page that is
guaranteed to be covered: focus the box and Google's suggestions are drawn over it.

It now goes in the results page's right-hand column — a grid item of `#rcnt` at
`grid-column: span 7 / -2`, the placement `#rhs` itself uses, counted from the end
of the grid — with an inner `position: sticky; top: 96px` so the tags follow you
down the page. When a knowledge panel is there, the strip becomes `#rhs`'s first
child instead: the panel is pushed down, not covered. Failing both, the gap in the
header row between the search form and the icons; failing that, where it started.
Everything is found by id or by climbing from the search box — not one class name.

Two numbers behind that, both measured on a live page rather than guessed:

- Google's own header goes `position: fixed` once you scroll — 71px tall,
  `z-index: 999`. A sticky strip at `top: 12px` is laid out perfectly and shown to
  nobody. Hence 96.
- **The suggestion list is much wider than the box it hangs under**: 888px against
  a 659px box, reaching 181px further right, into the right-hand column itself. So
  "beside the search box" was not "clear of the suggestions", and the first 113px
  of the strip — the `""` tag and the first two keywords — was covered whenever the
  box had focus. The rows are now right-aligned and the strip's left padding is set
  to the measured width of that band, taken from the search form. Tags wrap earlier
  rather than straying underneath. After: leftmost tag at 1119, list ends at 1071.

**Tags sort themselves into rows** by the operator they start with, in a fixed
order that does not follow the file: keywords (with `""` at the head), then
`site:`, then `filetype:`, then `after:` / `before:` / `daterange:`. Within a row
the file's order is kept and the tags run on; the break between rows is the only
thing that means anything, and a kind with nothing in it gets no row.

Each row has its own colour — `site:` blue, `filetype:` red, dates orange — while
keywords keep the neutral outline they always had, because colouring everything
colours nothing and keywords are the common case.

**On a Mac, Ctrl-click is the right click.** It raises the context menu and a click
event can follow. So the quoting modifier is ⌘ on macOS, Ctrl elsewhere, and a click
within 500ms of a context menu on the same tag is ignored: one gesture, one action.

**Right-clicking a tag no longer opens the browser menu.** That is the price of
putting copy on the right button, and it is confined to the tags themselves.

**A service worker, for one call.** Content scripts have no `chrome.tabs`, and
`window.open` puts the tab in front of you, so `src/background.js` receives one
message and calls `chrome.tabs.create({ active: false })`. It adds no permission —
`tabs` gates reading a tab's URL and title, not creating one — holds no state, and
starts only when a tag is Ctrl-Shift-clicked. `check-manifest.js` now checks the
worker's file is present too.

The URL it opens is built from the current address rather than a hard-coded search
endpoint, so the country domain and settings in the URL (`udm`, `hl`, `safe`) come
along, while parameters describing this particular result page (`start`, `ei`, `ved`
and the rest) are dropped.

Where they come from mirrors the blocklist exactly. `snippets.txt` in the extension
folder is the hand-edited one, read once per page, effective after reloading the
extension. The popup manages a second list in storage and shows the file's, read-only.
The one difference from `blocklist.txt`: the file's order is kept rather than sorted,
because here the order is the order of the tags on screen.

`顯示 = 實際字串` lets a tag say one thing and type another. Only the first `=` splits,
so a snippet needing a literal one must be given a label.

Taking a term back out matches **whole tokens only**. A substring test would find
`edu` inside `education` and inside `site:edu.tw`, and clicking the tag off would cut
a hole in text the tag never put there.

Text goes into the box through the prototype's `value` setter followed by a bubbling
`input` event, not by assigning `.value`. DuckDuckGo's box is React-controlled and a
plain assignment is invisible to it — the old value snaps straight back.

The strip is a **separate content script** (`src/tags.js`). The hiding logic has had
four rounds of fixes against live pages and a row of buttons does not belong inside
it; the two share the matcher, the stylesheet and the page, and nothing else. The
whole feature comes out by deleting one line from the manifest.

It has its own 顯示 switch, and 啟用 still takes everything down at once.

`visibility: visible` is declared on the strip and on every tag, for the same reason
it is on the per-result button: inheriting `hidden` from somebody else's wrapper lays
an element out perfectly and shows it to nobody.

94 further assertions over the file parser, the label split, the token matching, the
quoted form, the background-tab URL, quoting a selection and the row grouping (161 in
total), plus a new `test/run-tags-dom.js`: 60 assertions that run `tags.js` against a
DOM stubbed in the test file — it mounts in the right column with the sticky wrapper
and the suggestion-band padding, moves into `#rhs` when a knowledge panel appears and
back out when it goes, a click reaches the box, a second click empties it, Shift
submits, Ctrl quotes, Ctrl-Shift asks for a tab, right click copies, the `""` tag
quotes a selection and puts it back, and both switches take the strip down. That cannot speak for Google's real markup, but twice
in this project's short history the code has been correct and simply never run.

**Not yet verified in a browser.** The unit tests pass and the manifest lints, but
nothing here has been seen on a live results page — mounting, the box selectors for
all three engines, and the React path on DuckDuckGo are all still unconfirmed.


## 1.0.4 — 2026-08-25

**Hiding one result could take several others with it.** Google sometimes groups
results into a single container — an image strip, a discussions-and-forums cluster.
Climbing from a link all the way to a child of the results container landed on that
whole group, so blocking one site in it hid every site in it, and the counter said
"1 hidden" while several results had gone.

Measured on a live page: one such container held six distinct sites.

The climb now stops the moment the next level up would bring in a second site: that
parent is a group, not a result. An ordinary result is unaffected — its whole block
links to one site, so the climb reaches exactly the element it always did, which is
asserted in the tests rather than assumed.

Revealing hidden results no longer forces `display: block` back on. It simply stops
applying `none`, so an item that is a flex or grid child keeps its own layout.

Host counting is memoised per sweep and stops at two, since the only question is
"more than one?".

7 further assertions cover the climb against a stand-in tree (67 in total).

## 1.0.3 — 2026-08-25

**1.0.2 would not load.** Chrome rejected the manifest with nothing but
`Invalid value for 'web_accessible_resources[0]'. Invalid match pattern.`

The `matches` under `web_accessible_resources` were copied from the content-script
matches, which restrict the path to `/search*`. Those keys do not take the same
patterns: web-accessible-resource patterns are host-level and the path must be
exactly `/*`. Fixed by deriving them from the content-script list with the path
replaced.

Added `test/check-manifest.js`, which would have caught it before the browser did:
it validates every match pattern in the manifest against both rules — wildcards only
as the leftmost label, `/*` paths for web-accessible resources — and checks that
every file the manifest names is actually present. Verified against a deliberately
broken manifest: it reports all four planted faults and exits non-zero.

## 1.0.2 — 2026-08-25

**The button was invisible.** 1.0.1 placed it correctly and then rendered it to
nobody: the flex row it is inserted into is `visibility: hidden`, and Google's own
kebab opts back in by declaring `visibility: visible` on itself. A child that says
nothing inherits `hidden` — laid out perfectly, 20×20, in exactly the right place,
and completely unseeable. The button now declares its own visibility.

**Defaults now come from a file you edit.** `blocklist.txt` sits in the extension
folder. One entry per line, in any order; `#` comments a line out. Whether a line is
a domain or a keyword is worked out from the line itself — anything that is a valid
hostname is a domain, everything else is a keyword — so nothing has to be declared.
Prefix with `domain:` or `keyword:` on the rare line where that guess would be wrong.

- Keywords match against the result's own text, case-insensitively.
- The popup lists what the file currently contributes, read-only.
- Rules added from the button or the popup are unaffected and stay in storage.
- The file ships with every example commented out, so it blocks nothing until asked.
- Editing it takes effect after reloading the extension — it is a file, not a UI.

18 further assertions cover the file parser and keyword matching (60 in total).

## 1.0.1 — 2026-08-25

Both fixes came from the first real use.

- **The per-result control is now an icon, not a text label.** The old
  「不看 <網域>」 text sat in the citation line and collided with Google's own
  「翻譯這個網頁」 link. It is now the unsee mark, drawn inline, placed as the flex
  sibling immediately after the column holding Google's own kebab menu — to its
  right, covering nothing. Verified on live pages: 2px gap, ~1px vertical
  offset from the kebab, no row or page overflow introduced.
- **The 啟用 checkbox is now the on/off line for the whole feature.** It
  previously gated only the hiding, so buttons still appeared when unticked.
  Unticking it now tears everything down — nothing hidden, no buttons, no
  status bar — and re-ticking restores it.
- Bing and DuckDuckGo get no inline button: neither has an equivalent anchor
  that has been verified, and guessing at their DOM is how you end up covering
  something. Rules still apply there, and the popup still manages them.

## 1.0.0 — 2026-08-25

First version.

- Hides results from chosen sites on Google, Bing and DuckDuckGo.
- Rules are plain domains and cover all subdomains, with a dot boundary so
  `notexample.com` is not caught by `example.com`.
- Inline **不看 <網域>** button on every result; popup for the full list.
- A collapsed-count bar with a reveal toggle, so a hidden result is never
  silently gone.
- Redirect unwrapping for DuckDuckGo `/l/?uddg=`, Google `/url?q=` and Bing
  `/ck/a?u=a1<base64url>`.
- Result blocks located structurally (child of the results container) rather
  than by class name, which changes constantly.
- Safari source mirrored byte-for-byte from the Chrome folder; build steps and
  the bundle-identifier fix documented in `Safari/BUILD.md`. Not yet built.
- 42 unit assertions over the matching logic.
