# Building unsee for Safari

macOS with Xcode required. Takes a few minutes.

## 1. Convert

```sh
xcrun safari-web-extension-converter ./extension \
  --project-location ./build \
  --app-name unsee \
  --bundle-identifier io.github.githog-c.unsee \
  --no-open --force
```

## 2. Fix the bundle identifiers before building

**This is the step that decides whether the build works.** The converter names the
two targets inconsistently: the host app gets the identifier you passed, while the
extension target gets a *different* prefix. Xcode's `ValidateEmbeddedBinary` phase
then refuses the build, because an embedded extension's identifier must begin with
its host app's identifier followed by a dot.

sub-NF hit exactly this: host app `…sub-NF`, extension `…subnf.Extension` — no
shared prefix, build fails. The fix is to force both onto one prefix in the
generated project file:

```sh
sed -i '' 's/io\.github\.githog-c\.unsee\.Extension/io.github.githog-c.unsee.extension/g' \
  build/unsee/unsee.xcodeproj/project.pbxproj
```

Then confirm the two identifiers actually nest:

```sh
grep PRODUCT_BUNDLE_IDENTIFIER build/unsee/unsee.xcodeproj/project.pbxproj | sort -u
```

You want to see the host app as `io.github.githog-c.unsee` and the extension as
`io.github.githog-c.unsee.<something>`. Anything else will fail validation.

## 3. Build

```sh
xcodebuild -project build/unsee/unsee.xcodeproj \
  -scheme unsee -configuration Release \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO \
  build
```

`CODE_SIGN_IDENTITY=-` is an ad-hoc signature: fine for running it yourself,
not enough to distribute. Copy the built `unsee.app` into `/Applications` and
launch it once so the system registers the extension:

```sh
pluginkit -m | grep unsee
```

## 4. Enable it in Safari

Ad-hoc signing means Safari treats it as unsigned, so:

1. Safari → 設定 → 進階 → 勾「顯示網頁開發者功能」
2. 開發 → **允許未簽署的延伸功能** — this resets **every time Safari restarts**
3. Safari → 設定 → 延伸功能 → tick **unsee**
4. Give it permission on the search engines you use — `google.com` at minimum.
   "允許一天" will keep asking; "永遠允許此網站" is the one you want.

## Notes

- `build/` is generated. Keep it out of git.
- The converter may warn about manifest keys it does not recognise. The manifest
  here uses only `manifest_version`, `name`, `version`, `description`, `icons`,
  `permissions`, `content_scripts` and `action` — all supported by Safari 16+.
- Re-run the conversion from scratch after changing anything in `extension/`;
  editing the generated project by hand does not survive the next conversion.
