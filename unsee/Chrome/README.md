# unsee — Chrome

Hide chosen sites from your own search results, and keep the search terms you use
every day one click from the box.

## Install (unpacked)

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → choose this `Chrome/` folder
3. Search on Google. Each result grows a small round **unsee mark** just to the
   right of Google's own kebab menu; click it, and that site disappears from
   this and every future search.

Works the same in Edge, Brave and any other Chromium browser.

## What it covers

| Engine | Pages |
|---|---|
| Google | `google.com`, `google.com.tw`, `.co.jp`, `.co.uk` — the `/search` pages |
| Bing | `bing.com/search` |
| DuckDuckGo | `duckduckgo.com`, plus the `html.` and `lite.` front ends |

To add another Google country domain, add one line to `matches` in `manifest.json`.

Two match-pattern traps, both of which cost a load failure with only
"Invalid match pattern" to go on:

- A wildcard may only be the **leftmost label**. `www.google.*` is invalid, so each
  country domain needs its own entry.
- `web_accessible_resources` patterns are **host-level**: the path must be exactly
  `/*`. Reusing a content-script pattern like `*://*.google.com/search*` there
  rejects the whole manifest.

`node test/check-manifest.js` checks both, plus that every file the manifest names
actually exists.

## The default list: `blocklist.txt`

Rules can come from two places. The button and the popup write to browser storage.
`blocklist.txt`, in this folder, is the other one — a plain file, edited in a text
editor.

```
# comment out a line to switch it off
example.com
限時特價
keyword: e.g.
domain: example.com
```

One entry per line, in any order — the top of the file is as good as the bottom.
Blank lines and `#` lines are ignored.

Nothing has to be declared as a domain or a keyword: **anything that is a valid
hostname is treated as a domain, everything else as a keyword.** `example.com` is a
domain; `限時特價` and `3.5 折` are keywords. The guess only goes wrong on an English
keyword that happens to look like a host (`e.g.`), and the `keyword:` / `domain:`
prefixes exist for exactly that line.

Domains behave like any other rule, subdomains included. Keywords are matched
case-insensitively against the result's own text, so they catch results whose host is
fine but whose content is not.

The file is read once per page. **Editing it takes effect after reloading the
extension** at `chrome://extensions` — it is a file, not a live settings panel. The
popup shows what the file currently contributes, read-only.

Lines the parser cannot make sense of are reported in the popup and logged to the
console, never silently dropped.

The copy published on the public site is a **blank template** — every example in it is
commented out. A working list is personal (it says what someone refuses to look at),
so it lives in the private source copy only. `blocklist.txt` and `snippets.txt` are
therefore the files that legitimately differ between the two copies, along with
`blocklist-feeds.conf`, which the public copy does not carry at all. Everything else
stays byte-identical.

## The tag strip: `snippets.txt`

The other half of the same idea. A blocklist is the things you keep *not* wanting to
see; a snippet is the thing you keep typing. `edu`, `site:edu.tw`, `filetype:pdf` —
the two or three fragments that go into the box over and over.

They appear as a row of tags above the results:

| Gesture | What it does |
|---|---|
| Left click | Appends the text to whatever is in the search box; the tag shows as on |
| Left click again | Takes it back out |
| Shift + left click | Puts it in and submits the search |
| Ctrl (⌘) + left click | Puts it in as `"a phrase"` — an exact match |
| Ctrl (⌘) + Shift + left click | Puts the phrase in **and** searches the whole box in a background tab |
| Right click | Copies the text to the clipboard and leaves the box alone |

**A tag is one switch.** Whichever gesture put the term in, clicking again takes it
out, quoted or not — otherwise a plain click on a quoted term would leave you with
`"edu" edu` and a tag that cannot say whether it is on. The one exception is
Ctrl-Shift, which only ever adds: deleting a term and then searching for it would be
nonsense.

Removing is by **whole token**, which is the point of the whole exercise: clicking
`edu` off must not carve a hole out of `education` or `site:edu.tw`, and it does not.

### The `""` tag

