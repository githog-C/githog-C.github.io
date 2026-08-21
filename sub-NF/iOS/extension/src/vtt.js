// sub-NF — subtitle parsing, isolated so it can be unit-tested outside a browser.
// Exposes globalThis.SubNFVTT; also exports via CommonJS under Node (for tests).
//
// Handles both formats Netflix serves:
//   * WebVTT  (webvtt-lssdh-ios8, webvtt)
//   * TTML    (imsc1.1, dfxp-ls-sdh, …) — some tracks, notably CLOSEDCAPTIONS,
//             may offer no WebVTT variant at all.
(() => {
  'use strict';
  const root = (typeof self !== 'undefined') ? self
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  function safeCP(n) { try { return String.fromCodePoint(n); } catch (_) { return ''; } }

  function decodeEntities(t) {
    return String(t)
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#(\d+);/g, (_, n) => safeCP(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => safeCP(parseInt(n, 16)))
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
      .replace(/&amp;/gi, '&');
  }

  // ---------- WebVTT ----------
  function parseTime(s) {
    if (typeof s !== 'string') return null;
    s = s.trim().replace(',', '.');
    const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (!m) return null;
    const h = m[1] ? parseInt(m[1], 10) : 0;
    const min = parseInt(m[2], 10);
    const sec = parseInt(m[3], 10);
    const ms = m[4] ? parseInt((m[4] + '000').slice(0, 3), 10) : 0;
    return h * 3600 + min * 60 + sec + ms / 1000;
  }

  function stripTags(t) {
    return decodeEntities(
      String(t)
        .replace(/<[^>]+>/g, '')            // <i>, <c...>, <v ...>, inline timestamps
        .replace(/\{[^}]*\}/g, '')          // stray {style} blocks
        .replace(/[‎‏]/g, '')     // LRM / RLM marks
        .replace(/&lrm;|&rlm;/gi, '')
    ).replace(/[ \t]+$/gm, '').trim();
  }

  function parseVTT(text) {
    const cues = [];
    if (!text || typeof text !== 'string') return cues;
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split('\n');
      let ti = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) { ti = i; break; }
      }
      if (ti < 0) continue;
      const parts = lines[ti].split('-->');
      if (parts.length < 2) continue;
      const start = parseTime(parts[0]);
      const end = parseTime(parts[1].trim().split(/\s+/)[0]);
      if (start == null || end == null || end < start) continue;
      const body = lines.slice(ti + 1).map(stripTags).filter((l) => l.length);
      const cueText = body.join('\n');
      if (cueText) cues.push({ start, end, text: cueText });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  // ---------- TTML / DFXP / IMSC ----------
  // Regex-based on purpose: no DOMParser, so it runs and is testable under Node.
  function ttmlTime(s, tickRate) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    let m = s.match(/^(\d+):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/);
    if (m) {
      return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
        + (m[4] ? parseInt((m[4] + '000').slice(0, 3), 10) / 1000 : 0);
    }
    m = s.match(/^(\d+(?:\.\d+)?)t$/i);                       // ticks
    if (m) return parseFloat(m[1]) / (tickRate || 10000000);
    m = s.match(/^(\d+(?:\.\d+)?)(ms|h|m|s)$/i);              // ms before m/s
    if (m) {
      const v = parseFloat(m[1]);
      switch (m[2].toLowerCase()) {
        case 'h': return v * 3600;
        case 'm': return v * 60;
        case 's': return v;
        case 'ms': return v / 1000;
      }
    }
    return null;
  }

  function parseTTML(text) {
    const cues = [];
    if (!text || typeof text !== 'string') return cues;
    let tickRate = 10000000;
    const tr = text.match(/tickRate\s*=\s*["'](\d+)["']/i);
    if (tr) tickRate = parseInt(tr[1], 10) || tickRate;

    const re = /<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const attrs = m[1] || '';
      const b = attrs.match(/\bbegin\s*=\s*["']([^"']*)["']/i);
      const e = attrs.match(/\bend\s*=\s*["']([^"']*)["']/i);
      if (!b || !e) continue;
      const start = ttmlTime(b[1], tickRate);
      const end = ttmlTime(e[1], tickRate);
      if (start == null || end == null || end < start) continue;
      const body = decodeEntities(
        String(m[2])
          .replace(/<br\s*\/?>/gi, '\n')   // line break BEFORE tags are stripped
          .replace(/<[^>]+>/g, '')
      );
      const cueText = body.split('\n').map((l) => l.replace(/\s+/g, ' ').trim())
        .filter((l) => l.length).join('\n');
      if (cueText) cues.push({ start, end, text: cueText });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  // Pick the parser by sniffing the payload rather than trusting the format name.
  function parseSubtitle(text) {
    if (!text || typeof text !== 'string') return [];
    if (/^\s*﻿?WEBVTT/.test(text) || text.indexOf('-->') !== -1) return parseVTT(text);
    if (/<tt[\s>]/i.test(text) || /<p\b[^>]*\bbegin\s*=/i.test(text)) return parseTTML(text);
    return parseVTT(text);
  }

  // Text of all cues active at time t (joins overlapping cues within a window).
  function textAt(cues, t) {
    if (!cues || !cues.length) return '';
    let lo = 0, hi = cues.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (ans < 0) return '';
    const out = [];
    for (let i = ans; i >= 0 && cues[i].start >= t - 30; i--) {
      if (cues[i].start <= t && t <= cues[i].end) out.unshift(cues[i].text);
    }
    return out.join('\n');
  }

  // Read text out of one of Netflix's own rendered caption nodes. A <br> sits
  // inside the *following* span there, so textContent glues the lines together;
  // walk the tree instead. Pure: only nodeType / nodeValue / tagName / childNodes.
  function textFromNode(node) {
    if (!node) return '';
    let s = '';
    const kids = node.childNodes || [];
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i];
      if (!n) continue;
      if (n.nodeType === 3) s += (n.nodeValue || '');
      else if (n.nodeType === 1) {
        s += (String(n.tagName).toUpperCase() === 'BR') ? '\n' : textFromNode(n);
      }
    }
    return s;
  }

  function cleanNative(s) {
    return String(s || '')
      .replace(/ /g, ' ')
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length)
      .join('\n');
  }

  // ---------- Netflix's own Audio & Subtitles menu ----------
  // Rows are identified by data-uia, which is a stable identifier; the visible
  // label is localised. Forms seen:
  //   subtitle-item-selected-Off
  //   subtitle-item-English (CC)
  //   subtitle-item-Chinese (Traditional)
  // The " (CC)" suffix is Netflix's own i18n template "{LANGUAGE} (CC)", so it
  // can be stripped back to the display name plus a cc flag.
  function parseMenuUia(uia) {
    const s = String(uia == null ? '' : uia);
    if (s.indexOf('subtitle-item-') !== 0) return null;
    let rest = s.slice('subtitle-item-'.length);
    let selected = false;
    if (rest.indexOf('selected-') === 0) { selected = true; rest = rest.slice('selected-'.length); }
    let cc = false;
    const m = rest.match(/^(.*)\s*\(CC\)\s*$/);
    if (m) { cc = true; rest = m[1]; }
    const name = rest.trim();
    if (!name) return null;
    return { name, cc, selected };
  }

  // Match a menu row to one of our tracks. Compares the display name Netflix
  // renders, preferring the variant whose CC flag agrees. Returns null for rows
  // with no matching track -- which is how the "Off" row is skipped in every
  // interface language, without hard-coding the word.
  function matchTrackByMenu(tracks, info) {
    if (!Array.isArray(tracks) || !info || !info.name) return null;
    const norm = (x) => String(x == null ? '' : x).trim().toLowerCase();
    const want = norm(info.name);
    const cands = tracks.filter(
      (t) => t && (norm(t.displayName) === want || norm(t.label) === want));
    if (!cands.length) return null;
    return cands.find((t) => !!t.cc === !!info.cc) || cands[0];
  }

  const exp = {
    parseMenuUia, matchTrackByMenu,
    parseVTT, parseTTML, parseSubtitle, textAt,
    parseTime, ttmlTime, stripTags, decodeEntities,
    textFromNode, cleanNative,
  };
  root.SubNFVTT = exp;
  if (typeof module !== 'undefined' && module.exports) module.exports = exp;
})();
