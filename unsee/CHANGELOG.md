# unsee — changelog

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
