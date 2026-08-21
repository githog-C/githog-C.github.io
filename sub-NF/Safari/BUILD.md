# Building the Safari app (macOS)

Safari will not load a raw extension folder the way Chrome does. Apple ships a
converter that wraps a web extension in a small host app and an Xcode project;
you build that once and enable the extension in Safari.

## 0. Prerequisites

- macOS with **Xcode 15+** installed (`xcode-select --install` is not enough;
  you need the full Xcode from the App Store for the converter and code
  signing).
- **Safari 16.4 or newer.**

## 1. Convert the extension to an Xcode project

From this `Safari/` folder:

```sh
xcrun safari-web-extension-converter ./extension \
  --app-name "sub-NF" \
  --bundle-identifier com.example.subnf \
  --macos-only \
  --project-location ./build \
  --no-open
```

- `--bundle-identifier` — change `com.example.subnf` to something in your own
  reverse-DNS space.
- Drop `--macos-only` to also generate an iOS target (that is what `../iOS/`
  documents).
- The converter reads `manifest.json` and copies every resource; it may print
  notes about MV3 features — none of ours require changes.

Output lands in `./build/sub-NF/sub-NF.xcodeproj`.

## 2. Build and run

1. `open ./build/sub-NF/sub-NF.xcodeproj`.
2. Select the **sub-NF (macOS)** app target.
3. **Signing & Capabilities** → pick your Team. A free personal Apple ID is
   fine for running it locally.
4. Press **Run** (⌘R). The host app launches with a one-screen "open Safari
   settings to enable me" message. You can quit it after enabling.

## 3. Enable it in Safari

1. Safari → **Settings** → **Extensions**.
2. If sub-NF is greyed out because it is unsigned, first enable
   **Develop menu**: Safari → Settings → Advanced → "Show features for web
   developers", then **Develop → Allow Unsigned Extensions**. (This resets every
   time you quit Safari; a proper signature avoids it.)
3. Tick **sub-NF**.
4. Click **Edit Websites** (or the extension's **A** button in the toolbar) and
   set `netflix.com` to **Allow**. The extension needs access to the Netflix
   page and to the caption CDN to read the subtitle tracks.

## 4. Use it

Open a title on `netflix.com`, press play, then click the sub-NF toolbar icon
to choose your two languages. Behaviour and controls are identical to the Chrome
build (`../Chrome/README.md`).

## Distribution (optional)

To share it beyond your own Mac you must sign it with a paid Apple Developer
account and either notarize the app (for direct distribution) or submit it to
the App Store. That is an Apple account/policy step, not a code change. Netflix's
name and logo are theirs — if you ever publish this, describe it plainly as an
independent tool and do not imply Netflix endorsement.

## Troubleshooting

- **Extension not listed** → build ran but you skipped "Allow Unsigned
  Extensions", or Safari is older than 16.4.
- **Listed but does nothing on Netflix** → open `netflix.com` permissions for
  the extension and set them to Allow; reload the tab; press play so the
  manifest loads.
- **Languages dropdown empty** → same as Chrome: it only fills after playback
  starts and Netflix fetches the title's manifest.
