# unsee — Chrome

Hide chosen sites from your own search results.

## Install (unpacked)

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → choose this `Chrome/` folder
3. Search on Google. Each result grows a small **不看 <網域>** link; click it, and that
   site disappears from this and every future search.

Works the same in Edge, Brave and any other Chromium browser.

## What it covers

| Engine | Pages |
|---|---|
| Google | `google.com`, `google.com.tw`, `.co.jp`, `.co.uk` — the `/search` pages |
| Bing | `bing.com/search` |
| DuckDuckGo | `duckduckgo.com`, plus the `html.` and `lite.` front ends |

To add another Google country domain, add one line to `matches` in `manifest.json`.
Match patterns may not put a wildcard mid-host, so `www.google.*` is not valid —
each domain needs its own entry.

## How a rule matches

A rule is written the way you would say it out loud: `threads.com`.

- It matches that host **and every subdomain**: `www.threads.com`, `cdn.eu.threads.com`.
- It does **not** match `notthreads.com` — the dot boundary is what stops it.
- It does **not** match `thread.com`, which is a different site altogether.
- `www.` is ignored on both sides, so you can paste a full URL and it still works.

Adding a broader rule absorbs the narrower ones: add `threads.com` while
`cdn.threads.com` is listed and you are left with just `threads.com`.

## How results are found

Class names on search pages churn constantly — Google's result blocks were
`div.MjjYud` the week this was written, and that is not a promise. So results are
found **structurally** instead: on every supported engine one result is a direct
child of the results container (`#rso` on Google, `#b_results` on Bing,
`ol.react-results--main` on DuckDuckGo). The extension takes each link, walks up
until it reaches a child of that container, and hides that block. The container
ids move far less often than the class names.

Outbound links wrapped in a redirector are unwrapped first, so the rule is tested
against where the link actually goes:

| Engine | Wrapper | Unwrapped from |
|---|---|---|
| DuckDuckGo | `duckduckgo.com/l/?uddg=…` | the `uddg` parameter |
| Google | `google.com/url?q=…` | the `q` parameter |
| Bing | `bing.com/ck/a?…&u=a1<base64url>` | the `u` parameter, after base64url decode |

Hidden results are collapsed with `display:none`, never removed from the DOM, so
the page's own layout and scripts are undisturbed and revealing them again is one
attribute flip.

## Privacy

`storage` is the only permission. There is no background page, no network request
of any kind, no analytics, and no account. The extension never reads your query —
it only looks at the hosts of the links on the page. Your rule list lives in
`chrome.storage.sync`, which means Chrome syncs it across your own signed-in
browsers and nothing else sees it.

## Files

| Path | What it is |
|---|---|
| `manifest.json` | MV3 manifest |
| `src/matcher.js` | All the matching logic. Pure functions, no DOM, no `chrome.*` |
| `src/content.js` | Engine adapters, the DOM sweep, the status bar |
| `src/styles.css` | The only CSS injected into the page |
| `popup/` | The rule list UI |
| `test/run-tests.js` | 42 assertions over `matcher.js` |

## Tests

```
node test/run-tests.js
```

No dependencies, no network, no browser. The DOM strategy was separately checked
against live result pages; the matching rules are what these tests cover.
