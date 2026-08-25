# unsee — changelog

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
