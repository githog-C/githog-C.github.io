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

  // ---- asking Netflix for WebVTT in the first place ----------------------
  // The manifest only OFFERS the formats the player asked for. The player no
  // longer asks for WebVTT by itself, so we add it to the request's
  // "profiles" array from inside a JSON.stringify hook (installed further
  // down, browser-only). Netflix renames the properties around that array
  // often, so — like current Subadub — we do not hard-code a path to it; we
  // recognise it, either by its key or by the well-known profile names it
  // contains.
  const WEBVTT_PROFILE = 'webvtt-lssdh-ios8';
  const KNOWN_PROFILES = [
    'heaac-2-dash', 'heaac-2hq-dash',
    'playready-h264mpl30-dash', 'playready-h264mpl31-dash',
    'playready-h264hpl30-dash', 'playready-h264hpl31-dash',
    'vp9-profile0-L30-dash-cenc', 'vp9-profile0-L31-dash-cenc',
    'dfxp-ls-sdh', 'simplesdh', 'nflx-cmisc', 'BIF240', 'BIF320',
  ];

  // Pure: find the "profiles" array anywhere inside a request object.
  // Bounded (depth + node budget) and cycle-safe on purpose: this runs inside
  // a JSON.stringify hook, i.e. for EVERY stringify the page ever does.
  function findProfilesArray(obj, seen, depth, budget) {
    if (!obj || typeof obj !== 'object') return null;
    seen = seen || new Set();
    depth = (depth == null) ? 8 : depth;
    budget = budget || { n: 2000 };
    if (depth < 0 || budget.n-- <= 0 || seen.has(obj)) return null;
    seen.add(obj);
    for (const key of Object.keys(obj)) {
      let v;
      try { v = obj[key]; } catch (_) { continue; }
      if (Array.isArray(v)) {
        if (key === 'profiles'
          || v.some((x) => typeof x === 'string' && KNOWN_PROFILES.indexOf(x) !== -1)) {
          return v;
        }
        for (const item of v) {
          if (item && typeof item === 'object') {
            const hit = findProfilesArray(item, seen, depth - 1, budget);
            if (hit) return hit;
          }
        }
      } else if (v && typeof v === 'object') {
        const hit = findProfilesArray(v, seen, depth - 1, budget);
        if (hit) return hit;
      }
    }
    return null;
  }

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
          id: String(t.new_track_id || t.id || t.trackId || t.track_id || (language + ':' + rawType)),
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
  // Netflix renamed the manifest fields (observed 2025/26 and confirmed
  // against current Subadub): `timedtexttracks` -> `textTracks`,
  // `ttDownloadables` -> `downloadables`, `new_track_id` -> `id`. Accept both
  // generations — the old names cost nothing to keep.
  function tracksFromManifest(result) {
    if (!result || !result.movieId) return [];
    const list = Array.isArray(result.textTracks) ? result.textTracks
      : Array.isArray(result.timedtexttracks) ? result.timedtexttracks
        : null;
    if (!list) return [];
    return normaliseTracks(list);
  }

  // inject.js runs in the PAGE world, where it cannot see the isolated world's
  // globals -- and loading src/hosts.js into the page instead would let page
  // scripts redefine it. So it keeps its own closure-private copy, and
  // run-tests.js asserts the two agree on a table of hosts.
  function isNetflixHost(url) {
    if (typeof url !== 'string' || !url) return false;
    let u;
    try { u = new URL(url); } catch (_) { return false; }
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return ['nflxvideo.net', 'nflxext.com', 'nflximg.net', 'nflxso.net', 'netflix.com']
      .some((d) => host === d || host.endsWith('.' + d));
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pickUrl, pickFormat, normaliseTracks, tracksFromManifest, findProfilesArray, isNetflixHost };
  }
  if (!isBrowser) return; // under Node (tests) we stop here

  if (window.__subnfInjected) return;   // MAIN-world content script and the
  window.__subnfInjected = true;        // injected <script> both land here

  const seen = new Set();
  const diag = { manifest: 0, playerApi: 0, json: 0, response: 0, xhr: 0, profiles: 0 };

  // ---- forced-narrative flags -------------------------------------------
  // Only the player API spells this flag "isForcedNarrative". Out of a
  // manifest it arrives under some other name, so every track lands
  // forced:false and resolveTrack's forced-narrative penalty never fires. On
  // an originally-Chinese title that is not cosmetic: Netflix lists the forced
  // track FIRST, labels it "Off", and gives it the same bcp47 as the real
  // subtitles, so the renderer settles on five or six signage cues instead of
  // the dialogue. The API lives in this world -- ask it rather than guess at
  // the manifest's spelling.
  function forcedById() {
    const map = new Map();
    eachPlayer((p) => {
      for (const t of (trackListOf(p) || [])) {
        try {
          const id = String(t.new_track_id || t.id || t.trackId || t.track_id || '');
          if (id) map.set(id, !!t.isForcedNarrative);
        } catch (_) { /* one bad track must never lose the rest */ }
      }
    });
    return map;
  }

  // Fills in what the API knows. Returns whether it knew anything at all, so
  // the caller can tell "nothing is forced" from "nobody has told us yet".
  function repairForced(tracks) {
    const map = forcedById();
    if (!map.size) return false;
    let answered = false;
    for (const t of tracks) {
      const known = map.get(String(t.id));
      if (known === undefined) continue;
      answered = true;
      if (known) t.forced = true;
    }
    return answered;
  }

  // The manifest is usually parsed before the player exists, and the content
  // script stops polling as soon as it holds any catalogue at all -- so an
  // unflagged first answer would never be corrected. Follow it up from here
  // instead, and publish again once the API can speak.
  let recheck = 0;
  function recheckForced(movieId, tracks, source) {
    if (recheck) return;
    let tries = 0;
    recheck = setInterval(() => {
      tries += 1;
      const copy = tracks.map((t) => ({ ...t }));
      const done = repairForced(copy);
      if (done || tries >= 30) {            // ~15s, then give up quietly
        clearInterval(recheck);
        recheck = 0;
        if (done) send(movieId, copy, source + '+forced');
      }
    }, 500);
  }

  function send(movieId, tracks, source) {
    if (!tracks || !tracks.length) return false;
    const answered = repairForced(tracks);
    // The flags are part of the key: the same tracks described a second time,
    // now with forced-narrative marked, is a better answer and not a duplicate.
    const key = String(movieId) + ':' + tracks.map((t) => t.id + (t.forced ? '!' : '')).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    window.postMessage({
      __subnf: true, dir: 'page', kind: 'tracks',
      movieId: String(movieId), tracks, source,
    }, '*');
    if (!answered) recheckForced(movieId, tracks, source);
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
    const looksLikeManifest = (o) => !!(o && o.movieId
      && (Array.isArray(o.timedtexttracks) || Array.isArray(o.textTracks)));
    let result = null;
    if (looksLikeManifest(value.result)) result = value.result;
    else if (looksLikeManifest(value)) result = value;
    if (!result) return;
    const tracks = tracksFromManifest(result);
    if (!tracks.length) return;
    diag.manifest++;
    diag[source] = (diag[source] || 0) + 1;
    send(result.movieId, tracks, source);
  }

  // Outbound: put WebVTT on the manifest request's shopping list. Without
  // this the manifest never OFFERS a WebVTT downloadable, and (post-2025
  // schema) may offer nothing parseable at all.
  const _stringify = JSON.stringify;
  JSON.stringify = function (value) {
    try {
      if (value && typeof value === 'object') {
        const profiles = findProfilesArray(value);
        if (profiles && profiles.indexOf(WEBVTT_PROFILE) === -1) {
          profiles.unshift(WEBVTT_PROFILE);
          diag.profiles++;
        }
      }
    } catch (_) { /* never break the site */ }
    return _stringify.apply(this, arguments);
  };

  // Inbound: watch every JSON.parse for something manifest-shaped.
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
            if (typeof s === 'string' && s.indexOf('movieId') !== -1
              && (s.indexOf('timedtexttracks') !== -1 || s.indexOf('"textTracks"') !== -1)) {
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
            if (typeof s === 'string' && s.indexOf('movieId') !== -1
              && (s.indexOf('timedtexttracks') !== -1 || s.indexOf('"textTracks"') !== -1)) {
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
    if (d.kind === 'fetch' && isNetflixHost(d.url)) {
      fetch(d.url, { credentials: 'omit' })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((text) => window.postMessage({ __subnf: true, dir: 'page', kind: 'vtt', id: d.id, ok: true, text }, '*'))
        .catch((err) => window.postMessage({ __subnf: true, dir: 'page', kind: 'vtt', id: d.id, ok: false, error: String(err && err.message || err) }, '*'));
      return;
    }
  });
})();
