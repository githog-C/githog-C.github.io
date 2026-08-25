# unsee — Chrome

Hide chosen sites from your own search results.

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
Match patterns may not put a wildcard mid-host, so `www.google.*` is not valid —
each domain needs its own entry.

## The default list: `blocklist.txt`

Rules can come from two places. The button and the popup write to browser storage.
`blocklist.txt`, in this folder, is the other one — a plain file, edited in a text
editor.

```
# comment out a line to switch it off
threads.com
限時特價
keyword: e.g.
domain: example.com
```

One entry per line, in any order — the top of the file is as good as the bottom.
Blank lines and `#` lines are ignored.

Nothing has to be declared as a domain or a keyword: **anything that is a valid
hostname is treated as a domain, everything else as a keyword.** `threads.com` is a
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

## The 啟用 checkbox

It is the on/off line for the whole feature, not just for the hiding. Untick it
and the extension removes everything it put on the page — hidden results come
back, the per-result buttons disappear, the status bar goes. Tick it again and it
all returns.

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

A rule is written the way you would say it out loud: `threads.com`.

- It matches that host **and every subdomain**: `www.threads.com`, `cdn.eu.threads.com`.
- It does **not** match `notthreads.com` — the dot boundary is what stops it.
- It does **not** match `thread.com`, which is a different site altogether.
- `www.` is ignored on both sides, so you can paste a full URL and it still works.

Adding a broader rule absorbs the narrower ones: add `threads.com` while
`cdn.threads.com` is listed and you are left with just `threads.com`.

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

`storage` is the only permission. There is no background page, no network request
of any kind, no analytics, and no account. The extension never reads your query —
it only looks at the hosts of the links on the page. Your rule list lives in
`chrome.storage.sync`, which means Chrome syncs it across your own signed-in
browsers and nothing else sees it.

## Files

| Path | What it is |
|---|---|
| `manifest.json` | MV3 manifest |
| `blocklist.txt` | The hand-edited default list: domains and keywords, one per line |
| `src/matcher.js` | All the matching logic. Pure functions, no DOM, no `chrome.*` |
| `src/content.js` | Engine adapters, the DOM sweep, the status bar |
| `src/styles.css` | The only CSS injected into the page |
| `popup/` | The rule list UI |
| `test/run-tests.js` | 60 assertions over `matcher.js` |

## Tests

```
node test/run-tests.js
```

No dependencies, no network, no browser. The DOM strategy was separately checked
against live result pages; the matching rules are what these tests cover.
