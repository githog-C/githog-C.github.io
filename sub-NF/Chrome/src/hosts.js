// sub-NF — which URLs this extension is willing to touch. Isolated so it can be
// unit-tested outside a browser. Exposes globalThis.SubNFHosts; also exports via
// CommonJS under Node (for tests).
//
// The track catalogue arrives over window.postMessage from the page world, and
// that channel cannot be authenticated: any script running on the Netflix page
// can forge a message. Nothing dangerous depends on it -- cue text reaches the
// DOM through createTextNode, never innerHTML -- but a forged catalogue would
// otherwise choose which URLs we fetch, and would be written to storage and
// persist there. So the allowlist is applied at INGEST, before anything is
// stored or fetched, rather than only at the fetch itself.
(() => {
  'use strict';
  const root = (typeof self !== 'undefined') ? self
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  // Caption files come from the Open Connect CDN, whose exact host varies by
  // ISP and region, so whole families are allowed rather than single names.
  const DOMAINS = ['nflxvideo.net', 'nflxext.com', 'nflximg.net', 'nflxso.net', 'netflix.com'];

  // Anchored on both ends: an exact match, or a dot-prefixed suffix. Plain
  // "endsWith" would accept evil-netflix.com, and an unanchored regex would
  // accept netflix.com.attacker.io.
  function isNetflixHost(url) {
    if (typeof url !== 'string' || !url) return false;
    let u;
    try { u = new URL(url); } catch (_) { return false; }
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  }

  // Netflix movie ids are numeric. Anything else is not something we asked for,
  // and it ends up as a storage key, so keep it boring.
  function isMovieId(id) {
    return /^\d{1,12}$/.test(String(id == null ? '' : id));
  }

  const MAX_TRACKS = 100;

  // Drop anything that could not have come from Netflix. Returns a fresh array,
  // so a caller can never accidentally keep a reference to the raw input.
  function sanitiseTracks(tracks) {
    if (!Array.isArray(tracks)) return [];
    const out = [];
    for (const t of tracks) {
      if (!t || typeof t !== 'object') continue;
      if (!isNetflixHost(t.url)) continue;
      out.push({
        id: String(t.id == null ? '' : t.id).slice(0, 200),
        language: String(t.language == null ? '' : t.language).slice(0, 40),
        label: String(t.label == null ? '' : t.label).slice(0, 200),
        cc: !!t.cc,
        url: t.url,
      });
      if (out.length >= MAX_TRACKS) break;
    }
    return out;
  }

  const exp = { DOMAINS, isNetflixHost, isMovieId, sanitiseTracks, MAX_TRACKS };
  root.SubNFHosts = exp;
  if (typeof module !== 'undefined' && module.exports) module.exports = exp;
})();
