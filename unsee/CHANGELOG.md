# unsee — changelog

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
  `notthreads.com` is not caught by `threads.com`.
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
