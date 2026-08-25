/*
 * unsee — hide chosen sites from search results.
 *
 * Runs on the search engine's own results page. It never contacts a server,
 * never reads what you searched for, and stores nothing but your own rule list.
 *
 * Result blocks are found structurally, not by class name: on every engine here
 * one result is a direct child of the results container. Class names churn
 * (Google's were MjjYud when this was written); "child of #rso" does not.
 */
(function () {
  'use strict';

  const M = globalThis.unseeMatcher;
  if (!M) return;

  const HIDDEN_ATTR = 'data-unsee-hidden';
  const MOUNTED_ATTR = 'data-unsee-mounted';
  const BTN_CLASS = 'unsee-hide-btn';

  /* Google's "about this result" kebab menu, identified by its path data so the
     lookup survives class renames and works in any interface language. */
  const KEBAB_PATH = /^M12 8c1\.1 0 2-\.9 2-2/;

  /**
   * Where to put our button on a Google result: as the flex sibling immediately
   * after the column holding the kebab, so it lands to its right and overlaps
   * nothing. That row is zero-height and the kebab column overflows it, which is
   * why the button aligns to flex-start rather than centre.
   */
  function googleAnchor(block) {
    for (const svg of block.querySelectorAll('svg')) {
      const path = svg.querySelector('path');
      if (!path || !KEBAB_PATH.test(path.getAttribute('d') || '')) continue;
      let column = svg.closest('div[role="button"]');
      if (!column) continue;
      for (let i = 0; i < 4 && column; i++) column = column.parentElement;
      if (!column || !column.parentElement) continue;
      if (getComputedStyle(column.parentElement).display !== 'flex') continue;
      return column;
    }
    return null;
  }

  const ENGINES = [
    {
      id: 'google',
      test: (h) => /^(www\.)?google(\.[a-z]{2,3}){1,2}$/.test(h),
      roots: ['#rso', '#botstuff', '#search'],
      anchor: googleAnchor,
    },
    {
      id: 'bing',
      test: (h) => /^(www\.)?bing\.com$/.test(h),
      roots: ['#b_results'],
      anchor: null,
    },
    {
      id: 'duckduckgo',
      test: (h) => /^(html\.|lite\.)?duckduckgo\.com$/.test(h),
      roots: ['ol.react-results--main', '#links', '.results'],
      anchor: null,
    },
  ];

  const engine = ENGINES.find((e) => e.test(M.normalizeHost(location.hostname)));
  if (!engine) return;

  let rules = [];          // added from the popup or the per-result button
  let fileDomains = [];    // from blocklist.txt, the hand-edited file
  let fileKeywords = [];
  let enabled = true;
  let revealed = false;
  let lastCount = 0;

  /* ---------- hiding ---------- */

  /** The result block containing this link: the ancestor that is a child of root. */
  function blockFor(link, root) {
    let node = link;
    while (node && node.parentElement && node.parentElement !== root) {
      node = node.parentElement;
    }
    return node && node.parentElement === root ? node : null;
  }

  function sweep() {
    // Unticking "啟用" turns the whole thing off: nothing hidden, no buttons and
    // no bar. The checkbox is the on/off line for the feature as a whole, not
    // just for the hiding half of it.
    if (!enabled) {
      teardown();
      return;
    }

    let count = 0;
    const seen = new Set();

    for (const selector of engine.roots) {
      const roots = document.querySelectorAll(selector);
      for (const root of roots) {
        for (const link of root.querySelectorAll('a[href]')) {
          const host = M.hostOfResultLink(link.getAttribute('href'));
          if (!host) continue;

          const block = blockFor(link, root);
          if (!block || seen.has(block)) continue;
          seen.add(block);

          const reason = reasonToHide(block, host);
          if (reason) {
            block.setAttribute(HIDDEN_ATTR, reason);
            count++;
          } else {
            block.removeAttribute(HIDDEN_ATTR);
            mountButton(block, host);
          }
        }
      }
      if (count) break; // the first root that produced results is the real one
    }

    document.documentElement.toggleAttribute('data-unsee-reveal', revealed);
    lastCount = count;
    renderBar();
  }

  /**
   * Why this result should go, or null to keep it. Domains are checked first
   * because they are cheap and exact; the keyword pass reads the block's text
   * and is what catches results whose host is fine but whose content is not.
   */
  function reasonToHide(block, host) {
    const byDomain = M.findMatchingRule(host, rules)
      || M.findMatchingRule(host, fileDomains);
    if (byDomain) return byDomain;

    if (fileKeywords.length) {
      const keyword = M.findMatchingKeyword(block.innerText || '', fileKeywords);
      if (keyword) return '關鍵字：' + keyword;
    }
    return null;
  }

  /** Remove every trace of ourselves from the page. */
  function teardown() {
    document.querySelectorAll('[' + HIDDEN_ATTR + ']')
      .forEach((el) => el.removeAttribute(HIDDEN_ATTR));
    document.querySelectorAll('[' + MOUNTED_ATTR + ']')
      .forEach((el) => el.removeAttribute(MOUNTED_ATTR));
    document.querySelectorAll('.' + BTN_CLASS).forEach((el) => el.remove());
    document.documentElement.removeAttribute('data-unsee-reveal');
    const bar = document.getElementById('unsee-bar');
    if (bar) bar.remove();
    lastCount = 0;
  }

  /* ---------- the inline "hide this site" affordance ---------- */

  /** The unsee mark, drawn inline so it inherits the page's text colour. */
  function markSvg() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '13');
    svg.setAttribute('height', '13');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', '12');
    ring.setAttribute('cy', '12');
    ring.setAttribute('r', '7');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'currentColor');
    ring.setAttribute('stroke-width', '2');

    const strike = document.createElementNS(NS, 'line');
    strike.setAttribute('x1', '4.5');
    strike.setAttribute('y1', '19.5');
    strike.setAttribute('x2', '19.5');
    strike.setAttribute('y2', '4.5');
    strike.setAttribute('stroke', 'currentColor');
    strike.setAttribute('stroke-width', '2');
    strike.setAttribute('stroke-linecap', 'round');

    svg.append(ring, strike);
    return svg;
  }

  function mountButton(block, host) {
    if (!engine.anchor || !host) return;
    if (block.getAttribute(MOUNTED_ATTR) === host) return;

    const previous = block.querySelector('.' + BTN_CLASS);
    if (previous) previous.remove();

    const anchor = engine.anchor(block);
    if (!anchor) return;

    const label = '不看 ' + host;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BTN_CLASS;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.appendChild(markSvg());
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      addRuleAndSweep(host);
    });

    anchor.insertAdjacentElement('afterend', button);
    block.setAttribute(MOUNTED_ATTR, host);
  }

  function addRuleAndSweep(host) {
    const parsed = M.parseRuleInput(host);
    if (!parsed.ok) return;
    rules = M.addRule(rules, parsed.rule);
    chrome.storage.sync.set({ rules });
    sweep();
  }

  /* ---------- the status bar ---------- */

  function renderBar() {
    let bar = document.getElementById('unsee-bar');
    if (!lastCount) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'unsee-bar';
      const label = document.createElement('span');
      label.className = 'unsee-bar-label';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'unsee-bar-toggle';
      toggle.addEventListener('click', () => {
        revealed = !revealed;
        sweep();
      });
      bar.append(label, toggle);
      const host = document.querySelector(engine.roots[0]) || document.body;
      host.insertAdjacentElement('beforebegin', bar);
    }
    bar.querySelector('.unsee-bar-label').textContent =
      'unsee 隱藏了 ' + lastCount + ' 筆結果';
    bar.querySelector('.unsee-bar-toggle').textContent = revealed ? '收起' : '顯示';
  }

  /* ---------- wiring ---------- */

  /**
   * blocklist.txt ships inside the extension, so it is read once per page and
   * a change to it takes effect after reloading the extension. That is the
   * whole point of it being a file: it is edited in a text editor, not in a UI.
   * If it cannot be read the extension carries on with the stored rules alone.
   */
  function loadFile() {
    return fetch(chrome.runtime.getURL('blocklist.txt'))
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        const parsed = M.parseBlocklistFile(text);
        fileDomains = parsed.domains;
        fileKeywords = parsed.keywords;
        if (parsed.problems.length) {
          console.warn('[unsee] blocklist.txt:', parsed.problems);
        }
      })
      .catch(() => { /* no file, no defaults; the stored rules still apply */ });
  }

  function load() {
    chrome.storage.sync.get({ rules: [], enabled: true }, (stored) => {
      rules = Array.isArray(stored.rules) ? stored.rules : [];
      enabled = stored.enabled !== false;
      loadFile().then(sweep);
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.rules) rules = changes.rules.newValue || [];
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    sweep();
  });

  let pending = null;
  const observer = new MutationObserver(() => {
    if (!enabled || pending) return;
    pending = setTimeout(() => {
      pending = null;
      sweep();
    }, 120);
  });

  load();
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', sweep);
})();
