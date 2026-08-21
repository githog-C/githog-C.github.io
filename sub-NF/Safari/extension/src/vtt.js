// sub-NF — WebVTT parsing, isolated so it can be unit-tested outside a browser.
// Exposes globalThis.SubNFVTT = { parseVTT, textAt, parseTime, stripTags }.
// Also exports via CommonJS when loaded under Node (for tests).
(() => {
  'use strict';
  const root = (typeof self !== 'undefined') ? self
    : (typeof globalThis !== 'undefined') ? globalThis : this;

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

  function safeCP(n) { try { return String.fromCodePoint(n); } catch (_) { return ''; } }

  function stripTags(t) {
    return t
      .replace(/<[^>]+>/g, '')                       // <i>, <c...>, <v ...>, inline timestamps
      .replace(/\{[^}]*\}/g, '')                     // stray {style} blocks
      .replace(/[‎‏]/g, '')                // LRM / RLM marks
      .replace(/&lrm;|&rlm;/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#(\d+);/g, (_, n) => safeCP(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => safeCP(parseInt(n, 16)))
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  function parseVTT(text) {
    const cues = [];
    if (!text || typeof text !== 'string') return cues;
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const blocks = text.split(/\n{2,}/);
    for (const block of blocks) {
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

  // Read the text out of one of Netflix's own rendered caption nodes.
  // Netflix puts each caption line in a nested <span>, and a line break is a
  // <br> *inside* the following span, so textContent alone glues the lines
  // together. Walk the tree instead and turn <br> into a newline.
  // Pure: only uses nodeType / nodeValue / tagName / childNodes, so it can be
  // tested with a plain object tree under Node.
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

  // Tidy the result of textFromNode into displayable caption text.
  function cleanNative(s) {
    return String(s || '')
      .replace(/ /g, ' ')
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length)
      .join('\n');
  }

  const exp = { parseVTT, textAt, parseTime, stripTags, textFromNode, cleanNative };
  root.SubNFVTT = exp;
  if (typeof module !== 'undefined' && module.exports) module.exports = exp;
})();
