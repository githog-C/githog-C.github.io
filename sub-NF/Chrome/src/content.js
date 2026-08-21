// sub-NF — content script (isolated world).
//
// Responsibilities:
//   1. Inject the page-world hook (inject.js) so we can capture subtitle tracks.
//   2. Keep a per-title catalogue of available WebVTT tracks.
//   3. Resolve the two languages the user picked, download + parse their WebVTT.
//   4. Render a two-line overlay kept in sync with the <video> clock.
//   5. Talk to the popup (report state, apply new settings).
//
// It never reads video/audio/DRM. Subtitle text is used only to render on the
// page the user is already watching; nothing is stored or sent anywhere.
(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api || !api.runtime || !api.runtime.id) return;

  const DEFAULTS = {
    enabled: true,
    primaryLang: 'en',
    secondaryLang: 'zh-Hant',
    hideNative: true,
    preferCC: false,
    fontScale: 1.0,     // multiplier on the base overlay font size
    bottomVh: 12,       // overlay distance from the bottom, in vh
    gap: 4,             // px between the two lines
    primaryOffsetMs: 0,
    secondaryOffsetMs: 0,
    swapOrder: false,   // false: primary on top; true: secondary on top
  };

  let settings = { ...DEFAULTS };
  const catalogues = new Map();   // movieId -> tracks[]
  let lastMovieId = null;         // most recently seen manifest
  let currentMovieId = null;      // what we believe is playing
  const vttCache = new Map();     // url -> Promise<cues[]>

  const active = {                // resolved, loaded tracks for current title
    primary: { url: null, cues: [], idx: -1 },
    secondary: { url: null, cues: [], idx: -1 },
  };

  // ---------- 1. inject page hook ----------
  function injectPageHook() {
    try {
      const s = document.createElement('script');
      s.src = api.runtime.getURL('src/inject.js');
      s.async = false;
      (document.head || document.documentElement).appendChild(s);
      s.addEventListener('load', () => s.remove());
    } catch (_) { /* ignore */ }
  }
  injectPageHook();

  // ---------- messaging with the page hook ----------
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__subnf !== true || d.dir !== 'page') return;
    if (d.kind === 'tracks') {
      catalogues.set(d.movieId, d.tracks);
      lastMovieId = d.movieId;
      // If this is (or becomes) the current title, (re)resolve.
      if (!currentMovieId || d.movieId === currentMovieId) {
        currentMovieId = currentMovieId || d.movieId;
        resolveAndLoad();
      }
      broadcastStateToPopup();
    } else if (d.kind === 'movieId' && d.movieId) {
      if (d.movieId !== currentMovieId && catalogues.has(d.movieId)) {
        currentMovieId = d.movieId;
        resolveAndLoad();
      }
    } else if (d.kind === 'vtt') {
      const cb = pageFetchPending.get(d.id);
      if (cb) cb(d);
    }
  });

  function askPageForMovie() {
    window.postMessage({ __subnf: true, dir: 'content', kind: 'whichMovie' }, '*');
  }

  // ---------- 2/3. resolve languages and load WebVTT ----------
  function movieIdFromUrl() {
    const m = location.pathname.match(/\/watch\/(\d+)/);
    return m ? m[1] : null;
  }

  function currentCatalogue() {
    const id = currentMovieId || movieIdFromUrl() || lastMovieId;
    if (id && catalogues.has(id)) { currentMovieId = id; return catalogues.get(id); }
    // Fall back to the most recent manifest we saw.
    if (lastMovieId && catalogues.has(lastMovieId)) { currentMovieId = lastMovieId; return catalogues.get(lastMovieId); }
    return null;
  }

  function langMatches(track, wanted) {
    if (!wanted) return false;
    const a = String(track.language || '').toLowerCase();
    const b = String(wanted).toLowerCase();
    if (a === b) return true;
    // base-language fallback: "zh" matches "zh-hant", "pt" matches "pt-br"
    const baseA = a.split('-')[0], baseB = b.split('-')[0];
    return baseA === baseB;
  }

  function resolveTrack(tracks, wanted) {
    if (!tracks || !wanted) return null;
    const cands = tracks.filter((t) => langMatches(t, wanted));
    if (!cands.length) return null;
    const score = (t) => {
      let s = 0;
      if (String(t.language).toLowerCase() === String(wanted).toLowerCase()) s += 100; // exact code
      if (t.forced) s -= 50;                                   // avoid forced-narrative
      if (settings.preferCC ? t.cc : !t.cc) s += 10;           // honour CC preference
      return s;
    };
    return cands.slice().sort((a, b) => score(b) - score(a))[0];
  }

  // Two ways to fetch a subtitle file:
  //   1. the background worker (host_permissions, no page CORS) — preferred;
  //   2. failing that, the page hook fetches it in Netflix's own origin.
  // Whichever returns text first wins.
  let fetchSeq = 0;
  const pageFetchPending = new Map(); // id -> resolver

  function bgFetch(url) {
    return new Promise((resolve) => {
      let settled = false;
      try {
        api.runtime.sendMessage({ type: 'subnf-fetch', url }, (resp) => {
          if (settled) return; settled = true;
          if (api.runtime.lastError || !resp || !resp.ok) resolve(null);
          else resolve(resp.text);
        });
      } catch (_) { resolve(null); }
    });
  }

  function pageFetch(url) {
    return new Promise((resolve) => {
      const id = 'f' + (++fetchSeq);
      let done = false;
      const timer = setTimeout(() => {
        if (done) return; done = true; pageFetchPending.delete(id); resolve('');
      }, 15000);
      pageFetchPending.set(id, (msg) => {
        if (done) return; done = true; clearTimeout(timer); pageFetchPending.delete(id);
        resolve(msg && msg.ok ? msg.text : '');
      });
      window.postMessage({ __subnf: true, dir: 'content', kind: 'fetch', id, url }, '*');
    });
  }

  function fetchVtt(url) {
    if (vttCache.has(url)) return vttCache.get(url);
    const p = (async () => {
      let text = await bgFetch(url);
      if (text == null) text = await pageFetch(url); // fallback in page context
      return parseVTT(text || '');
    })();
    vttCache.set(url, p);
    return p;
  }

  async function resolveAndLoad() {
    const tracks = currentCatalogue();
    if (!tracks) return;
    const pTrack = resolveTrack(tracks, settings.primaryLang);
    const sTrack = resolveTrack(tracks, settings.secondaryLang);

    if (pTrack && pTrack.url !== active.primary.url) {
      active.primary = { url: pTrack.url, cues: [], idx: -1 };
      active.primary.cues = await fetchVtt(pTrack.url);
      active.primary.idx = -1;
    } else if (!pTrack) {
      active.primary = { url: null, cues: [], idx: -1 };
    }

    if (sTrack && sTrack.url !== active.secondary.url) {
      active.secondary = { url: sTrack.url, cues: [], idx: -1 };
      active.secondary.cues = await fetchVtt(sTrack.url);
      active.secondary.idx = -1;
    } else if (!sTrack) {
      active.secondary = { url: null, cues: [], idx: -1 };
    }
    render(true);
  }

  // ---------- WebVTT parsing (from src/vtt.js, listed before this file) ----------
  const VTT = globalThis.SubNFVTT || { parseVTT: () => [], textAt: () => '' };
  const parseVTT = VTT.parseVTT;
  const textAt = VTT.textAt;

  // ---------- 4. overlay ----------
  let overlay = null, lineTop = null, lineBottom = null, styleEl = null, hideStyleEl = null;
  let lastTopText = '', lastBottomText = '';

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'subnf-overlay';
    overlay.setAttribute('data-subnf', '');
    lineTop = document.createElement('div');
    lineTop.className = 'subnf-line subnf-top';
    lineBottom = document.createElement('div');
    lineBottom.className = 'subnf-line subnf-bottom';
    overlay.appendChild(lineTop);
    overlay.appendChild(lineBottom);
    applyStyleVars();
    mount();
    return overlay;
  }

  function mountTarget() {
    return document.fullscreenElement
      || document.querySelector('.watch-video')
      || document.querySelector('[data-uia="player"]')
      || document.querySelector('.nfp')
      || document.body;
  }

  function mount() {
    if (!overlay) return;
    const target = mountTarget();
    if (overlay.parentElement !== target) target.appendChild(overlay);
  }

  function applyStyleVars() {
    if (!overlay) return;
    overlay.style.setProperty('--subnf-bottom', settings.bottomVh + 'vh');
    overlay.style.setProperty('--subnf-scale', String(settings.fontScale));
    overlay.style.setProperty('--subnf-gap', settings.gap + 'px');
    // order
    if (settings.swapOrder) {
      lineTop.style.order = '2';
      lineBottom.style.order = '1';
    } else {
      lineTop.style.order = '1';
      lineBottom.style.order = '2';
    }
  }

  function ensureHideStyle() {
    if (settings.enabled && settings.hideNative) {
      if (!hideStyleEl) {
        hideStyleEl = document.createElement('style');
        hideStyleEl.id = 'subnf-hide-native';
        hideStyleEl.textContent = '.player-timedtext{display:none !important;}';
        (document.head || document.documentElement).appendChild(hideStyleEl);
      }
    } else if (hideStyleEl) {
      hideStyleEl.remove();
      hideStyleEl = null;
    }
  }

  function setLine(el, text) {
    el.textContent = '';
    if (!text) { el.style.display = 'none'; return; }
    el.style.display = '';
    const parts = text.split('\n');
    parts.forEach((p, i) => {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(p));
    });
  }

  function render(force) {
    if (!settings.enabled) { teardownOverlay(); return; }
    ensureHideStyle();
    const video = document.querySelector('.watch-video video') || document.querySelector('video');
    if (!video) return;
    ensureOverlay();
    mount();

    const t = video.currentTime;
    const topCues = settings.swapOrder ? active.secondary : active.primary;
    const botCues = settings.swapOrder ? active.primary : active.secondary;
    const topOff = (settings.swapOrder ? settings.secondaryOffsetMs : settings.primaryOffsetMs) / 1000;
    const botOff = (settings.swapOrder ? settings.primaryOffsetMs : settings.secondaryOffsetMs) / 1000;

    const topText = textAt(topCues.cues, t - topOff);
    const botText = textAt(botCues.cues, t - botOff);
    if (force || topText !== lastTopText) { setLine(lineTop, topText); lastTopText = topText; }
    if (force || botText !== lastBottomText) { setLine(lineBottom, botText); lastBottomText = botText; }
  }

  function teardownOverlay() {
    if (overlay) { overlay.remove(); overlay = null; lineTop = lineBottom = null; lastTopText = lastBottomText = ''; }
    if (hideStyleEl) { hideStyleEl.remove(); hideStyleEl = null; }
  }

  // rAF render loop
  let rafOn = false;
  function loop() {
    try { render(false); } catch (_) {}
    if (rafOn) requestAnimationFrame(loop);
  }
  function startLoop() { if (!rafOn) { rafOn = true; requestAnimationFrame(loop); } }

  document.addEventListener('fullscreenchange', () => { if (overlay) mount(); });

  // ---------- 5. popup messaging ----------
  function availableLanguages() {
    const tracks = currentCatalogue() || [];
    const seen = new Map();
    for (const t of tracks) {
      const key = t.language;
      if (!seen.has(key)) seen.set(key, { language: t.language, label: t.label, cc: !!t.cc });
      else if (t.cc) seen.get(key).cc = true;
    }
    return [...seen.values()];
  }

  function stateForPopup() {
    return {
      type: 'subnf-state',
      settings,
      onWatch: /\/watch\/\d+/.test(location.pathname),
      hasCatalogue: !!currentCatalogue(),
      languages: availableLanguages(),
      resolved: {
        primary: !!active.primary.url,
        secondary: !!active.secondary.url,
      },
    };
  }

  function broadcastStateToPopup() {
    try { api.runtime.sendMessage(stateForPopup(), () => void api.runtime.lastError); } catch (_) {}
  }

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'subnf-get-state') { sendResponse(stateForPopup()); return true; }
    if (msg.type === 'subnf-set-settings') {
      settings = { ...settings, ...msg.settings };
      api.storage && api.storage.local && api.storage.local.set({ subnf: settings });
      applySettingsChange();
      sendResponse(stateForPopup());
      return true;
    }
  });

  function applySettingsChange() {
    if (overlay) applyStyleVars();
    ensureHideStyle();
    if (!settings.enabled) teardownOverlay();
    resolveAndLoad();
    render(true);
  }

  // react to changes made from another tab / popup writing storage
  api.storage && api.storage.onChanged && api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.subnf) return;
    settings = { ...DEFAULTS, ...changes.subnf.newValue };
    applySettingsChange();
  });

  // ---------- 6. SPA navigation ----------
  let lastPath = location.pathname;
  function onNav() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    currentMovieId = movieIdFromUrl();
    active.primary = { url: null, cues: [], idx: -1 };
    active.secondary = { url: null, cues: [], idx: -1 };
    lastTopText = lastBottomText = '';
    setTimeout(() => { askPageForMovie(); resolveAndLoad(); }, 400);
  }
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); onNav(); return r; };
  }
  window.addEventListener('popstate', onNav);
  setInterval(() => { if (location.pathname !== lastPath) onNav(); }, 1000);

  // ---------- boot ----------
  function boot() {
    api.storage && api.storage.local && api.storage.local.get('subnf', (res) => {
      if (res && res.subnf) settings = { ...DEFAULTS, ...res.subnf };
      currentMovieId = movieIdFromUrl();
      resolveAndLoad(); // in case a manifest arrived before settings loaded
      startLoop();
      setTimeout(askPageForMovie, 800);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
