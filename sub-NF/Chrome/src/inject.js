// sub-NF — page-world hook (runs in Netflix's own JS context).
//
// Netflix asks its player-config service for a "manifest" that, among other
// things, lists every timed-text (subtitle / CC) track for a title together
// with signed download URLs for each format. The web player parses that
// manifest with JSON.parse. We wrap JSON.parse, watch for anything shaped like
// a manifest, and forward just the subtitle track list (language + label +
// WebVTT download URL) to the content script via window.postMessage.
//
// We do NOT touch video, audio, DRM, or licences — only the subtitle track
// metadata Netflix already ships to the browser to render captions.
//
// The pure parts (pickUrl, tracksFromManifest) are exported under Node for
// unit tests; the JSON.parse hook only installs inside a real page.
(() => {
  'use strict';
  const isBrowser = (typeof window !== 'undefined');

  // Only WebVTT is worth grabbing: it is plain text and trivial to parse.
  const FORMATS = ['webvtt-lssdh-ios8', 'webvtt'];

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

  // Pure: given a Netflix manifest "result", return normalised subtitle tracks.
  function tracksFromManifest(result) {
    const movieId = result && result.movieId;
    const list = result && result.timedtexttracks;
    if (!movieId || !Array.isArray(list)) return [];
    const tracks = [];
    for (const t of list) {
      if (!t || t.isNoneTrack) continue;
      const dls = t.ttDownloadables || {};
      let url = null, fmt = null;
      for (const f of FORMATS) {
        if (dls[f]) {
          const u = pickUrl(dls[f]);
          if (u) { url = u; fmt = f; break; }
        }
      }
      if (!url) continue;
      const type = t.rawTrackType || t.trackType || 'subtitles';
      tracks.push({
        id: String(t.new_track_id || t.track_id || (t.language + ':' + type)),
        language: t.language || 'und',
        label: t.languageDescription || t.language || 'Unknown',
        type,
        cc: type === 'closedcaptions' || t.rawTrackType === 'closedcaptions',
        forced: !!t.isForcedNarrative,
        url,
        fmt,
      });
    }
    return tracks;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pickUrl, tracksFromManifest };
  }
  if (!isBrowser) return; // under Node (tests) we stop here

  if (window.__subnfInjected) return;
  window.__subnfInjected = true;

  function emit(result) {
    const movieId = result && result.movieId;
    const tracks = tracksFromManifest(result);
    if (tracks.length) {
      window.postMessage(
        { __subnf: true, dir: 'page', kind: 'tracks', movieId: String(movieId), tracks },
        '*'
      );
    }
  }

  const _parse = JSON.parse;
  JSON.parse = function () {
    const val = _parse.apply(this, arguments);
    try {
      if (val && typeof val === 'object') {
        if (val.result && val.result.timedtexttracks) emit(val.result);
        else if (val.timedtexttracks && val.movieId) emit(val);
      }
    } catch (_) { /* never let our hook break the site */ }
    return val;
  };

  // Best-effort: answer "which movie is actually on screen right now?" by
  // asking Netflix's player registry. Falls back to null; the content script
  // then uses the /watch/<id> URL or the most recently seen manifest.
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.__subnf !== true || d.dir !== 'content' || d.kind !== 'whichMovie') return;
    let id = null;
    try {
      const app = window.netflix
        && window.netflix.appContext
        && window.netflix.appContext.state
        && window.netflix.appContext.state.playerApp;
      const nfApi = app && app.getAPI && app.getAPI();
      const vp = nfApi && nfApi.videoPlayer;
      if (vp && vp.getAllPlayerSessionIds && vp.getVideoPlayerBySessionId) {
        const ids = vp.getAllPlayerSessionIds() || [];
        const sid = ids.find((s) => /watch|main/i.test(String(s))) || ids[0];
        const player = sid && vp.getVideoPlayerBySessionId(sid);
        if (player && player.getMovieId) id = String(player.getMovieId());
      }
    } catch (_) { /* ignore */ }
    window.postMessage({ __subnf: true, dir: 'page', kind: 'movieId', movieId: id }, '*');
  });
})();