The first tag in the row is not a snippet and does not come from the file. It works
on the text **already in the box**: select some of it and click, and those words are
quoted; click again and the quotes come off the same words.

| Gesture | What it does |
|---|---|
| Left click | Quotes the selection — or the whole query, if nothing is selected |
| Left click again | Takes those quotes off |
| Shift + left click | Quotes it and submits the search |
| Ctrl (⌘) + Shift + left click | Quotes it and searches in a background tab |
| Right click | Copies the selection with quotes round it, and leaves the box alone |

Ctrl on its own does nothing extra here: quoting is already the whole job.

Three details it would not work without:

- **Pressing the tag refuses the default mousedown**, so the box keeps focus and
  keeps the selection. A button that takes focus takes the selection with it, and
  there would be nothing left to quote.
- **The changed words stay selected afterwards**, which is what makes the second
  click undo the first. Setting `.value` collapses the selection to the end, so it
  is put back explicitly.
- **Selecting the words inside `"…"` undoes just as well as selecting the phrase
  with its quotes.** Both are the same gesture as far as anyone is concerned, and
  without that second case a second click gives you `""def""`.

A selection dragged with the mouse usually takes a trailing space with it; that space
is left outside the quotes. The last selection seen is remembered as a fallback, in
case a page throws the selection away when focus moves — but putting the caret down
somewhere clears that memory, because that is a decision and not an accident.

Two things worth knowing about the modifiers:

- **On a Mac, Ctrl-click is the right click.** It raises the context menu, and a
  click event may follow it. So on macOS the quoting modifier is ⌘ and Ctrl is left
  alone; a click arriving within half a second of a context menu is ignored, so one
  gesture never does two things.
- **Right-clicking a tag gives you no browser menu.** That is the cost of using the
  right button for copy, and it applies to the tag itself only — the rest of the page
  is untouched.

Tags come from the same two places rules do. `snippets.txt`, in this folder, is the
hand-edited one:

```
# comment out a line to switch it off
edu
site:edu.tw
教育部 = site:edu.tw
```

One per line. **Order is kept exactly as written** — unlike `blocklist.txt`, which is
sorted, because here the order is the order of the tags on screen and that is the
whole point of putting them in a file.

An `=` splits the label from the text: what is on the left is what the tag says, what
is on the right is what goes into the box. Only the **first** `=` splits, so a snippet
that needs a literal one has to be given a label (`等式 = a=b`). Without an `=`, the
line is both.

Like `blocklist.txt` it is read once per page, so editing it takes effect after
reloading the extension. The popup lists what the file contributes, read-only, and
has its own field for adding tags that live in storage instead. Those land after the
file's, so the curated row keeps its order.

`snippets.txt` is personal in the same way a blocklist is — it says what you spend
your day looking for. If this is ever published, it ships as a template, exactly as
`blocklist.txt` does.

The strip has its own **顯示** switch in the popup, so the tags can be turned off
without turning off the hiding.

### Rows, and what the colours mean

Tags are sorted into rows by the operator they start with — nothing has to be
declared, for the same reason `blocklist.txt` does not make you declare domains.
The row order is fixed and does not follow the file:

| Row | Kind | Colour |
|---|---|---|
| 1 | keywords — anything with no operator, `""` at the head | the neutral outline |
| 2 | `site:` | `rgba(27, 191, 255, 0.8)` |
| 3 | `filetype:` | `rgba(255, 80, 59, 0.8)` |
| 4 | `after:` / `before:` / `daterange:` | `rgba(255, 127, 0, 1)` |

Within a row the file's order is kept and the tags simply run on; the break
between rows is the only thing that carries meaning. A kind with nothing in it
gets no row at all.

Keywords deliberately keep the outline they always had. Colouring everything
colours nothing, and keywords are the common case.

**Date ranges** are just query text, so they are tags like any other:

```
近一年 = after:2025-09-03
2025 年 = after:2025-01-01 before:2026-01-01
```

Google takes `YYYY-MM-DD` (also `YYYY/MM/DD`, and a bare year), and the two
operators together make a range. The dates are fixed, though — a tag cannot mean
"the last twelve months" and roll forward on its own. For a relative window,
Google's own 工具 → 不限時間 is the honest answer: it is a URL parameter
(`tbs=qdr:y`), not something that can be typed into the box.

