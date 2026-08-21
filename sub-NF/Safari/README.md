# sub-NF — Safari

The same bilingual-subtitle engine as the Chrome build, packaged as a **Safari
Web Extension** for macOS. The web-extension resources under `extension/` are
byte-identical to `../Chrome/` — only the packaging differs, because Safari
extensions must ship inside a signed app built by Xcode rather than loaded as a
raw folder.

- `extension/` — the web extension (manifest, content/page scripts, popup,
  icons). This is what actually runs in Safari.
- `BUILD.md` — how to turn `extension/` into a runnable Safari app with Apple's
  `safari-web-extension-converter`.

## Quick version

```sh
xcrun safari-web-extension-converter ./extension \
  --app-name "sub-NF" \
  --bundle-identifier com.example.subnf \
  --macos-only \
  --project-location ./build \
  --no-open
```

Open the generated Xcode project, set your signing team, run the app once, then
enable **sub-NF** in Safari → Settings → Extensions and allow it on
`netflix.com`. Full walkthrough — including the "Allow Unsigned Extensions"
step for local development — is in `BUILD.md`.

## Requirements

- macOS with Xcode 15+.
- Safari 16.4+ (the extension uses a Manifest V3 service worker; 16.4 is the
  first Safari that supports one).

## How it works

Identical to the Chrome build — see `../Chrome/README.md`. The page-world hook,
the WebVTT parser, the overlay, and the popup are the same files. Safari honours
the `chrome.*`/`browser.*` shim, `host_permissions` for the caption CDN, and
`web_accessible_resources`, so nothing platform-specific was needed in the code.

## The same code drives the iOS build

`../iOS/` is this exact extension packaged for iPhone/iPad Safari (the converter
can emit an iOS target too). See `../iOS/README.md`.

## Keeping the copies in sync

`extension/` is a copy of `../Chrome/` (minus the `test/` folder). If you change
one, re-copy so the platforms do not drift:

```sh
# from sub-NF/
rm -rf Safari/extension/{src,popup,icons,manifest.json}
cp Chrome/manifest.json Safari/extension/
cp -r Chrome/{src,popup,icons} Safari/extension/
```

MIT, per the LICENSE at the repository root.
