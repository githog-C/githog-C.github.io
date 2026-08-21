// sub-NF — page-world hook (runs in Netflix's own JS context).
//
// Job: get the list of subtitle tracks Netflix has for the title playing now,
// each with a downloadable URL. We never touch video, audio, or DRM — only the
// caption metadata Netflix already ships to the browser to draw subtitles.
//
// There is no single reliable way to get that list, so we try FOUR and take
// whichever answers first:
//
//   1. netflix.appContext … getTimedTextTrackList()  — the player's own API.
//   2. JSON.parse hook — Netflix parses its player manifest through it.
//   3. Response.prototype.json / .text hooks.
//   4. XMLHttpRequest load hook.
//
// Paths 2-4 only see main-thread parsing, and the manifest goes by ONCE: miss
// it and it is gone. Whatever we capture is therefore cached by the content
// script rather than re-requested.
//
// The pure parts are exported under Node for unit tests; the hooks only install
// inside a real page.
(() => {
  'use strict';
  const isBrowser = (typeof window !== 'undefined' && typeof document !== 'undefined');

  // Preference order. Anything WebVTT-ish first (plain text, trivial to parse),
  // then the TTML family — some tracks, notably CLOSEDCAPTIONS, offer no WebVTT
  // variant at all, and dropping them is why whole languages went missing.
  const EXACT_FORMATS = ['webvtt-lssdh-ios8', 'webvtt'];
  const FUZZY_FORMATS = [/webvtt/i, /imsc/i, /dfxp/i, /ttml/i, /simplesdh/i];

  function pickUrl(downloadable) {
    if (!downloadable) return null;
    const urls = downloadable.urls || downloadable.downloadUrls;
    if (Array.isArray(urls)) {
      for (const u of urls) {
        if (!u) continue;
        if (typeof u === 'string') return u;
        if (u.url) return u.url;
      }
    } else if (urls && typeof urls === 'object') {
      for (const v of Object.values(urls)) {
        if (typeof v === 'string') return v;
        if (v && v.url) return v.url;
      }
    }
    return null;
  }

  // Find the best downloadable on one track: exact preferred keys, then any key
  // whose name looks like a format we can parse.
  function pickFormat(dls) {
    if (!dls || typeof dls !== 'object') return null;
    for (const f of EXACT_FORMATS) {
      if (dls[f]) {
        const u = pickUrl(dls[f]);
        if (u) return { url: u, fmt: f };
      }
    }
    const keys = Object.keys(dls);
    for (const rx of FUZZY_FORMATS) {
      for (const k of keys) {
        if (!rx.test(k)) continue;
        const u = pickUrl(dls[k]);
        if (u) return { url: u, fmt: k };
      }
    }
    return null;
  }

  // Pure: normalise a list of Netflix timed-text track objects.
  //
  // Two things here are load-bearing, both learned the hard way:
  //   * Track types arrive UPPERCASE in real manifests (SUBTITLES,
  //     CLOSEDCAPTIONS) but lowercase elsewhere — always compare lowercased,
  //     and accept both kinds rather than only "subtitles".
  //   * The try/catch is PER TRACK. It used to sit outside the loop, so one
  //     malformed track threw and silently zeroed the entire batch — which left
  //     the renderer with no cues at all.
  function normaliseTracks(list) {
    const tracks = [];
    if (!Array.isArray(list)) return tracks;
    for (const t of list) {
      try {
        if (!t || t.isNoneTrack) continue;
        const rawType = String(t.rawTrackType || t.trackType || 'subtitles').toLowerCase();
        if (rawType === 'none') continue;
        const found = pickFormat(t.ttDownloadables || t.downloadables);
        if (!found) continue;
        const language = t.language || t.bcp47 || 'und';
        const cc = rawType.indexOf('closedcaption') !== -1
          || rawType === 'assistive'
          || String(t.trackType || '').toLowerCase() === 'assistive';
        tracks.push({
          // Netflix's own id: same language can appear twice (CC + SUBTITLES),
          // so a language-derived key would collide.
          id: String(t.new_track_id || t.trackId || t.track_id || (language + ':' + rawType)),
          language,
          label: t.languageDescription || t.displayName || language,
          // What Netflix renders in its own Audio & Subtitles menu.
          displayName: String(t.displayName || t.languageDescription || language),
          type: rawType,
          cc: !!cc,
          forced: !!t.isForcedNarrative,
          url: found.url,
          fmt: found.fmt,
        });
      } catch (_) { /* one bad track must never lose the rest */ }
    }
    return tracks;
  }

  // Pure: given a Netflix manifest "result", return its subtitle tracks.
  function tracksFromManifest(result) {
    if (!result || !result.movieId || !Array.isArray(result.timedtexttracks)) return [];
    return normaliseTracks(result.timedtexttracks);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pickUrl, pickFormat, normaliseTracks, tracksFromManifest };
  }
  if (!isBrowser) return; // under Node (tests) we stop here

  if (window.__subnfInjected) return;   // MAIN-world content script and the
  window.__subnfInjected = true;        // injected <script> both land here

  const seen = new Set();
  const diag = { manifest: 0, playerApi: 0, json: 0, response: 0, xhr: 0 };

  function send(movieId, tracks, source) {
    if (!tracks || !tracks.length) return false;
    const key = String(movieId) + ':' + tracks.map((t) => t.id).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    window.postMessage({
      __subnf: true, dir: 'page', kind: 'tracks',
      movieId: String(movieId), tracks, source,
    }, '*');
    return true;
  }

  // ---------- path 1: the player's own API ----------
  function videoPlayerApi() {
    try {
      const app = window.netflix
        && window.netflix.appContext
        && window.netflix.appContext.state
        && window.netflix.appContext.state.playerApp;
      const nfApi = app && app.getAPI && app.getAPI();
      return (nfApi && nfApi.videoPlayer) || null;
    } catch (_) { return null; }
  }

  function eachPlayer(fn) {
    const vp = videoPlayerApi();
    if (!vp || !vp.getAllPlayerSessionIds || !vp.getVideoPlayerBySessionId) return;
    let ids = [];
    try { ids = vp.getAllPlayerSessionIds() || []; } catch (_) { return; }
    for (const sid of ids) {
      let p = null;
      try { p = vp.getVideoPlayerBySessionId(sid); } catch (_) { continue; }
      if (p) { try { fn(p, sid); } catch (_) {} }
    }
  }

  function trackListOf(p) {
    try {
      return (p.getTimedTextTrackList && p.getTimedTextTrackList())
        || (p.getTimedTextTracks && p.getTimedTextTracks())
        || null;
    } catch (_) { return null; }
  }

  function currentMovieId() {
    let id = null;
    eachPlayer((p) => {
      if (id) return;
      try { if (p.getMovieId) id = String(p.getMovieId()); } catch (_) {}
    });
    return id;
  }

  function harvestFromPlayerApi() {
    let found = false;
    eachPlayer((p) => {
      const tracks = normaliseTracks(trackListOf(p));
      if (!tracks.length) return;
      let mid = null;
      try { mid = p.getMovieId ? String(p.getMovieId()) : null; } catch (_) {}
      if (!mid) return;
      diag.playerApi = tracks.length;
      if (send(mid, tracks, 'playerApi')) found = true;
    });
    return found;
  }

  // ---------- paths 2-4: watch anything that looks like a manifest ----------
  function scan(value, source) {
    if (!value || typeof value !== 'object') return;
    let result = null;
    if (value.result && value.result.timedtexttracks) result = value.result;
    else if (value.timedtexttracks && value.movieId) result = value;
    if (!result) return;
    const tracks = tracksFromManifest(result);
    if (!tracks.length) return;
    diag.manifest++;
    diag[source] = (diag[source] || 0) + 1;
    send(result.movieId, tracks, source);
  }

  const _parse = JSON.parse;
  JSON.parse = function () {
    const val = _parse.apply(this, arguments);
    try { scan(val, 'json'); } catch (_) { /* never break the site */ }
    return val;
  };

  try {
    const RP = window.Response && window.Response.prototype;
    if (RP && RP.json) {
      const _json = RP.json;
      RP.json = function () {
        return _json.apply(this, arguments).then((v) => {
          try { scan(v, 'response'); } catch (_) {}
          return v;
        });
      };
    }
    if (RP && RP.text) {
      const _text = RP.text;
      RP.text = function () {
        return _text.apply(this, arguments).then((s) => {
          try {
            if (typeof s === 'string' && s.indexOf('timedtexttracks') !== -1) {
              scan(_parse(s), 'response');
            }
          } catch (_) {}
          return s;
        });
      };
    }
  } catch (_) { /* ignore */ }

  try {
    const XP = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (XP && XP.send) {
      const _send = XP.send;
      XP.send = function () {
        this.addEventListener('load', () => {
          try {
            const t = this.responseType;
            if (t === 'json') { scan(this.response, 'xhr'); return; }
            if (t && t !== 'text') return;
            const s = this.responseText;
            if (typeof s === 'string' && s.indexOf('timedtexttracks') !== -1) {
              scan(_parse(s), 'xhr');
            }
          } catch (_) {}
        });
        return _send.apply(this, arguments);
      };
    }
  } catch (_) { /* ignore */ }

  // ---------- requests from the content script ----------
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.__subnf !== true || d.dir !== 'content') return;

    if (d.kind === 'poll') {
      harvestFromPlayerApi();
      window.postMessage({
        __subnf: true, dir: 'page', kind: 'status',
        movieId: currentMovieId(),
        hasPlayerApi: !!videoPlayerApi(),
        diag,
      }, '*');
      return;
    }

    // Genuinely switch Netflix's own subtitles off, via the player's own API,
    // by selecting its "none" track. Our cues are already downloaded and keyed
    // to the video clock, so they keep working with the native track off --
    // which is the entire point.
    if (d.kind === 'nativeOff') {
      eachPlayer((p) => {
        const list = trackListOf(p) || [];
        const none = list.find((t) => t && t.isNoneTrack);
        if (none && p.setTimedTextTrack) p.setTimedTextTrack(none);
      });
      return;
    }

    // Fetch a subtitle file in Netflix's own origin. The content script tries
    // the background worker first and only asks us if that route failed.
    if (d.kind === 'fetch' && typeof d.url === 'string') {
      fetch(d.url, { credentials: 'omit' })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((text) => window.postMessage({ __subnf: true, dir: 'page', kind: 'vtt', id: d.id, ok: true, text }, '*'))
        .catch((err) => window.postMessage({ __subnf: true, dir: 'page', kind: 'vtt', id: d.id, ok: false, error: String(err && err.message || err) }, '*'));
      return;
    }
  });
})();