### Where the strip sits

Four slots, tried in order. Every one of them is found by id or by climbing from
the search box — not one class name, because those are regenerated constantly
and a strip anchored to one disappears without a word.

1. **Inside `#rhs`**, as its first child, when a knowledge panel is there. The
   panel is pushed down, not covered.
2. **The empty right-hand column**, as a grid item of `#rcnt` at
   `grid-column: span 7 / -2` — the placement `#rhs` itself uses, counted from
   the end of the grid so it survives a change in the number of tracks. An inner
   wrapper is `position: sticky; top: 96px`, so the tags follow you down the page.
3. **The gap in the header row**, as the search form's next sibling, when there
   is at least 200px of it.
4. **Above the results**, where it started.

Two measurements decide the details, and both were taken off a live page rather
than guessed:

- **Google's own header goes `position: fixed` once you scroll** — 71px tall,
  `z-index: 999`. A sticky strip at `top: 12px` is laid out perfectly and shown
  to nobody. Hence 96.
- **The suggestion list is far wider than the search box.** Measured: an 888px
  list under a 659px box, reaching 181px further right, into the right-hand
  column. "Beside the search box" is not the same as "clear of the suggestions",
  and the first 113px of the strip was being covered the moment the box took
  focus — which is exactly when you want to click another tag.

So in the two column slots the rows are right-aligned and the strip's left
padding is set to the measured width of that band, taken from the search *form*
(wider than the box, and a structural element we already hold). Tags wrap earlier
rather than straying underneath. Measured after the fix: leftmost tag at 1119,
list ends at 1071.

### The background tab, and the one file it needed

A content script cannot open a tab: `chrome.tabs` is not exposed to it, and
`window.open` opens a tab in front of you, which is not what a background search
means. So `src/background.js` exists — a service worker that takes one message and
makes one call, `chrome.tabs.create({ url, active: false })`.

It adds **no permission**. `tabs` gates reading a tab's URL and title, not creating
one, so the manifest still asks for `storage` and nothing else. The worker holds no
state, listens to nothing else, and is started by the browser only when a message
arrives — which happens when you Ctrl-Shift-click a tag, and at no other time.

The URL it opens is built from the page you are on, not from a hard-coded search
address, so the country domain and any settings riding in the URL (`udm`, `hl`,
`safe`) come with it. Parameters that describe *this* result page — `start`, `ei`,
`ved` and friends — are dropped, or the new tab arrives on page 3 of something.

## The 啟用 checkbox

It is the on/off line for the whole feature, not just for the hiding. Untick it
and the extension removes everything it put on the page — hidden results come
back, the per-result buttons disappear, the status bar and the tag strip go. Tick
it again and it all returns.

## Where the button goes, and why there

A Google result puts its own "about this result" kebab in a fixed 28px column,
inside a flex row that also holds the citation line. The button is inserted as the
flex sibling immediately **after** that column, which puts it to the kebab’s right
with room to spare and nothing underneath it.

Two details that are easy to get wrong:

- The kebab is found by its **SVG path data**, not by class and not by
  `aria-label`. Classes churn, and the label is translated into whatever language
  the interface is in.
- That flex row is **zero-height** — the kebab column overflows it — so the button
  aligns to `flex-start`. Centring it in a zero-height row throws it 9px upward,
  which is exactly the bug this replaced.

Bing and DuckDuckGo get no inline button: neither has an equivalent anchor that has
been verified on a live page, and guessing at their DOM is how you end up covering
something. Rules still apply on those engines; add them from the popup.

## How a rule matches

A rule is written the way you would say it out loud: `example.com`.

- It matches that host **and every subdomain**: `www.example.com`, `cdn.eu.example.com`.
- It does **not** match `notexample.com` — the dot boundary is what stops it.
- It does **not** match `example.co`, which is a different site altogether.
- `www.` is ignored on both sides, so you can paste a full URL and it still works.

Adding a broader rule absorbs the narrower ones: add `example.com` while
`cdn.example.com` is listed and you are left with just `example.com`.

