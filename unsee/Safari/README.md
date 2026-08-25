# unsee — Safari (macOS)

Same extension as [`../Chrome/`](../Chrome/) — the files in `extension/` are
**byte-identical** to the Chrome folder (minus its README and tests). Only the
packaging differs: Safari will not load a plain folder, so the extension has to be
wrapped in an app bundle and signed.

Build steps, and the bundle-identifier trap that will otherwise stop you, are in
[`BUILD.md`](./BUILD.md).

## Status — read this before you start

**Not yet built or run.** The extension source is complete and its matching logic
passes the same 42 tests as the Chrome version, but the Xcode conversion and build
have not been performed for this project: they need macOS with Xcode, and this was
authored on a Windows machine.

The procedure in `BUILD.md` is not guesswork — it is the procedure that worked for
the sibling project sub-NF on the same account, including the fix for the failure
it hits on the way. Expect it to work; do not assume it worked until you have run it.

## What Safari changes about the behaviour

Nothing in the logic. Two things about the environment:

- **Permissions are per-site and explicit.** Safari will ask before letting the
  extension read `google.com` and friends. It has to be allowed there or nothing
  is hidden.
- **`chrome.storage.sync` maps to Safari's own extension storage**, which syncs
  through iCloud rather than a Chrome profile. The rule list therefore does not
  travel between Chrome and Safari — each browser keeps its own list.
