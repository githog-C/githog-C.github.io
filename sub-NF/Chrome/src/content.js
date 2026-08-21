// sub-NF — content script (isolated world).
//
//   1. Inject the page hook (belt-and-braces: the manifest also declares it as
//      a MAIN-world content script, and the hook guards against double-install).
//   2. Keep a per-title catalogue of subtitle tracks, from whichever of the
//      hook's four capture paths answered.
//   3. Resolve the two chosen sources, fetch + parse their WebVTT.
//   4. Render a two-line overlay synced to the <video> clock.
//   5. Report state and diagnostics to the popup.
//
// One of the two lines can be the special source "__native__": Netflix's own
// rendered caption, read straight out of the DOM. That path needs no manifest
// at all, so it always works — pick the language you want in Netflix's own
// subtitle menu and sub-NF adds the second one above or below it.
(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api || !api.runtime || !api.runtime.id) return;

  const NATIVE = '__native__';

  const DEFAULTS = {
    enabled: true,
    primaryLang: NATIVE,   // top line: Netflix's own caption (always available)
    secondaryLang: 'en',   // bottom line: fetched from a subtitle track
    hideNative: true,      // hide Netflix's copy once we are drawing it ourselves
    preferCC: false,
    fontScale: 1.0,
    bottomVh: 12,
    gap: 4,
    primaryOffsetMs: 0,
    secondaryOffsetMs: 0,
    swapOrder: false,
  };

  let settings = { ...DEFAULTS };
  const catalogues = new Map();   // movieId -> tracks[]
  let lastMovieId = null;
  let currentMovieId = null;
  const vttCache = new Map();     // url -> Promise<cues[]>

  const active = {
    primary: { url: null, cues: [], lang: null },
    secondary: { url: null, cues: [], lang: null },
  };

  // What the popup shows when something is not working.
  const diag = {
    pageHook: false,     // has the page hook ever answered us?
    hasPlayerApi: false, // is Netflix's player API reachable?
    pageDiag: null,      // per-path capture counters from the hook
    trackCount: 0,
    fetchOk: 0,
    fetchFail: 0,
    lastError: '',
    lastSource: '',
  };

  const VTT = globalThis.SubNFVTT || {};
  const parseVTT = VTT.parseVTT || (() => []);
  const textAt = VTT.textAt || (() => '');
  const textFromNode = VTT.textFromNode || (() => '');
  const cleanNative = VTT.cleanNative || ((s) => s);

  // ---------- 1. inject page hook (fallback for browsers without MAIN world) ----------
  try {
    const s = document.createElement('script');
    s.src = api.runtime.getURL('src/inject.js');
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    s.addEventListener('load', () => s.remove());
  } catch (_) { /* ignore */ }

  // ---------- messages from the page hook ----------
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__subnf !== true || d.dir !== 'page') return;

    if (d.kind === 'tracks') {
      diag.pageHook = true;
      diag.lastSource = d.source || '';
      catalogues.set(d.movieId, d.tracks);
      lastMovieId = d.movieId;
      if (!currentMovieId) currentMovieId = d.movieId;
      diag.trackCount = (currentCatalogue() || []).length;
      resolveAndLoad();
      broadcastStateToPopup();
    } else if (d.kind === 'status') {
      diag.pageHook = true;
      diag.hasPlayerApi = !!d.hasPlayerApi;
      diag.pageDiag = d.diag || null;
      if (d.movieId && d.movieId !== currentMovieId && catalogues.has(d.movieId)) {
        currentMovieId = d.movieId;
        resolveAndLoad();
      }
    } else if (d.kind === 'vtt') {
      const cb = pageFetchPending.get(d.id);
      if (cb) cb(d);
    }
  });

  function pollPage() {
    window.postMessage({ __subnf: true, dir: 'content', kind: 'poll' }, '*');
  }

  // ---------- 2. catalogue ----------
  function movieIdFromUrl() {
    const m = location.pathname.match(/\/watch\/(\d+)/);
    return m ? m[1] : null;
  }

  function currentCatalogue() {
    const id = currentMovieId || movieIdFromUrl() || lastMovieId;
    if (id && catalogues.has(id)) { currentMovieId = id; return catalogues.get(id); }
    if (lastMovieId && catalogues.has(lastMovieId)) { currentMovieId = lastMovieId; return catalogues.get(lastMovieId); }
    return null;
  }

  function langMatches(track, wanted) {
    if (!wanted) return false;
    const a = String(track.language || '').toLowerCase();
    const b = String(wanted).toLowerCase();
    if (a === b) return true;
    return a.split('-')[0] === b.split('-')[0]; // "zh" matches "zh-Hant"
  }

  function resolveTrack(tracks, wanted) {
    if (!tracks || !wanted || wanted === NATIVE) return null;
    const cands = tracks.filter((t) => langMatches(t, wanted));
    if (!cands.length) return null;
    const score = (t) => {
      let s = 0;
      if (String(t.language).toLowerCase() === String(wanted).toLowerCase()) s += 100;
      if (t.forced) s -= 50;
      if (settings.preferCC ? t.cc : !t.cc) s += 10;
      return s;
    };
    return cands.slice().sort((a, b) => score(b) - score(a))[0];
  }

  // ---------- 3. fetch + parse ----------
  let fetchSeq = 0;
  const pageFetchPending = new Map();

  function bgFetch(url) {
    return new Promise((resolve) => {
      let settled = false;
      try {
        api.runtime.sendMessage({ type: 'subnf-fetch', url }, (resp) => {
          if (settled) return; settled = true;
          if (api.runtime.lastError || !resp || !resp.ok) {
            diag.lastError = (resp && resp.error) || (api.runtime.lastError && api.runtime.lastError.message) || 'background fetch failed';
            resolve(null);
          } else resolve(resp.text);
        });
      } catch (e) { diag.lastError = String(e && e.message || e); resolve(null); }
    });
  }

  function pageFetch(url) {
    return new Promise((resolve) => {
      const id = 'f' + (++fetchSeq);
      let done = false;
      const timer = setTimeout(() => {
        if (done) return; done = true; pageFetchPending.delete(id);
        diag.lastError = 'page fetch timed out';
        resolve('');
      }, 15000);
      pageFetchPending.set(id, (msg) => {
        if (done) return; done = true; clearTimeout(timer); pageFetchPending.delete(id);
        if (!msg || !msg.ok) diag.lastError = (msg && msg.error) || 'page fetch failed';
        resolve(msg && msg.ok ? msg.text : '');
      });
      window.postMessage({ __subnf: true, dir: 'content', kind: 'fetch', id, url }, '*');
    });
  }

  function fetchVtt(url) {
    if (vttCache.has(url)) return vttCache.get(url);
    const p = (async () => {
      let text = await bgFetch(url);
      if (text == null) text = await pageFetch(url);
      const cues = parseVTT(text || '');
      if (cues.length) diag.fetchOk++; else diag.fetchFail++;
      return cues;
    })();
    vttCache.set(url, p);
    return p;
  }

  async function loadInto(slot, wanted) {
    if (wanted === NATIVE) {
      active[slot] = { url: null, cues: [], lang: NATIVE };
      return;
    }
    const track = resolveTrack(currentCatalogue(), wanted);
    if (!track) { active[slot] = { url: null, cues: [], lang: null }; return; }
    if (track.url === active[slot].url) return;
    active[slot] = { url: track.url, cues: [], lang: track.language };
    active[slot].cues = await fetchVtt(track.url);
  }

  let loading = false;
  async function resolveAndLoad() {
    if (loading) return;
    loading = true;
    try {
      await loadInto('primary', settings.primaryLang);
      await loadInto('secondary', settings.secondaryLang);
      render(true);
      broadcastStateToPopup();
    } finally { loading = false; }
  }

  // ---------- Netflix's own caption, read from the DOM ----------
  let nativeCache = '';
  let nativeAt = 0;
  function nativeText(now) {
    if (now - nativeAt < 80) return nativeCache;  // ~12 Hz is plenty
    nativeAt = now;
    let out = '';
    try {
      const boxes = document.querySelectorAll('.player-timedtext-text-container');
      const parts = [];
      for (const b of boxes) {
        const t = cleanNative(textFromNode(b));
        if (t) parts.push(t);
      }
      out = parts.join('\n');
    } catch (_) { out = ''; }
    nativeCache = out;
    return out;
  }

  // ---------- 4. overlay ----------
  let overlay = null, lineTop = null, lineBottom = null, hideStyleEl = null;
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
    lastTopText = lastBottomText = '';
    applyStyleVars();
    mount();
    return overlay;
  }

  // Mount into the same positioned box that holds the <video> — that is the
  // container Netflix positions its own captions against. Mounting on
  // .watch-video (which is not a containing block) put the overlay in the
  // wrong coordinate space.
  function mountTarget() {
    if (document.fullscreenElement) return document.fullscreenElement;
    const v = document.querySelector('.watch-video video') || document.querySelector('video');
    if (v) {
      let el = v.parentElement;
      while (el && el !== document.body) {
        let pos = '';
        try { pos = getComputedStyle(el).position; } catch (_) {}
        if (pos && pos !== 'static' && el.clientHeight > 100) return el;
        el = el.parentElement;
      }
      if (v.parentElement) return v.parentElement;
    }
    return document.querySelector('.watch-video') || document.body;
  }

  function mount() {
    if (!overlay) return;
    const target = mountTarget();
    if (target && overlay.parentElement !== target) target.appendChild(overlay);
  }

  function applyStyleVars() {
    if (!overlay) return;
    overlay.style.setProperty('--subnf-bottom', settings.bottomVh + 'vh');
    overlay.style.setProperty('--subnf-scale', String(settings.fontScale));
    overlay.style.setProperty('--subnf-gap', settings.gap + 'px');
    lineTop.style.order = settings.swapOrder ? '2' : '1';
    lineBottom.style.order = settings.swapOrder ? '1' : '2';
  }

  // If one of our lines IS Netflix's caption, we must keep Netflix rendering it
  // (so we can read it) while making it invisible. opacity:0 does that;
  // display:none would risk Netflix skipping its own layout work.
  function ensureHideStyle() {
    const usesNative = settings.primaryLang === NATIVE || settings.secondaryLang === NATIVE;
    const want = settings.enabled && settings.hideNative;
    if (want) {
      const css = usesNative
        ? '.player-timedtext{opacity:0 !important;pointer-events:none !important;}'
        : '.player-timedtext{display:none !important;}';
      if (!hideStyleEl) {
        hideStyleEl = document.createElement('style');
        hideStyleEl.id = 'subnf-hide-native';
        (document.head || document.documentElement).appendChild(hideStyleEl);
      }
      if (hideStyleEl.textContent !== css) hideStyleEl.textContent = css;
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

  function sourceText(which, t, now) {
    const src = which === 'primary' ? settings.primaryLang : settings.secondaryLang;
    if (src === NATIVE) return nativeText(now);
    const off = (which === 'primary' ? settings.primaryOffsetMs : settings.secondaryOffsetMs) / 1000;
    return textAt(active[which].cues, t - off);
  }

  function render(force) {
    if (!settings.enabled) { teardownOverlay(); return; }
    ensureHideStyle();
    const video = document.querySelector('.watch-video video') || document.querySelector('video');
    if (!video) return;
    ensureOverlay();
    mount();

    const t = video.currentTime;
    const now = performance.now();
    const topWhich = settings.swapOrder ? 'secondary' : 'primary';
    const botWhich = settings.swapOrder ? 'primary' : 'secondary';
    const topText = sourceText(topWhich, t, now);
    const botText = sourceText(botWhich, t, now);
    if (force || topText !== lastTopText) { setLine(lineTop, topText); lastTopText = topText; }
    if (force || botText !== lastBottomText) { setLine(lineBottom, botText); lastBottomText = botText; }
  }

  function teardownOverlay() {
    if (overlay) { overlay.remove(); overlay = null; lineTop = lineBottom = null; lastTopText = lastBottomText = ''; }
    if (hideStyleEl) { hideStyleEl.remove(); hideStyleEl = null; }
  }

  let rafOn = false;
  function loop() {
    try { render(false); } catch (_) {}
    if (rafOn) requestAnimationFrame(loop);
  }
  function startLoop() { if (!rafOn) { rafOn = true; requestAnimationFrame(loop); } }

  document.addEventListener('fullscreenchange', () => { if (overlay) mount(); });

  // ---------- 5. popup ----------
  function availableLanguages() {
    const tracks = currentCatalogue() || [];
    const seen = new Map();
    for (const t of tracks) {
      if (!seen.has(t.language)) seen.set(t.language, { language: t.language, label: t.label, cc: !!t.cc });
      else if (t.cc) seen.get(t.language).cc = true;
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
      nativeVisible: !!nativeCache,
      resolved: {
        primary: settings.primaryLang === NATIVE || !!active.primary.url,
        secondary: settings.secondaryLang === NATIVE || !!active.secondary.url,
      },
      diag,
    };
  }

  function broadcastStateToPopup() {
    try { api.runtime.sendMessage(stateForPopup(), () => void api.runtime.lastError); } catch (_) {}
  }

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'subnf-get-state') { pollPage(); sendResponse(stateForPopup()); return true; }
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
    if (!settings.enabled) { teardownOverlay(); return; }
    resolveAndLoad();
    render(true);
  }

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
    active.primary = { url: null, cues: [], lang: null };
    active.secondary = { url: null, cues: [], lang: null };
    lastTopText = lastBottomText = '';
    nativeCache = '';
    setTimeout(() => { pollPage(); resolveAndLoad(); }, 400);
  }
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); onNav(); return r; };
  }
  window.addEventListener('popstate', onNav);
  setInterval(() => { if (location.pathname !== lastPath) onNav(); }, 1000);

  // Keep asking the page hook until we have a catalogue. The player API only
  // has a track list once playback has actually started, so a single early
  // question is never enough.
  setInterval(() => {
    if (!/\/watch\/\d+/.test(location.pathname)) return;
    const need = !currentCatalogue()
      || (settings.secondaryLang !== NATIVE && !active.secondary.url)
      || (settings.primaryLang !== NATIVE && !active.primary.url);
    if (need) { pollPage(); resolveAndLoad(); }
  }, 2000);

  // ---------- boot ----------
  function boot() {
    const start = () => {
      currentMovieId = movieIdFromUrl();
      startLoop();
      pollPage();
      resolveAndLoad();
    };
    if (api.storage && api.storage.local) {
      api.storage.local.get('subnf', (res) => {
        if (res && res.subnf) settings = { ...DEFAULTS, ...res.subnf };
        start();
      });
    } else start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
