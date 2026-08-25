# unsee — changelog

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
