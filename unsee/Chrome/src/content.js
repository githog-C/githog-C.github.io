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
  const TAGGED_ATTR = 'data-unsee-tagged';

  const ENGINES = [
    {
      id: 'google',
      test: (h) => /^(www\.)?google(\.[a-z]{2,3}){1,2}$/.test(h),
      roots: ['#rso', '#botstuff', '#search'],
      hostLine: '.byrV5b, cite, .tjvcx',
    },
    {
      id: 'bing',
      test: (h) => /^(www\.)?bing\.com$/.test(h),
      roots: ['#b_results'],
      hostLine: 'cite, .b_attribution',
    },
    {
      id: 'duckduckgo',
      test: (h) => /^(html\.|lite\.)?duckduckgo\.com$/.test(h),
      roots: ['ol.react-results--main', '#links', '.results'],
      hostLine: '[data-testid="result-extras-url-link"], .result__url',
    },
  ];

  const engine = ENGINES.find((e) => e.test(M.normalizeHost(location.hostname)));
  if (!engine) return;

  let rules = [];
  let enabled = true;
  let revealed = false;
  let lastCount = 0;

  /* ---------- hiding ---------- */

  /** The result block containing this link: the ancestor that is a child of root. */
  function blockFor(anchor, root) {
    let node = anchor;
    while (node && node.parentElement && node.parentElement !== root) {
      node = node.parentElement;
    }
    return node && node.parentElement === root ? node : null;
  }

  function sweep() {
    let count = 0;
    const seen = new Set();

    for (const selector of engine.roots) {
      const roots = document.querySelectorAll(selector);
      for (const root of roots) {
        for (const anchor of root.querySelectorAll('a[href]')) {
          const host = M.hostOfResultLink(anchor.getAttribute('href'));
          if (!host) continue;

          const block = blockFor(anchor, root);
          if (!block || seen.has(block)) continue;

          const rule = M.findMatchingRule(host, rules);
          if (rule && enabled) {
            seen.add(block);
            block.setAttribute(HIDDEN_ATTR, rule);
            count++;
          } else if (block.hasAttribute(HIDDEN_ATTR)) {
            block.removeAttribute(HIDDEN_ATTR);
          }
          if (!rule) tagBlock(block, host);
        }
      }
      if (count) break; // the first root that produced results is the real one
    }

    document.documentElement.toggleAttribute('data-unsee-reveal', revealed);
    lastCount = count;
    renderBar();
  }

  /* ---------- the inline "hide this site" affordance ---------- */

  function tagBlock(block, host) {
    if (!host || block.getAttribute(TAGGED_ATTR) === host) return;
    block.setAttribute(TAGGED_ATTR, host);

    const anchorLine = engine.hostLine ? block.querySelector(engine.hostLine) : null;
    const mount = anchorLine || block.querySelector('cite');
    if (!mount || mount.querySelector('.unsee-hide-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'unsee-hide-btn';
    btn.textContent = '不看 ' + host;
    btn.title = '把 ' + host + ' 加入 unsee 清單';
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      addRuleAndSweep(host);
    });
    mount.appendChild(btn);
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

  function load() {
    chrome.storage.sync.get({ rules: [], enabled: true }, (stored) => {
      rules = Array.isArray(stored.rules) ? stored.rules : [];
      enabled = stored.enabled !== false;
      sweep();
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
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      sweep();
    }, 120);
  });

  load();
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', sweep);
})();
