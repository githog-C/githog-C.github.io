# unsee — hide sites from your search results

Some sites you just do not want in your results. Not because they should be
removed from the web — because *you* are done looking at them.

unsee hides chosen sites from **your own** Google, Bing and DuckDuckGo results.
It runs entirely in your browser. Nothing is reported to anyone, nothing is
requested from anyone, and the site being hidden is not affected in any way.

| Folder | Platform | Status |
|---|---|---|
| [`Chrome/`](./Chrome/) | Chrome / Edge / Brave / any Chromium | Load unpacked and go |
| [`Safari/`](./Safari/) | Safari on macOS | Source ready; needs one Xcode build — **not yet built** |

## The distinction that matters

There are two completely different things people mean by "get this site out of
Google", and only one of them is what this does.

|  | Asking Google to remove it | unsee |
|---|---|---|
| Who stops seeing it | everyone | only you |
| Where the decision lives | Google, after review | your browser |
| Grounds needed | personal data, law, or stale content | you would rather not see it |
| Reversible | slowly, by request | instantly, untick a box |

Google's own "移除搜尋結果" button on a result is the **first** column: it opens a
global takedown request form with three grounds — unauthorised personal data, a
legal removal, or outdated content. There is no longer any per-account blocklist
in Google Search; the old one was retired years ago. That gap is what this fills.

## Quick start

1. `chrome://extensions` → Developer mode → **Load unpacked** → pick [`Chrome/`](./Chrome/)
2. Search on Google.
3. Every result grows a small round **unsee mark**, just right of Google's own
   kebab menu. Click it. Gone — here and from then on.

The extension icon opens the list, where rules can be added by hand or removed.

## Two places rules come from

The per-result button and the popup write to browser storage — that is the quick,
one-click path.

`Chrome/blocklist.txt` is the other: a plain file you edit, one entry per line, `#`
to comment a line out. It takes **domains and keywords in the same list** and works
out which is which from the line itself, so `threads.com` is a domain and `限時特價`
is a keyword without either being declared. Keywords match the result text, not the
host. Editing the file takes effect after reloading the extension; the popup shows
what it currently contributes, read-only.

It ships with every example commented out, so it blocks nothing until you say so.

The copy published here is a blank template. A working list is personal, so it is kept
in the private source copy only — `blocklist.txt` is the one file that differs between
the two, and the only one.

## How a rule matches

Write the domain the way you would say it: `threads.com`.

It covers that host and everything under it (`www.threads.com`,
`cdn.eu.threads.com`) and nothing that merely ends with the same letters
(`notthreads.com` stays). Note that `threads.com` and `thread.com` are two
unrelated sites — the first is Meta's Threads, the second is a UK styling
service. Blocking one does not touch the other.

Full behaviour, engine coverage and the redirect-unwrapping table are in
[`Chrome/README.md`](./Chrome/README.md).

## Privacy

One permission: `storage`. No background page, no network calls, no analytics,
no account. The extension never sees your search query — it reads the hosts of
the links already on the page and nothing else. The rule list stays in your
browser's own extension storage.

## Tests

```
cd Chrome && node test/run-tests.js
```

60 assertions over the matching logic — normalisation, the subdomain boundary,
redirect unwrapping for all three engines, rule-list housekeeping, the blocklist file parser and keyword matching. No
dependencies.

The DOM strategy was verified separately against live result pages: on a mixed
Google result page with two rules active, 1 of 11 result blocks was hidden and
the other 10 hosts were untouched.
