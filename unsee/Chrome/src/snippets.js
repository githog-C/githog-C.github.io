/*
 * unsee — search snippets: the tag strip above the results.
 *
 * Pure functions only: no DOM, no chrome.* APIs. content.js and the popup both
 * use this, and test/run-tests.js runs it under plain node.
 *
 * A snippet is a piece of text you keep typing into the search box — "edu",
 * "site:edu.tw", "filetype:pdf". Clicking its tag puts it in the box; clicking
 * again takes it out, which is why the matching below is token-based rather
 * than a plain substring test: removing "edu" must not maul "education".
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.unseeSnippets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // Long enough for a full site: URL written out, which is a normal thing to
  // want on a tag. Anything longer than the strip is ellipsised by the CSS.
  const MAX_LABEL = 48;

  function collapse(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  /**
   * One line of snippets.txt, or one thing typed into the popup.
   *
   *   edu                    -> label "edu",  text "edu"
   *   教育部 = site:edu.tw    -> label "教育部", text "site:edu.tw"
   *
   * The split is on the FIRST "=", so a snippet that needs a literal "=" in it
   * must be given a label: "等式 = a=b" yields text "a=b".
   */
  function parseSnippetLine(line) {
    const raw = collapse(line);
    if (!raw) return { ok: false, reason: 'empty' };

    const cut = raw.indexOf('=');
    let label = raw;
    let text = raw;
    if (cut > 0) {
      label = collapse(raw.slice(0, cut));
      text = collapse(raw.slice(cut + 1));
    }
    if (!text) return { ok: false, reason: 'no-text' };
    if (!label) label = text;
    if (label.length > MAX_LABEL) return { ok: false, reason: 'label-too-long' };
    return { ok: true, snippet: { label, text } };
  }

  /**
   * Read snippets.txt — the file you edit by hand.
   *
   * One per line. Blank lines and lines starting with # are ignored. Order is
   * kept exactly as written, because the order of the tags on screen is the
   * only thing the file controls that a sorted list would throw away.
   */
  function parseSnippetFile(text) {
    const snippets = [];
    const problems = [];

    const lines = String(text == null ? '' : text)
      .replace(/^\ufeff/, '')
      .split(/\r?\n/);

    lines.forEach((raw, index) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const parsed = parseSnippetLine(line);
      if (!parsed.ok) {
        problems.push({ line: index + 1, text: line, reason: parsed.reason });
        return;
      }
      snippets.push(parsed.snippet);
    });

    return { snippets: dedupe(snippets), problems };
  }

  /** Same text twice is one tag; the first wins, so the file's order survives. */
  function dedupe(list) {
    const seen = new Set();
    const out = [];
    for (const snippet of Array.isArray(list) ? list : []) {
      if (!snippet || !snippet.text) continue;
      const key = collapse(snippet.text).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label: snippet.label || snippet.text, text: snippet.text });
    }
    return out;
  }

  /** Appended, not sorted: you decide the order the tags sit in. */
  function addSnippet(list, snippet) {
    const next = (Array.isArray(list) ? list.slice() : []);
    next.push(snippet);
    return dedupe(next);
  }

  function removeSnippet(list, text) {
    const target = collapse(text).toLowerCase();
    return (Array.isArray(list) ? list : [])
      .filter((s) => s && collapse(s.text).toLowerCase() !== target);
  }

  /**
   * Where `term` sits inside `query` as a whole token, or null.
   *
   * Whole token means the characters on either side are whitespace or the end
   * of the string. A plain indexOf would find "edu" inside "education" and
   * inside "site:edu.tw", and clicking the tag off would then cut a hole in a
   * word the tag never put there.
   */
  function findTerm(query, term) {
    const haystack = String(query == null ? '' : query).toLowerCase();
    const needle = collapse(term).toLowerCase();
    if (!needle || !haystack) return null;

    for (let from = 0; from <= haystack.length;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) return null;
      const end = at + needle.length;
      const before = at === 0 ? '' : haystack.charAt(at - 1);
      const after = end >= haystack.length ? '' : haystack.charAt(end);
      if ((!before || /\s/.test(before)) && (!after || /\s/.test(after))) {
        return { start: at, end };
      }
      from = at + 1;
    }
    return null;
  }

  function hasTerm(query, term) {
    return findTerm(query, term) !== null;
  }

  /** Put the term in if it is not there, take it out if it is. */
  function toggleTerm(query, term) {
    const current = String(query == null ? '' : query);
    const wanted = collapse(term);
    if (!wanted) return { text: current, added: false, changed: false };

    const at = findTerm(current, wanted);
    if (at) {
      const rest = collapse(current.slice(0, at.start) + ' ' + current.slice(at.end));
      return { text: rest, added: false, changed: true };
    }

    const base = current.trim();
    return { text: base ? base + ' ' + wanted : wanted, added: true, changed: true };
  }

  /** The same term as a phrase: "edu". Text that is already quoted is left alone. */
  function quoteTerm(term) {
    const t = collapse(term);
    if (!t) return '';
    if (t.length >= 2 && t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') return t;
    return '"' + t + '"';
  }

  /** Which form of the term is in the query: 'plain', 'quoted', or null. */
  function presentForm(query, term) {
    const plain = collapse(term);
    if (!plain) return null;
    if (findTerm(query, plain)) return 'plain';
    if (findTerm(query, quoteTerm(plain))) return 'quoted';
    return null;
  }

  /**
   * The tag as a switch. Whichever form is in the box comes out; if neither is
   * there, `form` goes in. Switching off therefore works whatever click put the
   * term there, which is what lets one tag show one on/off state.
   */
  function toggleTermAs(query, term, form) {
    const plain = collapse(term);
    const already = presentForm(query, plain);
    if (already === 'plain') return toggleTerm(query, plain);
    if (already === 'quoted') return toggleTerm(query, quoteTerm(plain));
    return toggleTerm(query, form === 'quoted' ? quoteTerm(plain) : plain);
  }

  /**
   * Put the term in, in this form, and never take anything out — for the click
   * that also opens a search, where removing the term and then searching for it
   * would be nonsense. An other-form term already in the box is swapped rather
   * than duplicated.
   */
  function ensureTermAs(query, term, form) {
    const plain = collapse(term);
    const wanted = form === 'quoted' ? quoteTerm(plain) : plain;
    let text = String(query == null ? '' : query);
    if (!wanted) return { text, added: false, changed: false };
    if (findTerm(text, wanted)) return { text, added: false, changed: false };

    const other = form === 'quoted' ? plain : quoteTerm(plain);
    if (findTerm(text, other)) text = toggleTerm(text, other).text;
    return toggleTerm(text, wanted);
  }

  /**
   * This page's own search URL with a different query in it.
   *
   * Built from the current address rather than from a hard-coded one, so the
   * country domain and whatever settings are riding in the URL (udm, hl, safe)
   * come along. Parameters that describe *this* result page rather than the
   * search itself are dropped, or the new tab opens on page 4 of something.
   */
  const STALE_PARAMS = ['start', 'oq', 'ei', 'ved', 'sei', 'aqs', 'uact', 'source', 'sca_esv'];

  function searchUrlWithQuery(currentUrl, query) {
    let url;
    try {
      url = new URL(String(currentUrl));
    } catch (e) {
      return '';
    }
    url.searchParams.set('q', String(query == null ? '' : query));
    STALE_PARAMS.forEach((name) => url.searchParams.delete(name));
    url.hash = '';
    return url.toString();
  }

  /**
   * The text a range actually covers, with whitespace at either end left out.
   *
   * A range with nothing in it means the whole string: the "" tag with nothing
   * selected quotes the query you have, which is the obvious reading of it. A
   * selection dragged with the mouse nearly always takes a trailing space with
   * it, and quoting that space would be a small, permanent annoyance.
   */
  function rangeBounds(text, start, end) {
    const source = String(text == null ? '' : text);
    let from = Math.max(0, Math.min(source.length, Number(start) || 0));
    let to = Math.max(0, Math.min(source.length, Number(end) || 0));
    if (from > to) { const swap = from; from = to; to = swap; }
    if (from === to) { from = 0; to = source.length; }
    while (from < to && /\s/.test(source.charAt(from))) from++;
    while (to > from && /\s/.test(source.charAt(to - 1))) to--;
    return { source, from, to };
  }

  function rangeText(text, start, end) {
    const r = rangeBounds(text, start, end);
    return r.source.slice(r.from, r.to);
  }

  /**
   * Put quotes round that range, or take them off again if they are there.
   *
   * Returns the new text and the range to leave selected, so that clicking a
   * second time undoes exactly what the first click did — which is the whole
   * behaviour of the "" tag.
   */
  function toggleQuoteAround(text, start, end) {
    const { source, from, to } = rangeBounds(text, start, end);
    if (from === to) {
      return { text: source, start: from, end: to, quoted: false, changed: false };
    }

    const inner = source.slice(from, to);

    // Quotes inside the selection.
    if (inner.length >= 2 && inner.charAt(0) === '"' && inner.charAt(inner.length - 1) === '"') {
      const bare = inner.slice(1, -1);
      return {
        text: source.slice(0, from) + bare + source.slice(to),
        start: from,
        end: from + bare.length,
        quoted: false,
        changed: true,
      };
    }

    // Quotes just outside it. Selecting the words inside "…" is the same
    // gesture as selecting the phrase with its quotes, and has to undo the
    // same way — otherwise the second click gives you ""…"".
    if (from > 0 && source.charAt(from - 1) === '"' && source.charAt(to) === '"') {
      return {
        text: source.slice(0, from - 1) + inner + source.slice(to + 1),
        start: from - 1,
        end: from - 1 + inner.length,
        quoted: false,
        changed: true,
      };
    }

    const wrapped = '"' + inner + '"';
    return {
      text: source.slice(0, from) + wrapped + source.slice(to),
      start: from,
      end: from + wrapped.length,
      quoted: true,
      changed: true,
    };
  }

  /**
   * Which kind of thing a snippet is, worked out from the operator it starts
   * with. Nothing has to be declared, for the same reason blocklist.txt does not
   * make you declare domains: the line already says what it is.
   */
  const CATEGORIES = [
    { cat: 'url', test: /^site:/i },
    { cat: 'filetype', test: /^filetype:/i },
    { cat: 'date', test: /^(after|before|daterange):/i },
  ];

  const CATEGORY_ORDER = ['keyword', 'url', 'filetype', 'date'];

  function classifySnippet(text) {
    const t = collapse(text);
    for (const entry of CATEGORIES) {
      if (entry.test.test(t)) return entry.cat;
    }
    return 'keyword';
  }

  /**
   * The tags split into rows, one row per kind, always in the same order:
   * keywords (with the "" tag at the head of them), then site:, then filetype:,
   * then the date operators. Within a row the file's own order is kept.
   *
   * Rows exist so that the eye can find a kind of tag by where it sits rather
   * than by reading every label — which is also why an empty kind is dropped
   * instead of leaving a gap.
   */
  function groupSnippets(list) {
    const rows = CATEGORY_ORDER.map((cat) => ({ cat, snippets: [] }));
    for (const snippet of Array.isArray(list) ? list : []) {
      if (!snippet || (!snippet.text && !snippet.builtin)) continue;
      const cat = snippet.builtin ? 'keyword' : classifySnippet(snippet.text);
      rows[CATEGORY_ORDER.indexOf(cat)].snippets.push(snippet);
    }
    return rows.filter((row) => row.snippets.length);
  }

  return {
    parseSnippetLine,
    parseSnippetFile,
    addSnippet,
    removeSnippet,
    findTerm,
    hasTerm,
    toggleTerm,
    quoteTerm,
    presentForm,
    toggleTermAs,
    ensureTermAs,
    searchUrlWithQuery,
    rangeText,
    toggleQuoteAround,
    classifySnippet,
    groupSnippets,
    CATEGORY_ORDER,
  };
});
