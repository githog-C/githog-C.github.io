# fukubiki

A revolving lottery machine in one HTML file. Load a list of names, turn the
drum, and it drops gold balls for winners and silver balls for reserves.

Live page: <https://githog-c.github.io/fukubiki/index.html>

## How to use

1. Load the list: choose a text or csv file, or open the paste box and paste
   one person per line.
2. Set how many winners and reserves to draw.
3. Press the green button or the drum handle to draw one ball at a time.
4. Copy the results into a spreadsheet, or download them as csv.

| Button | What it does |
|---|---|
| Auto | Draws one ball after another until every place is filled. Press again to stop. |
| Instant | Fills every remaining place at once without turning the drum. |
| Extra reserve | Once all places are filled, draws one more reserve. |
| Reset | Clears the list and the results. Press twice. |

## Prize mode

Click the left leaf on the drum to switch. Instead of winners and reserves,
the drum holds six prizes: gold, silver, red, blue, green and white. Set how
many balls each prize gets, and every draw picks one at random from what is
still in the drum, so the top prize does not come first.

A list is optional here. With a list, each ball goes to one person. Without
one, only balls are drawn, for people taking turns at the drum. Click the leaf
again to go back; once a draw has started, press Reset first.

For a csv with several columns, the column headed `name` is used; without a
header row, the first column is used.

## What to know

- Draws use `crypto.getRandomValues` with rejection sampling, without
  replacement, so no line is drawn twice.
- The list never leaves the page. Nothing is uploaded, nothing is stored, and
  it is gone when the page closes. The page ships with a Content Security
  Policy of `default-src 'none'` and makes no network requests.
- "Mask names" only affects the screen. Copied and downloaded results always
  carry full names.
- The download is named `fukubiki_pon_YYYYMMDD_<fingerprint>.csv`. The
  fingerprint is the first 12 hex digits of a SHA-256 over the list, so the
  same list always gives the same fingerprint.
- Keep the tab in front while drawing. Browsers pause animation in background
  tabs.
- Language (Chinese / English) and theme (dark / light) are remembered in
  `localStorage`. Nothing else is.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole tool: markup, styles and script, no dependencies |
