# qrcode

Three small tools in one HTML file: make a QR code from a link, read the QR
codes in a picture, and convert text to and from Base64. A switch at the top
right swaps between them; on a desktop screen the page is one fixed frame and
never scrolls.

Live page: <https://githog-c.github.io/qrcode/index.html>

## How to use

| View | What it does |
|---|---|
| 產生 (Make) | Type a link and the code appears as you type. Pick the error correction level, square or dot modules, colours, and an optional image or short text in the centre. Export as SVG, PNG, JPG or WebP. |
| 解碼 (Read) | Paste a picture with Ctrl+V, drop it on the page, or choose a file. Every QR code in the picture is listed, top to bottom, with a copy button; links are shown but never opened for you. |
| Base64 | Text on the left, Base64 on the right. Handles UTF-8, the URL-safe alphabet and missing padding. Bytes that are not valid UTF-8 are shown as hex instead of garbled text. |

The view is kept in the address: `index.html#gen`, `#decode` or `#b64` opens
that view directly. Pasting a picture on any view jumps to the reader.

Small or blurry codes are retried at 2x, 3x and 4x. "徹底搜尋" (thorough
search) also sweeps the whole picture region by region and tries inverted
codes; it is much slower.

## Command line

`qrcode-cli.mjs` runs the same decoder from a terminal. It carries no decoding
code of its own: it reads the script blocks out of `index.html` and runs them
in a `node:vm` sandbox, so the page and the command line cannot drift apart.

```
node qrcode-cli.mjs decode <image> [--json] [--max-scale 1-4] [--thorough]
node qrcode-cli.mjs b64enc [text] [--url] [--no-pad]
node qrcode-cli.mjs b64dec [base64] [--hex] [--json]
node qrcode-cli.mjs verify | selftest | help
```

Exit codes: 0 success; 1 nothing decoded or a self-test failed; 2 usage or
read error; 3 the Base64 decoded to bytes that are not UTF-8.

Needs Node.js 18 or later, nothing to install. Non-interlaced PNG is read
directly; other formats (JPG, WebP, interlaced PNG) are handed to Python with
Pillow if the machine already has it, otherwise save the picture as PNG first.

In Git Bash, a Base64 string starting with `/` is rewritten as a path before
the tool sees it. Pipe it through standard input, or set `MSYS_NO_PATHCONV=1`.

## What to know

- Nothing leaves the page. Pictures, links and text are handled in the browser
  only. The page ships with a Content Security Policy of `default-src 'none'`
  and makes no network requests.
- Nothing is stored. The page does not use `localStorage` or cookies.
- Decoded content is untrusted. It is written to the page as plain text, and
  only `http:` and `https:` addresses become links.
- Codes smaller than about 40 pixels across, or badly blurred, may not decode.

## Third-party code

The files in this folder are under the repository's MIT licence, except for
two libraries embedded in `index.html`, which keep their own licences:

| Library | Version | Licence | Use |
|---|---|---|---|
| QR Code Generator for JavaScript (`qrcode-generator`), Kazuhiko Arase | 2.0.4 | MIT (notice kept at the top of the script block) | Making codes |
| jsQR, Cosmo Wolfe and contributors | 1.4.0 | Apache-2.0 (`LICENSE-jsQR.txt`, also embedded in the page) | Reading codes |

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

### Checks on the embedded libraries (2026-10-14)

| Item | Result |
|---|---|
| Why | jsQR: browsers on Windows have no built-in QR reader. qrcode-generator: makes the codes. |
| Source | jsQR: npm package `jsqr`, file `dist/jsQR.js`, embedded unmodified; <https://github.com/cozmo/jsQR>. qrcode-generator: npm package `qrcode-generator`, file `dist/qrcode.js`; <https://github.com/kazuhikoarase/qrcode-generator>. |
| Integrity | qrcode-generator: the embedded block matches `dist/qrcode.js` of 2.0.4 apart from whitespace. jsQR, SHA-256 of `dist/jsQR.js`: `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`. Matches the registry tarball and the same file at the `1.4.0` commit in the repository. `node qrcode-cli.mjs verify` rechecks the embedded copy. The npm package signature was not verified. |
| Known issues | No advisories for either version in the GitHub Advisory Database or OSV on the date above. |
| Maintenance | jsQR: last commit to the main branch 2021-08-24, effectively unmaintained. qrcode-generator: 2.0.4 released 2025-08-07. |
| Dependencies | None at run time for either library. |
| Isolation | jsQR receives pixels and returns results: no `eval`, no network calls, does not touch the document. Both run under the page's `default-src 'none'` policy. |
| Removal | jsQR: delete the `qrtool-jsqr` and `qrtool-jsqr-license` blocks, replace the one `jsQR(...)` call in `qrtool-core`, drop the two constants at the top of `qrcode-cli.mjs`, and delete `LICENSE-jsQR.txt`. |

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole tool: markup, styles, scripts and both libraries |
| `qrcode-cli.mjs` | Command line entry that runs the decoder embedded in `index.html` |
| `LICENSE-jsQR.txt` | Apache-2.0 licence text for jsQR |
