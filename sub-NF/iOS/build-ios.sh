#!/usr/bin/env bash
# Wrap Apple's safari-web-extension-converter to produce an iOS Xcode project
# from ./extension. Must be run on macOS with Xcode installed.
#
# Usage:
#   ./build-ios.sh [bundle-identifier] [app-name]
#
# Example:
#   ./build-ios.sh com.june.subnf "sub-NF"
set -euo pipefail

BUNDLE_ID="${1:-com.example.subnf}"
APP_NAME="${2:-sub-NF}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$HERE/extension"
OUT_DIR="$HERE/build"

if ! command -v xcrun >/dev/null 2>&1; then
  echo "error: xcrun not found. This must run on macOS with Xcode installed." >&2
  exit 1
fi
if [ ! -f "$EXT_DIR/manifest.json" ]; then
  echo "error: $EXT_DIR/manifest.json not found." >&2
  exit 1
fi

echo "Converting $EXT_DIR -> $OUT_DIR (iOS, bundle id: $BUNDLE_ID)"
xcrun safari-web-extension-converter "$EXT_DIR" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --ios-only \
  --project-location "$OUT_DIR" \
  --no-open

echo
echo "Done. Next:"
echo "  1. open \"$OUT_DIR/$APP_NAME/$APP_NAME.xcodeproj\""
echo "  2. Select the iOS target, set your signing Team, pick a device/Simulator, Run."
echo "  3. On the device: Settings > Apps > Safari > Extensions > $APP_NAME > On,"
echo "     and set netflix.com to Allow."
echo "  4. Open netflix.com in Safari, play a title, tap the extension to choose languages."
echo
echo "Optional: copy host-app/ContentView.swift over the generated app's view for"
echo "a friendlier enable-me screen."
