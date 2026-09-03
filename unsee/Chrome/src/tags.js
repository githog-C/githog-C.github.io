/*
 * unsee — the tag strip.
 *
 * A row of your own snippets above the results. Clicking one puts it in the
 * search box; clicking it again takes it out. Nothing is sent anywhere and
 * nothing about the query is stored — the tags come from snippets.txt and from
 * your own list in storage, and that is all this file knows.
 *
 * It is deliberately a separate content script from content.js: the hiding
 * logic has been through four rounds of fixes against live pages, and a
 * feature that only adds a row of buttons has no business being tangled up in
 * it. The two share nothing but the page.
 */
(function () {
  'use strict';

  const M = globalThis.unseeMatcher;
  const S = globalThis.unseeSnippets;
  if (!M || !S) return;

  const STRIP_ID = 'unsee-tags';
  const CHIP_CLASS = 'unsee-tag';

  /* On a Mac, Ctrl-click *is* the right click — it raises the context menu, and
     depending on the build a click event may follow it as well. So the quoting
     modifier is ⌘ there and Ctrl is left to mean what the system says it means.
     Everywhere else Ctrl is the modifier and ⌘ is accepted alongside it, which
     costs nothing and helps anyone on an Apple keyboard plugged into a PC. */
  const IS_MAC = /Mac|iPhone|iPad|iPod/i.test(
    (navigator.userAgentData && navigator.userAgentData.platform)
    || navigator.platform
    || navigator.userAgent
    || ''
  );
  const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';
  const quoteModifier = (ev) => (IS_MAC ? ev.metaKey : (ev.ctrlKey || ev.metaKey));

  const TIP = [
    '左鍵：加進搜尋框，再點一下拿掉',
    'Shift＋左鍵：加進去並直接送出搜尋',
    MOD_LABEL + '＋左鍵：加成 "字串"（精確比對）',
    MOD_LABEL + '＋Shift＋左鍵：加成 "字串" 並在背景分頁搜尋',
    '右鍵：只複製到剪貼簿',
  ].join('\n');

  /* The one tag that is not a snippet: it works on what is in the box rather
     than putting anything new there. It is pinned first because it is the only
     one whose position means something — it acts on the query, so it belongs
     at the head of the row, not somewhere in the middle of your own tags. */
  const QUOTE_TAG = { label: '""', text: '', builtin: 'quote' };
  const QUOTE_TIP = [
    '把搜尋框裡反白的字加上引號（沒反白就整串）',
    '左鍵：加引號，再點一下拿掉',
    'Shift＋左鍵：加引號並直接送出搜尋',
    MOD_LABEL + '＋Shift＋左鍵：加引號並在背景分頁搜尋',
    '右鍵：把加了引號的字複製到剪貼簿，不動搜尋框',
  ].join('\n');

  /* Roots are the containers content.js hides results in, plus a wider
     fallback each: the strip only needs somewhere sane to sit, so it can
     afford a looser anchor than the hiding does. Boxes are listed most
     specific first — several of these pages carry more than one input named
     "q" and only one of them is on screen. */
  const ENGINES = [
    {
      id: 'google',
      test: (h) => /^(www\.)?google(\.[a-z]{2,3}){1,2}$/.test(h),
      roots: ['#rso', '#search', '#botstuff', '#center_col'],
      boxes: ['textarea[name="q"]', 'input[name="q"]'],
    },
    {
      id: 'bing',
      test: (h) => /^(www\.)?bing\.com$/.test(h),
      roots: ['#b_results', '#b_content'],
      boxes: ['#sb_form_q', 'input[name="q"]'],
    },
    {
      id: 'duckduckgo',
      test: (h) => /^(html\.|lite\.)?duckduckgo\.com$/.test(h),
      roots: ['ol.react-results--main', '#links', '.results', '#web_content_wrapper'],
      boxes: ['#searchbox_input', '#search_form_input', 'input[name="q"]'],
    },
  ];

  const engine = ENGINES.find((e) => e.test(M.normalizeHost(location.hostname)));
  if (!engine) return;

  let fileSnippets = [];   // from snippets.txt, the hand-edited file
  let userSnippets = [];   // added in the popup
  let enabled = true;      // the extension as a whole
  let tagsEnabled = true;  // this strip in particular

  const watched = new WeakSet();

  /* ---------- the search box ---------- */

  function onScreen(element) {
    return !!element && element.getClientRects().length > 0;
  }

  function findBox() {
    let fallback = null;
    for (const selector of engine.boxes) {
      for (const candidate of document.querySelectorAll(selector)) {
        if (onScreen(candidate)) return candidate;
        if (!fallback) fallback = candidate;
      }
    }
    return fallback;
  }

  /**
   * Set the box's value the way a keystroke would.
   *
   * Assigning to .value directly is invisible to a framework that keeps the
   * value in its own state — DuckDuckGo's box is React-controlled and would
   * snap straight back. Going through the prototype's setter and then firing a
   * bubbling `input` event is what makes the change stick.
   */
  function setQuery(box, value, selection) {
    const isTextarea = typeof HTMLTextAreaElement !== 'undefined'
      && box instanceof HTMLTextAreaElement;
    const proto = isTextarea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(box, value);
    else box.value = value;

    box.dispatchEvent(new Event('input', { bubbles: true }));

    // The "" tag leaves the text it just changed selected, so that clicking
    // again acts on the same words and undoes it. Everything else puts the
    // caret at the end, where typing carries on.
    const from = selection ? selection.start : value.length;
    const to = selection ? selection.end : value.length;
    try {
      box.focus({ preventScroll: true });
      box.setSelectionRange(from, to);
      if (selection) lastSelection = { start: from, end: to, value };
    } catch (e) { /* some boxes refuse a caret; the text is in, which is the point */ }
  }

  function submitQuery(box) {
    const form = box.closest('form');
    if (!form) return false;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
    return true;
  }

  /**
   * The last selection seen in the box, kept because clicking a tag can take it
   * away on pages that rebuild the box, and the "" tag has nothing to work on
   * without it.
   */
  let lastSelection = null;

  function rememberSelection(box) {
    const start = box.selectionStart;
    const end = box.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') return;
    // Collapsing the selection in the box clears the memory rather than leaving
    // it standing: putting the caret somewhere is a decision, and the fallback
    // is only meant to survive a selection the *page* threw away, never one you
    // deliberately let go of.
    lastSelection = start === end ? null : { start, end, value: box.value };
  }

  /** What the "" tag acts on: the selection, or the whole query if there is none. */
  function targetRange(box) {
    const start = box.selectionStart;
    const end = box.selectionEnd;
    if (typeof start === 'number' && typeof end === 'number' && start !== end) {
      return { start, end };
    }
    if (lastSelection && lastSelection.value === box.value) {
      return { start: lastSelection.start, end: lastSelection.end };
    }
    return { start: 0, end: box.value.length };
  }

  /** Keep the on/off marks honest while the box is being typed in by hand. */
  function watchBox(box) {
    if (!box || watched.has(box)) return;
    watched.add(box);
    box.addEventListener('input', markActive);
    box.addEventListener('select', () => rememberSelection(box));
    box.addEventListener('keyup', () => rememberSelection(box));
    box.addEventListener('mouseup', () => rememberSelection(box));
  }

  /* ---------- clipboard ---------- */

  function legacyCopy(text) {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('aria-hidden', 'true');
    helper.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
    document.body.appendChild(helper);
    helper.select();
    try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
    helper.remove();
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }

  /* ---------- the strip ---------- */

  function activeList() {
    if (!enabled || !tagsEnabled) return [];
    // The file comes first: it is the curated row, in the order it was written.
    // Anything added in the popup lands after it. The "" tag is pinned ahead of
    // both, and is why the strip appears even when you have no snippets at all.
    const snippets = userSnippets.reduce((acc, s) => S.addSnippet(acc, s), fileSnippets);
    return [QUOTE_TAG].concat(snippets);
  }

  /* ---------- where the strip lives ---------- */

  const HOLDER_ID = 'unsee-tags-holder';

  /* Google's own header goes fixed once you scroll: 71px tall, z-index 999. A
     sticky strip at top:12 is laid out perfectly and shown to nobody — the
     third time in this extension's short life that geometry was right and the
     thing was still invisible. Clear it. */
  const STICKY_TOP = 96;

  /* Below this much free space the header row is not worth using. */
  const HEADER_MIN = 200;

  /** Free horizontal space in the header row, ignoring anything of ours in it. */
  function headerGap() {
    const box = findBox();
    const form = box && box.closest('form');
    const row = form && form.parentElement;
    if (!row || getComputedStyle(row).display.indexOf('flex') === -1) return 0;

    let used = 0;
    for (const kid of row.children) {
      if (kid.id === STRIP_ID || kid.id === HOLDER_ID) continue;
      used += kid.getBoundingClientRect().width;
    }
    return row.getBoundingClientRect().width - used;
  }

  /**
   * Which slot to use, decided fresh every render because the answer changes
   * under you: a knowledge panel appears, the window narrows, Google swaps the
   * layout for a different kind of result.
   *
   * Everything here is found by id — `#rhs`, `#rcnt`, `#center_col` — or by
   * climbing from the search box. Not one class name, because those are
   * regenerated constantly and a strip anchored to one disappears silently.
   */
  function chooseSlot() {
    if (engine.id === 'google') {
      const rhs = document.getElementById('rhs');
      if (rhs && rhs.isConnected) return 'rhs';

      const rcnt = document.getElementById('rcnt');
      const center = document.getElementById('center_col');
      if (rcnt && center && getComputedStyle(rcnt).display.indexOf('grid') !== -1) {
        return 'column';
      }
    }
    if (headerGap() >= HEADER_MIN) return 'header';
    return 'above';
  }

  function makeHolder(sticky) {
    const holder = document.createElement('div');
    holder.id = HOLDER_ID;
    holder.style.minWidth = '0';
    const inner = document.createElement('div');
    if (sticky) {
      inner.style.position = 'sticky';
      inner.style.top = STICKY_TOP + 'px';
    }
    holder.appendChild(inner);
    return holder;
  }

  function mountAt(slot, strip) {
    strip.dataset.unseeSlot = slot;

    // Above the knowledge panel, as its first child: the panel moves down
    // rather than being covered. Not sticky — it travels with the panel.
    if (slot === 'rhs') {
      const rhs = document.getElementById('rhs');
      if (!rhs) return false;
      const holder = makeHolder(false);
      holder.firstElementChild.appendChild(strip);
      rhs.insertAdjacentElement('afterbegin', holder);
      return true;
    }

    // The empty right-hand column. `span 7 / -2` is the placement Google's own
    // #rhs uses, counted from the end of the grid, so it survives a change in
    // the number of tracks.
    if (slot === 'column') {
      const rcnt = document.getElementById('rcnt');
      if (!rcnt) return false;
      const holder = makeHolder(true);
      holder.style.gridColumn = 'span 7 / -2';
      holder.firstElementChild.appendChild(strip);
      rcnt.appendChild(holder);
      return true;
    }

    // The gap in the header row, between the search form and the icons.
    if (slot === 'header') {
      const box = findBox();
      const form = box && box.closest('form');
      if (!form) return false;
      form.insertAdjacentElement('afterend', strip);
      return true;
    }

    // Where it started: above the results, under the "N hidden" bar if there is
    // one, so the two read as one block.
    const bar = document.getElementById('unsee-bar');
    let anchor = (bar && bar.isConnected) ? bar : null;
    if (!anchor) {
      for (const selector of engine.roots) {
        const root = document.querySelector(selector);
        if (root) { anchor = root; break; }
      }
    }
    if (!anchor) return false;
    anchor.insertAdjacentElement('beforebegin', strip);
    return true;
  }

  function unmount() {
    const strip = document.getElementById(STRIP_ID);
    if (strip) strip.remove();
    const holder = document.getElementById(HOLDER_ID);
    if (holder) holder.remove();
  }

  /**
   * The right-hand edge of the band the suggestion list occupies.
   *
   * This was the whole bug: the list is far wider than the box it hangs under —
   * measured at 888px against a 659px box, reaching 181px further right — so
   * "beside the search box" is not the same as "clear of the suggestions", and
   * the first 113px of the strip was being covered the moment the box took
   * focus, which is exactly when you want to click another tag.
   *
   * The band is taken from the search *form*, which is wider still and is a
   * structural element we already hold, with the box's own width plus that
   * measured overhang as a second opinion.
   */
  function suggestionBandRight() {
    const box = findBox();
    const form = box && box.closest('form');
    if (!box || !form) return 0;
    const f = form.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return Math.max(f.right, b.right + 200) + 12;
  }

  /**
   * Hold the strip's contents out of that band. The rows are right-aligned, so
   * this is a width cap rather than a shove: tags stay against the far edge and
   * wrap earlier instead of straying under the suggestions.
   */
  function keepClearOfSuggestions(strip) {
    if (!strip || !strip.isConnected) return;
    if (typeof strip.getBoundingClientRect !== 'function') return;
    const overlap = suggestionBandRight() - strip.getBoundingClientRect().left;
    strip.style.paddingLeft = overlap > 0 ? Math.ceil(overlap) + 'px' : '';
  }

  function flash(chip, message) {
    if (chip.dataset.unseeFlashing) return;
    const original = chip.textContent;
    chip.dataset.unseeFlashing = '1';
    chip.textContent = message;
    setTimeout(() => {
      chip.textContent = original;
      delete chip.dataset.unseeFlashing;
      markActive();
    }, 900);
  }

  /** Ask the worker to open a search for `query` in a tab behind this one. */
  function openBackgroundSearch(query) {
    const url = S.searchUrlWithQuery(location.href, query);
    if (!url) return false;
    try {
      // In MV3 this returns a promise when no callback is given, and it rejects
      // if the worker is not there to answer. Unhandled, that surfaces in the
      // page's console as an error from us, over something we do not need.
      const sent = chrome.runtime.sendMessage({ type: 'unsee-open-tab', url });
      if (sent && typeof sent.catch === 'function') sent.catch(() => { });
      return true;
    } catch (e) {
      // The worker is gone (the extension was reloaded under a live page). The
      // term is in the box either way; only the extra tab is lost.
      return false;
    }
  }

  /* A Mac Ctrl-click can arrive as a context menu *and* a click. The context
     menu is handled first, so the click that may follow is ignored rather than
     silently doing a second, different thing to the box. Only for the same tag:
     a right click here and a left click on another tag are two intentions, and
     half a second is not long enough to tell someone they cannot have both. */
  let contextMenuAt = 0;
  let contextMenuChip = null;

  function onChipContextMenu(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    contextMenuAt = Date.now();
    contextMenuChip = ev.currentTarget;

    const chip = ev.currentTarget;
    if (chip.dataset.unseeBuiltin === 'quote') {
      const box = findBox();
      const selected = box ? S.rangeText(box.value, targetRange(box).start, targetRange(box).end) : '';
      if (!selected) { flash(chip, '框裡沒有字'); return; }
      copy(S.quoteTerm(selected)).then(() => flash(chip, '已複製'));
      return;
    }

    const text = chip.dataset.unseeText || '';
    if (!text) return;
    copy(text).then(() => flash(chip, '已複製'));
  }

  /**
   * The "" tag. It quotes what is selected in the box — or the whole query, if
   * nothing is — and clicking again takes the quotes off the same words. Shift
   * searches with it; the quoting modifier does nothing extra here, because
   * quoting is already all this tag does.
   */
  function onQuoteClick(chip, ev) {
    const box = findBox();
    if (!box) { flash(chip, '沒有搜尋框'); return; }

    watchBox(box);
    const range = targetRange(box);
    const next = S.toggleQuoteAround(box.value, range.start, range.end);
    if (!next.changed) { flash(chip, '框裡沒有字'); return; }

    setQuery(box, next.text, { start: next.start, end: next.end });

    if (quoteModifier(ev) && ev.shiftKey) {
      if (!openBackgroundSearch(next.text)) flash(chip, '開不了分頁');
      return;
    }
    if (ev.shiftKey) submitQuery(box);
  }

  function onChipClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    const chip = ev.currentTarget;
    if (chip === contextMenuChip && Date.now() - contextMenuAt < 500) return;
    if (chip.dataset.unseeBuiltin === 'quote') {
      onQuoteClick(chip, ev);
      return;
    }

    const text = chip.dataset.unseeText || '';
    if (!text) return;

    const quoting = quoteModifier(ev);
    const form = quoting ? 'quoted' : 'plain';

    const box = findBox();
    if (!box) {
      // Nothing to type into — the clipboard beats doing nothing at all.
      copy(quoting ? S.quoteTerm(text) : text).then(() => flash(chip, '已複製'));
      return;
    }

    watchBox(box);

    // Quote + Shift also opens a search, and removing the term and then
    // searching for it would be nonsense — so that one only ever adds.
    const searching = quoting && ev.shiftKey;
    const next = searching
      ? S.ensureTermAs(box.value, text, form)
      : S.toggleTermAs(box.value, text, form);

    setQuery(box, next.text);
    markActive();

    if (searching) {
      if (!openBackgroundSearch(next.text)) flash(chip, '開不了分頁');
      return;
    }
    if (ev.shiftKey) submitQuery(box);
  }

  function markActive() {
    const strip = document.getElementById(STRIP_ID);
    if (!strip) return;
    const box = findBox();
    const query = box ? box.value : '';
    for (const chip of strip.querySelectorAll('.' + CHIP_CLASS)) {
      if (chip.dataset.unseeFlashing) continue;
      // The "" tag has no on state: it acts on the box rather than living in it.
      if (chip.dataset.unseeBuiltin) continue;
      // Either form counts as on: the tag is one switch however it was flipped.
      const on = !!query && S.presentForm(query, chip.dataset.unseeText || '') !== null;
      chip.toggleAttribute('data-unsee-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function makeChip(snippet, cat) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = CHIP_CLASS;
    chip.textContent = snippet.label;
    chip.dataset.unseeCat = cat;

    if (snippet.builtin) {
      chip.dataset.unseeBuiltin = snippet.builtin;
      chip.title = QUOTE_TIP;
    } else {
      chip.dataset.unseeText = snippet.text;
      chip.setAttribute('aria-pressed', 'false');
      chip.title = snippet.label === snippet.text ? TIP : snippet.text + '\n' + TIP;
    }

    // Pressing the mouse on a button takes the focus, and with it the selection
    // the "" tag needs. Refusing the default keeps the caret where it is; the
    // click still arrives.
    chip.addEventListener('mousedown', (ev) => ev.preventDefault());
    chip.addEventListener('click', onChipClick);
    chip.addEventListener('contextmenu', onChipContextMenu);
    return chip;
  }

  /** One row per kind of tag, in a fixed order. See groupSnippets. */
  function buildStrip(list, signature) {
    const strip = document.createElement('div');
    strip.id = STRIP_ID;
    strip.dataset.unseeSig = signature;
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'unsee 常用標籤');

    for (const row of S.groupSnippets(list)) {
      const line = document.createElement('div');
      line.className = 'unsee-tag-row';
      line.dataset.unseeCat = row.cat;
      for (const snippet of row.snippets) line.appendChild(makeChip(snippet, row.cat));
      strip.appendChild(line);
    }
    return strip;
  }

  function render() {
    const list = activeList();
    if (!list.length) {
      unmount();
      return;
    }

    const slot = chooseSlot();
    const signature = JSON.stringify(list);

    const current = document.getElementById(STRIP_ID);
    if (current && current.isConnected
      && current.dataset.unseeSig === signature
      && current.dataset.unseeSlot === slot) {
      markActive();
      return;
    }

    unmount();
    const strip = buildStrip(list, signature);
    if (!mountAt(slot, strip)) return;
    if (slot === 'column' || slot === 'rhs') keepClearOfSuggestions(strip);
    watchBox(findBox());
    markActive();
  }

  /* ---------- wiring ---------- */

  /* Same contract as blocklist.txt: it ships inside the extension, is read once
     per page, and a change takes effect after reloading the extension. That is
     what makes it a file rather than a settings screen. */
  function loadFile() {
    return fetch(chrome.runtime.getURL('snippets.txt'))
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        const parsed = S.parseSnippetFile(text);
        fileSnippets = parsed.snippets;
        if (parsed.problems.length) {
          console.warn('[unsee] snippets.txt:', parsed.problems);
        }
      })
      .catch(() => { /* no file, no tags from it; the popup's own list still shows */ });
  }

  chrome.storage.sync.get({ snippets: [], tagsEnabled: true, enabled: true }, (stored) => {
    userSnippets = Array.isArray(stored.snippets) ? stored.snippets : [];
    tagsEnabled = stored.tagsEnabled !== false;
    enabled = stored.enabled !== false;
    loadFile().then(render);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.snippets) userSnippets = changes.snippets.newValue || [];
    if (changes.tagsEnabled) tagsEnabled = changes.tagsEnabled.newValue !== false;
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    render();
  });

  let pending = null;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      render();
    }, 200);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', render);

  // Which slot is available depends on the window's width, so a resize can
  // change the answer without anything in the DOM changing.
  let resizing = null;
  window.addEventListener('resize', () => {
    if (resizing) return;
    resizing = setTimeout(() => { resizing = null; render(); }, 200);
  });
})();
