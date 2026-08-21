// sub-NF — content script (isolated world).
//
//   1. Inject the page hook (also declared as a MAIN-world content script; the
//      hook guards against installing twice).
//   2. Keep a per-title catalogue of subtitle tracks, cached to storage --
//      the player manifest goes past ONCE and cannot be re-requested.
//   3. Download + parse each chosen track into its own cue array.
//   4. Render two INDEPENDENT lines, each doing its own binary search against
//      the <video> clock. This is what makes two different languages possible,
//      and what keeps working when Netflix's own subtitles are switched off.
//   5. Report state and diagnostics to the popup.
//
// A line can also be set to the special source "__native__", which mirrors
// whatever Netflix is drawing right now. That needs no track list, so it is a
// useful fallback -- but it is NOT the normal path: two lines both set to it
// would show the same text twice.
(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api || !api.runtime || !api.runtime.id) return;

  const NATIVE = '__native__';   // mirror whatever Netflix is drawing
  const NONE = '__none__';       // this line shows nothing
  const CACHE_KEY = 'subnfTracks';
  const CACHE_TTL = 6 * 60 * 60 * 1000;  // signed CDN URLs are short-lived

  const DEFAULTS = {
    enabled: true,
    primaryLang: 'en',        // top line: a real subtitle track
    secondaryLang: 'zh-Hant', // bottom line: a different real subtitle track
    // Pin an exact track (from Netflix's own menu). Takes precedence over the
    // language code, which stays as the durable fallback: track ids change
    // between episodes, language codes do not.
    primaryTrackId: null,
    secondaryTrackId: null,
    hideNative: true,
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
  const cueCache = new Map();     // url -> Promise<cues[]>

  // Two fully independent slots. This is the core of the fix: each keeps its
  // own cue array, so the two lines can never collapse onto one source.
  const active = {
    primary: { url: null, cues: [], lang: null, label: '' },
    secondary: { url: null, cues: [], lang: null, label: '' },
  };

  const diag = {
    pageHook: false, hasPlayerApi: false, pageDiag: null,
    trackCount: 0, fetchOk: 0, fetchFail: 0,
    lastError: '', lastSource: '', fromCache: false,
    cues: { primary: 0, secondary: 0 },
  };

  const VTT = globalThis.SubNFVTT || {};
  const parseSubtitle = VTT.parseSubtitle || (() => []);
  const textAt = VTT.textAt || (() => '');
  const textFromNode = VTT.textFromNode || (() => '');
  const cleanNative = VTT.cleanNative || ((s) => s);
  const parseMenuUia = VTT.parseMenuUia || (() => null);
  const matchTrackByMenu = VTT.matchTrackByMenu || (() => null);

  // ---------- 1. inject page hook (fallback for browsers without MAIN world) ----------
  try {
    const s = document.createElement('script');
    s.src = api.runtime.getURL('src/inject.js');
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    s.addEventListener('load', () => s.remove());
  } catch (_) { /* ignore */ }

  // ---------- 2. catalogue, with a storage-backed cache ----------
  function saveCatalogue(movieId, tracks) {
    if (!api.storage || !api.storage.local) return;
    try {
      api.storage.local.get(CACHE_KEY, (res) => {
        const all = (res && res[CACHE_KEY]) || {};
        all[String(movieId)] = { tracks, at: Date.now() };
        const keys = Object.keys(all)
          .sort((a, b) => (all[b].at || 0) - (all[a].at || 0))
          .slice(0, 12);                       // keep the last dozen titles
        const trimmed = {};
        for (const k of keys) trimmed[k] = all[k];
        api.storage.local.set({ [CACHE_KEY]: trimmed });
      });
    } catch (_) { /* ignore */ }
  }

  function loadCachedCatalogues(done) {
    if (!api.storage || !api.storage.local) { done(); return; }
    try {
      api.storage.local.get(CACHE_KEY, (res) => {
        const all = (res && res[CACHE_KEY]) || {};
        const now = Date.now();
        for (const [id, rec] of Object.entries(all)) {
          if (!rec || !Array.isArray(rec.tracks)) continue;
          if (now - (rec.at || 0) > CACHE_TTL) continue;
          catalogues.set(id, rec.tracks);
          diag.fromCache = true;
        }
        done();
      });
    } catch (_) { done(); }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__subnf !== true || d.dir !== 'page') return;

    if (d.kind === 'tracks') {
      diag.pageHook = true;
      diag.lastSource = d.source || '';
      catalogues.set(d.movieId, d.tracks);
      saveCatalogue(d.movieId, d.tracks);
      lastMovieId = d.movieId;
      if (!currentMovieId) currentMovieId = d.movieId;
      diag.trackCount = (currentCatalogue() || []).length;
      resolveAndLoad();
      broadcastStateToPopup();
    } else if (d.kind === 'status') {
      diag.pageHook = true;
      diag.hasPlayerApi = !!d.hasPlayerApi;
      diag.pageDiag = d.diag || null;
      if (d.movieId && d.movieId !== currentMovieId) {
        currentMovieId = d.movieId;
        resolveAndLoad();
      }
    } else if (d.kind === 'vtt') {
      const cb = pageFetchPending.get(d.id);
      if (cb) cb(d);
    }
  });

  const post = (kind, extra) =>
    window.postMessage({ __subnf: true, dir: 'content', kind, ...(extra || {}) }, '*');
  const pollPage = () => post('poll');

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

  function resolveTrack(tracks, wanted, pinnedId) {
    if (!tracks || !wanted || wanted === NATIVE || wanted === NONE) return null;
    if (pinnedId) {
      const exact = tracks.find((t) => t.id === pinnedId);
      if (exact) return exact;            // else fall through to the language
    }
    const cands = tracks.filter((t) => langMatches(t, wanted));
    if (!cands.length) return null;
    const score = (t) => {
      let s = 0;
      if (String(t.language).toLowerCase() === String(wanted).toLowerCase()) s += 100;
      if (t.forced) s -= 50;                          // avoid forced-narrative
      if (settings.preferCC ? t.cc : !t.cc) s += 10;
      if (/webvtt/i.test(t.fmt || '')) s += 5;        // cheapest to parse
      return s;
    };
    return cands.slice().sort((a, b) => score(b) - score(a))[0];
  }

  // ---------- 3. download + parse ----------
  let fetchSeq = 0;
  const pageFetchPending = new Map();

  function bgFetch(url) {
    return new Promise((resolve) => {
      let settled = false;
      try {
        api.runtime.sendMessage({ type: 'subnf-fetch', url }, (resp) => {
          if (settled) return; settled = true;
          if (api.runtime.lastError || !resp || !resp.ok) {
            diag.lastError = (resp && resp.error)
              || (api.runtime.lastError && api.runtime.lastError.message)
              || 'background fetch failed';
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
      post('fetch', { id, url });
    });
  }

  function fetchCues(url) {
    if (cueCache.has(url)) return cueCache.get(url);
    const p = (async () => {
      let text = await bgFetch(url);
      if (text == null) text = await pageFetch(url);
      const cues = parseSubtitle(text || '');
      if (cues.length) diag.fetchOk++;
      else {
        diag.fetchFail++;
        // A cached URL may have expired. Do not memoise the failure, so a later
        // poll (with a freshly captured URL) can still succeed.
        cueCache.delete(url);
      }
      return cues;
    })();
    cueCache.set(url, p);
    return p;
  }

  async function loadInto(slot, wanted) {
    if (wanted === NATIVE) {
      active[slot] = { url: null, cues: [], lang: NATIVE, label: 'Netflix' };
      return;
    }
    if (!wanted || wanted === NONE) {
      active[slot] = { url: null, cues: [], lang: NONE, label: '' };
      diag.cues[slot] = 0;
      return;
    }
    const pin = slot === 'primary' ? settings.primaryTrackId : settings.secondaryTrackId;
    const track = resolveTrack(currentCatalogue(), wanted, pin);
    if (!track) {
      if (active[slot].lang !== null || active[slot].url) {
        active[slot] = { url: null, cues: [], lang: null, label: '' };
      }
      return;
    }
    if (track.url === active[slot].url && active[slot].cues.length) return;
    const cues = await fetchCues(track.url);
    active[slot] = { url: track.url, cues, lang: track.language, label: track.label };
    diag.cues[slot] = cues.length;
  }

  let loading = false;
  async function resolveAndLoad() {
    if (loading) return;
    loading = true;
    try {
      // Both slots resolve independently and in parallel.
      await Promise.all([
        loadInto('primary', settings.primaryLang),
        loadInto('secondary', settings.secondaryLang),
      ]);
      applyNativeOff();
      render(true);
      decorateMenu();
      broadcastStateToPopup();
    } finally { loading = false; }
  }

  // ---------- Netflix's own caption, read from the DOM (fallback source) ----------
  let nativeCache = '';
  let nativeAt = 0;
  function nativeText(now) {
    if (now - nativeAt < 80) return nativeCache;   // ~12 Hz is plenty
    nativeAt = now;
    let out = '';
    try {
      const parts = [];
      for (const b of document.querySelectorAll('.player-timedtext-text-container')) {
        const t = cleanNative(textFromNode(b));
        if (t) parts.push(t);
      }
      out = parts.join('\n');
    } catch (_) { out = ''; }
    nativeCache = out;
    return out;
  }

  const usesNative = () =>
    settings.primaryLang === NATIVE || settings.secondaryLang === NATIVE;

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

  // Mount into the positioned box that holds the <video> -- the same container
  // Netflix positions its own captions against.
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

  // Two different meanings of "hide", depending on whether we still need to
  // read Netflix's caption:
  //   * a line IS the native caption -> keep it rendering, make it invisible.
  //   * neither line is -> genuinely switch the track off via the player API
  //     (plus CSS as belt-and-braces). Our own cues are already downloaded and
  //     keyed to the video clock, so they are unaffected.
  function ensureHideStyle() {
    const want = settings.enabled && settings.hideNative;
    if (want) {
      const css = usesNative()
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

  let lastNativeOff = 0;
  function applyNativeOff() {
    if (!settings.enabled || !settings.hideNative || usesNative()) return;
    // Never switch Netflix's own subtitles off unless we actually have
    // something to show in their place -- otherwise a failed load would leave
    // the viewer with no subtitles at all. Throttled so that using Netflix's
    // own menu does not feel like it is fighting us.
    if (!active.primary.cues.length && !active.secondary.cues.length) return;
    const now = Date.now();
    if (now - lastNativeOff < 3000) return;
    lastNativeOff = now;
    post('nativeOff');
  }

  function setLine(el, text) {
    el.textContent = '';
    if (!text) { el.style.display = 'none'; return; }
    el.style.display = '';
    text.split('\n').forEach((p, i) => {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(p));
    });
  }

  function sourceText(which, t, now) {
    const src = which === 'primary' ? settings.primaryLang : settings.secondaryLang;
    if (!src || src === NONE) return '';
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

  // The clock is read every frame, so seeking is handled inherently; these just
  // force an immediate repaint instead of waiting for the text to change.
  function hookVideo() {
    const v = document.querySelector('.watch-video video') || document.querySelector('video');
    if (!v || v.__subnfHooked) return;
    v.__subnfHooked = true;
    for (const ev of ['seeked', 'ratechange', 'play', 'loadedmetadata']) {
      v.addEventListener(ev, () => { try { render(true); } catch (_) {} });
    }
  }

  let rafOn = false;
  function loop() {
    try { render(false); } catch (_) {}
    if (rafOn) requestAnimationFrame(loop);
  }
  function startLoop() { if (!rafOn) { rafOn = true; requestAnimationFrame(loop); } }

  document.addEventListener('fullscreenchange', () => { if (overlay) mount(); });

  // ---------- 4b. decorate Netflix's own Audio & Subtitles menu ----------
  // Rather than duplicating a language picker in the popup, the two lines are
  // chosen right where you already pick subtitles. Each row Netflix offers gets
  // a small pill: click it to tick that language onto line 1, click again to
  // untick. Two can be ticked at once -- ticking a third drops the oldest.
  //
  // Clicking the ROW itself still does Netflix's own thing (switch its single
  // track); only the pill is ours, and it stops the event before Netflix's own
  // handler on the <li> can see it.

  function slotOfTrack(track) {
    if (!track) return 0;
    const cat = currentCatalogue();
    const slots = [['primary', 1], ['secondary', 2]];
    for (const [which, n] of slots) {
      const id = which === 'primary' ? settings.primaryTrackId : settings.secondaryTrackId;
      const lang = which === 'primary' ? settings.primaryLang : settings.secondaryLang;
      if (id) {
        const exact = cat && cat.find((t) => t.id === id);
        if (exact) { if (exact.id === track.id) return n; continue; }
        // stale pin (new episode) -> fall through to the language
      }
      if (!lang || lang === NONE || lang === NATIVE) continue;
      const resolved = resolveTrack(cat, lang, null);
      if (resolved && resolved.id === track.id) return n;
    }
    return 0;
  }

  const slotEmpty = (which) => {
    const l = which === 'primary' ? settings.primaryLang : settings.secondaryLang;
    return !l || l === NONE;
  };

  function toggleTrack(track) {
    if (!track) return;
    const next = { ...settings };
    const slot = slotOfTrack(track);
    if (slot === 1) {
      next.primaryLang = NONE; next.primaryTrackId = null;
    } else if (slot === 2) {
      next.secondaryLang = NONE; next.secondaryTrackId = null;
    } else if (slotEmpty('primary')) {
      next.primaryLang = track.language; next.primaryTrackId = track.id;
    } else if (slotEmpty('secondary')) {
      next.secondaryLang = track.language; next.secondaryTrackId = track.id;
    } else {
      // Both taken: the older selection (line 1) drops out, line 2 moves up.
      next.primaryLang = settings.secondaryLang;
      next.primaryTrackId = settings.secondaryTrackId;
      next.secondaryLang = track.language;
      next.secondaryTrackId = track.id;
    }
    settings = next;
    if (api.storage && api.storage.local) api.storage.local.set({ subnf: settings });
    applySettingsChange();
    decorateMenu();
  }

  function onPillEvent(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (e.type !== 'click') return;                 // mousedown is only blocked
    const id = e.currentTarget && e.currentTarget.dataset.subnfTrack;
    const cat = currentCatalogue();
    const track = cat && cat.find((t) => t.id === id);
    if (track) toggleTrack(track);
  }

  function ensurePill(li, track) {
    let pill = li.querySelector('.subnf-pick');
    if (!pill) {
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'subnf-pick';
      // Capture phase, so Netflix's own handler on the <li> never sees it.
      pill.addEventListener('click', onPillEvent, true);
      pill.addEventListener('mousedown', onPillEvent, true);
      li.appendChild(pill);
      li.classList.add('subnf-row');
    }
    const slot = slotOfTrack(track);
    const text = slot ? String(slot) : '+';
    const label = slot
      ? `sub-NF：第 ${slot} 行（點一下取消）`
      : 'sub-NF：加為雙語字幕的一行';
    if (pill.dataset.subnfTrack !== track.id) pill.dataset.subnfTrack = track.id;
    if (pill.dataset.subnfSlot !== String(slot)) pill.dataset.subnfSlot = String(slot);
    if (pill.textContent !== text) pill.textContent = text;
    if (pill.title !== label) { pill.title = label; pill.setAttribute('aria-label', label); }
  }

  let decorating = false;
  function decorateMenu() {
    if (decorating) return;
    const rows = document.querySelectorAll('li[data-uia^="subtitle-item-"]');
    if (!rows.length) return;
    const cat = currentCatalogue();
    decorating = true;
    try {
      for (const li of rows) {
        // A row that matches no track of ours is Netflix's "Off" entry (whose
        // label is localised) -- skipping by "no match" avoids hard-coding it.
        const info = parseMenuUia(li.getAttribute('data-uia'));
        const track = (info && cat) ? matchTrackByMenu(cat, info) : null;
        if (!track) {
          const stale = li.querySelector('.subnf-pick');
          if (stale) { stale.remove(); li.classList.remove('subnf-row'); }
          continue;
        }
        ensurePill(li, track);
      }
    } catch (_) { /* never break Netflix's menu */ }
    decorating = false;
  }

  let menuTimer = 0;
  function watchMenu() {
    try {
      new MutationObserver(() => {
        if (decorating || menuTimer) return;
        menuTimer = setTimeout(() => {
          menuTimer = 0;
          if (document.querySelector('[data-uia="selector-audio-subtitle"]')) decorateMenu();
        }, 100);
      }).observe(document.body || document.documentElement,
        { childList: true, subtree: true });
    } catch (_) { /* ignore */ }
  }

  // ---------- 5. popup ----------
  function availableLanguages() {
    const tracks = currentCatalogue() || [];
    const seen = new Map();
    for (const t of tracks) {
      if (!seen.has(t.language)) {
        seen.set(t.language, { language: t.language, label: t.label, cc: !!t.cc });
      } else if (t.cc) seen.get(t.language).cc = true;
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
        primary: settings.primaryLang === NATIVE || active.primary.cues.length > 0,
        secondary: settings.secondaryLang === NATIVE || active.secondary.cues.length > 0,
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
      const inc = msg.settings || {};
      // A language picked in the popup wins over a pin made in Netflix's menu.
      if (inc.primaryLang !== undefined && inc.primaryLang !== settings.primaryLang) inc.primaryTrackId = null;
      if (inc.secondaryLang !== undefined && inc.secondaryLang !== settings.secondaryLang) inc.secondaryTrackId = null;
      settings = { ...settings, ...inc };
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
    // A new episode means a new movieId and a new manifest: drop the old cues.
    active.primary = { url: null, cues: [], lang: null, label: '' };
    active.secondary = { url: null, cues: [], lang: null, label: '' };
    diag.cues = { primary: 0, secondary: 0 };
    lastTopText = lastBottomText = '';
    nativeCache = '';
    setTimeout(() => { hookVideo(); pollPage(); resolveAndLoad(); }, 400);
  }
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); onNav(); return r; };
  }
  window.addEventListener('popstate', onNav);
  setInterval(() => { if (location.pathname !== lastPath) onNav(); }, 1000);

  // Keep asking until both slots have what they need. The player API only has a
  // track list once playback has started, so one early question is never enough.
  setInterval(() => {
    if (!/\/watch\/\d+/.test(location.pathname)) return;
    hookVideo();
    const needs = (which, lang) => lang !== NATIVE && !active[which].cues.length;
    if (!currentCatalogue()
      || needs('primary', settings.primaryLang)
      || needs('secondary', settings.secondaryLang)) {
      pollPage();
      resolveAndLoad();
    }
  }, 2000);

  // ---------- boot ----------
  function boot() {
    const start = () => {
      currentMovieId = movieIdFromUrl();
      startLoop();
      hookVideo();
      watchMenu();
      pollPage();
      resolveAndLoad();
    };
    if (api.storage && api.storage.local) {
      api.storage.local.get('subnf', (res) => {
        if (res && res.subnf) settings = { ...DEFAULTS, ...res.subnf };
        loadCachedCatalogues(start);
      });
    } else start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