## How results are found

Class names on search pages churn constantly — Google's result blocks were
`div.MjjYud` the week this was written, and that is not a promise. So results are
found **structurally** instead: on every supported engine one result is a direct
child of the results container (`#rso` on Google, `#b_results` on Bing,
`ol.react-results--main` on DuckDuckGo). The extension takes each link, walks up
until it reaches a child of that container, and hides that block. The container
ids move far less often than the class names.

Outbound links wrapped in a redirector are unwrapped first, so the rule is tested
against where the link actually goes:

| Engine | Wrapper | Unwrapped from |
|---|---|---|
| DuckDuckGo | `duckduckgo.com/l/?uddg=…` | the `uddg` parameter |
| Google | `google.com/url?q=…` | the `q` parameter |
| Bing | `bing.com/ck/a?…&u=a1<base64url>` | the `u` parameter, after base64url decode |

Hidden results are collapsed with `display:none`, never removed from the DOM, so
the page's own layout and scripts are undisturbed and revealing them again is one
attribute flip.

## Privacy

`storage` is the only permission. No network request of any kind, no analytics, no
account.

There is one service worker, `src/background.js`, and it does exactly one thing:
open a background tab when you Ctrl-Shift-click a tag. It runs only when that
message arrives, keeps nothing, and sees nothing else.

The hiding half never reads your query at all — it only looks at the hosts of the
links on the page. The tag strip does read the contents of the search box, because
that is the only way to know whether a tag is currently switched on and to put text
in or take it back out. It reads it in the page, in your browser, and does nothing
else with it: the query is never stored, never logged and never sent anywhere. If
that is one liberty too many, untick **顯示** and the strip is gone.

Your rule and tag lists live in `chrome.storage.sync`, which means Chrome syncs them
across your own signed-in browsers and nothing else sees them.

## Files

| Path | What it is |
|---|---|
| `manifest.json` | MV3 manifest |
| `blocklist.txt` | The hand-edited default list: domains and keywords, one per line |
| `snippets.txt` | The hand-edited tag strip: one snippet per line, in display order |
| `src/matcher.js` | All the matching logic. Pure functions, no DOM, no `chrome.*` |
| `src/snippets.js` | Snippet parsing and the whole-token add/remove. Pure functions too |
| `src/content.js` | Engine adapters, the DOM sweep, the status bar |
| `src/tags.js` | The tag strip: where it mounts, and how text gets into the box |
| `src/background.js` | One service worker call: open a search in a background tab |
| `src/styles.css` | The only CSS injected into the page |
| `popup/` | The rule list and tag list UI |
| `test/run-tests.js` | 161 assertions over `matcher.js` and `snippets.js` |
| `test/run-tags-dom.js` | 60 assertions over the tag strip’s wiring, against a stub DOM |
| `test/check-manifest.js` | Manifest lint: match patterns and file references |

`content.js` and `tags.js` are separate on purpose. The hiding logic has been through
four rounds of fixes against live pages; a strip of buttons has no business being
tangled up in it. They share the matcher, the stylesheet and the page, and nothing
else — `tags.js` mounts its strip above the status bar when there is one, and the
whole feature can be deleted by removing one line from the manifest.

## Tests

```
node test/run-tests.js      # 161 assertions over matcher.js and snippets.js
node test/check-manifest.js # match patterns and file references
node test/run-tags-dom.js   # 60 assertions: the tag strip mounts and clicks through
```

No dependencies, no network, no browser.

`run-tags-dom.js` runs `tags.js` against a DOM stubbed in the test file itself. That
cannot say anything about Google's real markup — whether `#rso` is there, whether the
strip looks right, whether the box selector picks the right element on a live page.
What it does say is that the script mounts, that a click reaches the box, that a
second click takes the term out, that Shift submits, that Ctrl copies, and that both
switches take the strip down. Twice in this project's short history the code has been
correct and simply never run; this is the cheap half of that lesson.

**The tag strip has not yet been seen on a live results page.** The box selectors for
all three engines, the mount point, and the React path on DuckDuckGo are unverified.
