/*
 * unsee — blocklist matching.
 *
 * Pure functions only: no DOM, no chrome.* APIs. content.js and the popup both
 * use this, and test/run-tests.js runs it under plain node.
 *
 * A rule is written the way a person says a site out loud — "threads.com" —
 * and matches that host and every subdomain of it. Leading "www." is ignored
 * on both sides so "threads.com" catches "www.threads.com".
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.unseeMatcher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /** Strip scheme, path, port, credentials and a leading www. */
  function normalizeHost(input) {
    if (!input) return '';
    let s = String(input).trim().toLowerCase();
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    s = s.replace(/^[^/@]*@/, '');
    s = s.split('/')[0].split('?')[0].split('#')[0];
    s = s.replace(/:\d+$/, '');
    s = s.replace(/\.$/, '');
    s = s.replace(/^www\./, '');
    return s;
  }

  /**
   * A rule matches a host when the host IS the rule or ends with "." + rule.
   * "threads.com" therefore covers www.threads.com and cdn.threads.com, but
   * never notthreads.com — the dot boundary is what stops that.
   */
  function hostMatchesRule(host, rule) {
    const h = normalizeHost(host);
    const r = normalizeHost(rule);
    if (!h || !r) return false;
    return h === r || h.endsWith('.' + r);
  }

  /** The first rule that matches, or null. Callers use it to explain the hide. */
  function findMatchingRule(host, rules) {
    if (!Array.isArray(rules)) return null;
    for (const rule of rules) {
      if (hostMatchesRule(host, rule)) return normalizeHost(rule);
    }
    return null;
  }

  /**
   * Search engines wrap outbound links in their own redirector. Unwrap the
   * ones we know so the rule is tested against the real destination, not
   * against bing.com or duckduckgo.com.
   */
  function unwrapRedirect(rawUrl) {
    if (!rawUrl) return '';
    let url = String(rawUrl).trim();
    if (url.startsWith('//')) url = 'https:' + url;

    let parsed;
    try {
      parsed = new URL(url, 'https://example.invalid');
    } catch (e) {
      return url;
    }

    const host = normalizeHost(parsed.hostname);

    // DuckDuckGo: /l/?uddg=<percent-encoded target>
    if (host === 'duckduckgo.com' && parsed.pathname.startsWith('/l/')) {
      const target = parsed.searchParams.get('uddg');
      if (target) return target;
    }

    // Google: /url?q=<target> (still used by some surfaces)
    if (host === 'google.com' && parsed.pathname === '/url') {
      const target = parsed.searchParams.get('q') || parsed.searchParams.get('url');
      if (target) return target;
    }

    // Bing: /ck/a?...&u=a1<base64url of the target>
    if (host === 'bing.com' && parsed.pathname.startsWith('/ck/a')) {
      const u = parsed.searchParams.get('u');
      if (u && u.startsWith('a1')) {
        const decoded = decodeBase64Url(u.slice(2));
        if (decoded) return decoded;
      }
    }

    return url;
  }

  function decodeBase64Url(value) {
    let s = String(value).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try {
      if (typeof atob === 'function') return atob(s);
      if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64').toString('binary');
    } catch (e) {
      return '';
    }
    return '';
  }

  /** Host of a result link, after unwrapping. Empty string when unusable. */
  function hostOfResultLink(rawUrl) {
    const unwrapped = unwrapRedirect(rawUrl);
    if (!unwrapped) return '';
    if (/^(javascript|mailto|tel|data):/i.test(unwrapped)) return '';
    return normalizeHost(unwrapped);
  }

  /** Accept what a person typed into the popup, or reject it with a reason. */
  function parseRuleInput(input) {
    const host = normalizeHost(input);
    if (!host) return { ok: false, reason: 'empty' };
    if (host.indexOf('.') === -1) return { ok: false, reason: 'no-dot' };
    if (/[^a-z0-9.-]/.test(host)) return { ok: false, reason: 'bad-chars' };
    if (/^[.-]|[.-]$/.test(host)) return { ok: false, reason: 'bad-edges' };
    return { ok: true, rule: host };
  }

  /** Keep the list sorted, de-duplicated, and free of rules a broader rule covers. */
  function addRule(rules, rule) {
    const next = Array.isArray(rules) ? rules.slice() : [];
    if (next.some((r) => hostMatchesRule(rule, r))) return next.slice().sort();
    const pruned = next.filter((r) => !hostMatchesRule(r, rule));
    pruned.push(rule);
    return pruned.sort();
  }

  function removeRule(rules, rule) {
    const target = normalizeHost(rule);
    return (Array.isArray(rules) ? rules : []).filter((r) => normalizeHost(r) !== target);
  }

  /**
   * Read blocklist.txt — the file a person edits by hand.
   *
   * One entry per line, in any order. Blank lines and lines starting with #
   * are ignored. Whether a line is a domain or a keyword is worked out from
   * the line itself, so nothing has to be declared: anything that is a valid
   * hostname is a domain, everything else is a keyword. "threads.com" is a
   * domain; "限時特價" and "3.5 折" are keywords.
   *
   * When that guess would be wrong — an English keyword that happens to look
   * like a host, say "e.g." — prefix the line with "keyword:" or "domain:"
   * to say so outright.
   */
  function parseBlocklistFile(text) {
    const domains = [];
    const keywords = [];
    const problems = [];

    const lines = String(text == null ? '' : text)
      .replace(/^﻿/, '')
      .split(/\r?\n/);

    lines.forEach((raw, index) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;

      let body = line;
      let forced = null;
      const prefix = /^(domain|keyword)\s*:\s*/i.exec(line);
      if (prefix) {
        forced = prefix[1].toLowerCase();
        body = line.slice(prefix[0].length).trim();
      }
      if (!body) {
        problems.push({ line: index + 1, text: line, reason: 'empty-after-prefix' });
        return;
      }

      if (forced === 'keyword') {
        keywords.push(body.toLowerCase());
        return;
      }

      const parsed = parseRuleInput(body);
      if (forced === 'domain') {
        if (parsed.ok) domains.push(parsed.rule);
        else problems.push({ line: index + 1, text: line, reason: parsed.reason });
        return;
      }

      if (parsed.ok) domains.push(parsed.rule);
      else keywords.push(body.toLowerCase());
    });

    return {
      domains: dedupe(domains).sort(),
      keywords: dedupe(keywords).sort(),
      problems,
    };
  }

  function dedupe(list) {
    return list.filter((item, i) => list.indexOf(item) === i);
  }

  /** The first keyword present in the text, or null. Case-insensitive. */
  function findMatchingKeyword(text, keywords) {
    if (!Array.isArray(keywords) || !keywords.length) return null;
    const haystack = String(text == null ? '' : text).toLowerCase();
    if (!haystack) return null;
    for (const keyword of keywords) {
      if (keyword && haystack.indexOf(keyword) !== -1) return keyword;
    }
    return null;
  }

  return {
    normalizeHost,
    hostMatchesRule,
    findMatchingRule,
    unwrapRedirect,
    hostOfResultLink,
    parseRuleInput,
    addRule,
    removeRule,
    parseBlocklistFile,
    findMatchingKeyword,
  };
});
