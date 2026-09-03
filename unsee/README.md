# unsee — hide sites from your search results

Some sites you just do not want in your results. Not because they should be
removed from the web — because *you* are done looking at them.

unsee hides chosen sites from **your own** Google, Bing and DuckDuckGo results.
It runs entirely in your browser. Nothing is reported to anyone, nothing is
requested from anyone, and the site being hidden is not affected in any way.

It also keeps the search terms you type every day — `edu`, `site:edu.tw`,
`filetype:pdf` — as a row of tags above the results. One click puts a term in the
box; a second click takes it out again. Same idea from the other side: the results
page should stop making you retype the things you always type.

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
out which is which from the line itself, so `example.com` is a domain and `限時特價`
is a keyword without either being declared. Keywords match the result text, not the
host. Editing the file takes effect after reloading the extension; the popup shows
what it currently contributes, read-only.

It ships with every example commented out, so it blocks nothing until you say so.

The copy published here is a blank template. A working list is personal, so it is kept
in the private source copy only. The same goes for `snippets.txt`: those two files, and
the feed-source note `blocklist-feeds.conf` that the public copy does not carry, are the
only differences between the two copies.

## The tag strip

`Chrome/snippets.txt` is the same arrangement for the terms you keep typing:

```
edu
site:edu.tw
教育部 = site:edu.tw
```

One per line, in the order you want the tags to appear. An `=` lets the tag say one
thing and type another.

| Gesture | What it does |
|---|---|
| Left click | Puts the text in the search box |
| Left click again | Takes it out |
| Shift + left click | Puts it in and searches |
| Ctrl (⌘) + left click | Puts it in as `"a phrase"` |
| Ctrl (⌘) + Shift + left click | Puts the phrase in and searches in a background tab |
| Right click | Copies it to the clipboard |

The first tag in the row is `""`, which is not a snippet: it quotes what is
**already** in the box. Select some of the query and click, and those words become a
phrase; click again and the quotes come off. With nothing selected it quotes the
whole query. Shift searches with it, Ctrl (⌘) + Shift searches in a background tab,
and right click copies the quoted words without touching the box.

A tag is one switch: whichever gesture put the term in, clicking again takes it out.
Removing is by whole word, so clicking `edu` off never cuts a hole in `education` or
`site:edu.tw`. Tags can also be added in the popup, and the strip has its own
**顯示** switch.

On a Mac, Ctrl-click is the right click, so ⌘ is the quoting modifier there and
Ctrl copies. Right-clicking a tag replaces the browser menu on that tag — nowhere
else on the page.

Tags sort themselves into rows by the operator they start with — keywords, then
`site:`, then `filetype:`, then the date operators — each row a different colour,
so a kind of tag can be found by where it sits rather than by reading every label.

The strip sits in the results page's right-hand column, out of the way of the
suggestion list, which is far wider than the search box and covers everything
directly beneath it. When a knowledge panel is using that column, the tags go
above it and push it down.

## How a rule matches

Write the domain the way you would say it: `example.com`.

It covers that host and everything under it (`www.example.com`,
`cdn.eu.example.com`) and nothing that merely ends with the same letters
(`notexample.com` stays). Near-miss domains are a real hazard — `example.com` and
`example.co` are two different sites, and so are plenty of pairs that differ by a
single letter. Blocking one never touches the other; the matcher does not guess.

Full behaviour, engine coverage and the redirect-unwrapping table are in
[`Chrome/README.md`](./Chrome/README.md).

## Privacy

One permission: `storage`. No network calls, no analytics, no account. There is one
service worker whose entire job is to open a background tab when you Ctrl-Shift-click
a tag; it runs when that happens and not otherwise.

The hiding half never sees your search query — it reads the hosts of the links
already on the page and nothing else. The tag strip does read the search box, since
that is the only way to put a term in, take it out, and show which tags are on. It
is read in the page and used there; nothing is stored and nothing leaves the
browser. Untick **顯示** if you would rather it did not.

The rule and tag lists stay in your browser's own extension storage.

## Tests

```
cd Chrome && node test/run-tests.js && node test/run-tags-dom.js
```

161 assertions — normalisation, the subdomain boundary, redirect unwrapping for all
three engines, rule-list housekeeping, the blocklist file parser and keyword
matching, and for the tags: the file parser, the label split, the whole-token add
and remove, the quoted form, the background-tab URL, quoting a selection, and the
row grouping. 60 more run the tag strip itself against a stub DOM. No dependencies.

The DOM strategy was verified separately against live result pages: on a mixed
Google result page with two rules active, 1 of 11 result blocks was hidden and
the other 10 hosts were untouched.
