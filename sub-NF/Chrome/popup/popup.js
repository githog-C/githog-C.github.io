// sub-NF popup: read state from the active Netflix tab, edit settings, push
// them back. Falls back to stored settings when no Netflix tab is in focus.
//
// The interface language is a popup-only preference (settings.uiLang). It is
// deliberately NOT Chrome's _locales mechanism: that follows the browser's UI
// language and cannot be flipped by the user on the spot, which is the whole
// point here. Nothing outside this file reads it.
(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;

  const NATIVE = '__native__';
  const NONE = '__none__';

  const DEFAULTS = {
    enabled: true, primaryLang: 'en', secondaryLang: 'zh-Hant',
    hideNative: true, preferCC: false, fontScale: 1.0, bottomVh: 12, gap: 4,
    primaryOffsetMs: 0, secondaryOffsetMs: 0, swapOrder: false,
    clickToCopy: true, copyModifierClick: true, avoidControls: true,
    fixAllCaps: true, fixAllCapsDisplay: false, stripSdh: false,
    shiftVw: 0, uiLang: 'zh',
  };

  // Only the chord that this machine actually uses is shown; offering both and
  // making the reader work out which one applies is worse than picking one.
  const IS_MAC = /Mac|iPhone|iPad|iPod/i.test(
    (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent);
  const CHORD = IS_MAC ? '⌘⇧' : 'Ctrl⇧';

  const I18N = {
    zh: {
      langBtn: 'EN', switchTitle: '開 / 關',
      primaryLang: '第一語言（上）', secondaryLang: '第二語言（下）',
      swapOrder: '上下對調', hideNative: '隱藏 Netflix 原生字幕',
      copyNow: '複製目前字幕', copyTopBtn: '上排', copyBottomBtn: '下排', copyBothBtn: '全部',
      tuning: '外觀與微調',
      fontScale: '字級', gap: '兩行間距', bottomVh: '垂直位置', shiftVw: '水平位置',
      clickToCopy: '右鍵點擊以複製字幕（限影片暫停時）',
      copyModifierClick: '快捷鍵 ' + CHORD + ' ＋點擊以複製字幕（無需暫停）',
      fixAllCaps: '複製修正後句首大寫英文字幕',
      fixAllCapsDisplay: '顯示修正後句首大寫英文字幕',
      preferCC: '優先使用 CC 字幕',
      stripSdh: '移除音效與說話人標記字幕',
      avoidControls: '字幕隨時間軸浮動',
      primaryOffsetMs: '第一語言時間位移', secondaryOffsetMs: '第二語言時間位移',
      diag: '診斷（抓不到字幕時看這裡）', diagHint: '把這一段回報就能定位問題。',
      optNone: '（不顯示）', optNative: 'Netflix 目前顯示的字幕',
      noSubsNow: '目前畫面上沒有字幕。', copied: '已複製。', copyFailed: '複製失敗，請再試一次。',
      stOffsite: '打開 netflix.com 的播放頁即可套用。',
      hintOffsite: '目前設定已儲存，下次在 Netflix 播放時自動生效。',
      stReady: '雙語字幕已就緒。',
      hintReady: '也可以直接在 Netflix 的「音訊與字幕」選單裡，用每列右側的圓鈕勾選兩種語言。',
      stPartial: '已載入語言清單，但所選語言此片可能沒有。',
      hintPartial: '換一個語言，或把其中一行設成「Netflix 目前顯示的字幕」。',
      stNoTracks: '尚未取得字幕軌，請先播放幾秒。',
      hintNoTracks: '若一直抓不到，把其中一行設成「Netflix 目前顯示的字幕」仍可運作，並展開下方診斷。',
      stNoWatch: '請打開一部片的播放頁。',
      dNotConnected: '沒有連上 Netflix 分頁', dState: '狀態',
      dWatch: '播放頁', dHook: '頁面掛鉤有回應', dPlayerApi: 'Netflix 播放器 API',
      dTracks: '抓到字幕軌', dSource: '來源', dNone: '（無）', dPaths: '各路徑',
      dProfiles: '已補上 WebVTT 的請求數', dCuesTop: '上行 cue 數', dCuesBottom: '下行 cue 數',
      dCache: '用了快取軌道', dNative: '原生字幕可讀', dFetch: '下載成功 / 失敗',
      dLastError: '最後錯誤', yes: '是', no: '否',
    },
    en: {
      langBtn: '中', switchTitle: 'On / off',
      primaryLang: 'First language (top)', secondaryLang: 'Second language (bottom)',
      swapOrder: 'Swap top and bottom', hideNative: "Hide Netflix's own subtitles",
      copyNow: 'Copy the current subtitle', copyTopBtn: 'Top', copyBottomBtn: 'Bottom', copyBothBtn: 'Both',
      tuning: 'Appearance and fine-tuning',
      fontScale: 'Text size', gap: 'Line spacing', bottomVh: 'Vertical position', shiftVw: 'Horizontal position',
      clickToCopy: 'Right-click a line to copy it (while paused)',
      copyModifierClick: 'Shortcut: ' + CHORD + ' + click to copy (no need to pause)',
      fixAllCaps: 'Copy all-caps English as sentence case',
      fixAllCapsDisplay: 'Show all-caps English as sentence case',
      preferCC: 'Prefer CC subtitles',
      stripSdh: 'Remove sound and speaker labels',
      avoidControls: 'Let subtitles move with the control bar',
      primaryOffsetMs: 'First language time offset', secondaryOffsetMs: 'Second language time offset',
      diag: 'Diagnostics (look here if nothing appears)', diagHint: 'Send this section and the problem can be pinned down.',
      optNone: '(none)', optNative: 'Whatever Netflix is showing',
      noSubsNow: 'No subtitle on screen right now.', copied: 'Copied.', copyFailed: 'Copy failed — try again.',
      stOffsite: 'Open a netflix.com watch page to apply this.',
      hintOffsite: 'Settings are saved and will apply next time you play something on Netflix.',
      stReady: 'Bilingual subtitles are ready.',
      hintReady: "You can also pick both languages straight from Netflix's own Audio & Subtitles menu, using the round button on each row.",
      stPartial: 'Language list loaded, but this title may not offer the chosen language.',
      hintPartial: 'Pick another language, or set one line to "Whatever Netflix is showing".',
      stNoTracks: 'No subtitle tracks yet — play for a few seconds.',
      hintNoTracks: 'If nothing ever arrives, one line set to "Whatever Netflix is showing" still works. Open the diagnostics below.',
      stNoWatch: 'Open a title and start playing it.',
      dNotConnected: 'Not connected to a Netflix tab', dState: 'State',
      dWatch: 'Watch page', dHook: 'Page hook responding', dPlayerApi: 'Netflix player API',
      dTracks: 'Subtitle tracks found', dSource: 'Source', dNone: '(none)', dPaths: 'Routes',
      dProfiles: 'Requests given WebVTT', dCuesTop: 'Cues, line 1', dCuesBottom: 'Cues, line 2',
      dCache: 'Used cached tracks', dNative: 'Native captions readable', dFetch: 'Downloads ok / failed',
      dLastError: 'Last error', yes: 'yes', no: 'no',
    },
  };

  const T = () => I18N[settings.uiLang === 'en' ? 'en' : 'zh'];

  // min / max / step / how the value reads. The steppers replace drag sliders:
  // these are settings you nudge to a value, not ones you sweep through.
  const NUMBERS = {
    fontScale: { min: 0.6, max: 2, step: 0.05, int: false, fmt: (v) => v.toFixed(2) + '×' },
    gap: { min: 0, max: 24, step: 1, int: true, fmt: (v) => v + ' px' },
    bottomVh: { min: 2, max: 40, step: 1, int: true, fmt: (v) => v + ' vh' },
    shiftVw: { min: -25, max: 25, step: 1, int: true, fmt: (v) => (v > 0 ? '+' : '') + v + ' vw' },
    primaryOffsetMs: { min: -5000, max: 5000, step: 100, int: true, fmt: (v) => (v / 1000).toFixed(1) + ' s' },
    secondaryOffsetMs: { min: -5000, max: 5000, step: 100, int: true, fmt: (v) => (v / 1000).toFixed(1) + ' s' },
  };
  const OUT_ID = {
    fontScale: 'fontScaleOut', gap: 'gapOut', bottomVh: 'bottomVhOut', shiftVw: 'shiftVwOut',
    primaryOffsetMs: 'primaryOffsetOut', secondaryOffsetMs: 'secondaryOffsetOut',
  };
  const CHECKS = ['enabled', 'swapOrder', 'hideNative', 'preferCC', 'clickToCopy',
    'copyModifierClick', 'avoidControls', 'fixAllCaps', 'fixAllCapsDisplay', 'stripSdh'];

  const COMMON = [
    ['en', 'English'], ['es', 'Español'], ['es-ES', 'Español (España)'],
    ['pt-BR', 'Português (Brasil)'], ['fr', 'Français'], ['de', 'Deutsch'],
    ['it', 'Italiano'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['tr', 'Türkçe'],
    ['ru', 'Русский'], ['ja', '日本語'], ['ko', '한국어'],
    ['zh-Hans', '中文（简体）'], ['zh-Hant', '中文（繁體）'], ['zh', '中文'],
    ['hi', 'हिन्दी'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['id', 'Indonesia'],
    ['ar', 'العربية'], ['he', 'עברית'], ['sv', 'Svenska'], ['uk', 'Українська'],
  ];

  const el = (id) => document.getElementById(id);
  const statusEl = el('status');
  const hintEl = el('hint');

  let settings = { ...DEFAULTS };
  let tabId = null;
  let onNetflix = false;
  let lastState = null;

  function applyLanguage() {
    const t = T();
    for (const node of document.querySelectorAll('[data-i18n]')) {
      const key = node.getAttribute('data-i18n');
      if (t[key] != null) node.textContent = t[key];
    }
    // Icon-only controls carry their name as a tooltip instead of a caption --
    // that is the whole reason they became icons, so the name must still be
    // reachable, both on hover and for a screen reader.
    for (const node of document.querySelectorAll('[data-i18n-title]')) {
      const key = node.getAttribute('data-i18n-title');
      if (t[key] == null) continue;
      node.title = t[key];
      node.setAttribute('aria-label', t[key]);
      node.setAttribute('role', 'img');
    }
    el('uiLang').textContent = t.langBtn;
    el('enabledLabel').title = t.switchTitle;
    document.documentElement.lang = settings.uiLang === 'en' ? 'en' : 'zh-Hant';
  }

  function fillSelect(select, langs, value) {
    const t = T();
    const map = new Map();
    map.set(NONE, t.optNone);
    map.set(NATIVE, t.optNative);   // the always-available source
    for (const l of langs) map.set(l.code, l.label);
    if (value && !map.has(value)) map.set(value, value);
    select.innerHTML = '';
    for (const [code, label] of map) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = (code === NATIVE || code === NONE) ? label : `${label} — ${code}`;
      if (code === value) opt.selected = true;
      select.appendChild(opt);
    }
  }

  function languagesFromState(state) {
    if (state && state.languages && state.languages.length) {
      return state.languages.map((l) => ({
        code: l.language,
        label: (l.label || l.language) + (l.cc ? ' [CC]' : ''),
      }));
    }
    return COMMON.map(([code, label]) => ({ code, label }));
  }

  function setStatus(text, cls) {
    statusEl.textContent = text || '';
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  function clampNum(key, value) {
    const n = NUMBERS[key];
    let v = Number(value);
    if (!Number.isFinite(v)) v = DEFAULTS[key];
    v = Math.max(n.min, Math.min(n.max, v));
    // Snap to the step so repeated nudges cannot drift into 0.6500000000000001.
    v = Math.round(v / n.step) * n.step;
    return n.int ? Math.round(v) : Math.round(v * 1000) / 1000;
  }

  function reflect() {
    for (const id of CHECKS) el(id).checked = !!settings[id];
    for (const key of Object.keys(NUMBERS)) {
      settings[key] = clampNum(key, settings[key]);
      el(OUT_ID[key]).textContent = NUMBERS[key].fmt(settings[key]);
    }
  }

  function gather() {
    for (const id of CHECKS) settings[id] = el(id).checked;
    settings.primaryLang = el('primaryLang').value;
    settings.secondaryLang = el('secondaryLang').value;
  }

  function push() {
    gather();
    reflect();
    api.storage && api.storage.local && api.storage.local.set({ subnf: settings });
    if (onNetflix && tabId != null) {
      api.tabs.sendMessage(tabId, { type: 'subnf-set-settings', settings }, () => void api.runtime.lastError);
    }
  }

  function nudge(key, dir) {
    settings[key] = clampNum(key, Number(settings[key]) + dir * NUMBERS[key].step);
    push();
  }

  // Hold to repeat: the time offsets run -5000..5000 in steps of 100, and
  // clicking a hundred times to cross that range is not a control.
  function bindSpin(btn) {
    const key = btn.getAttribute('data-spin');
    const dir = Number(btn.getAttribute('data-dir'));
    let holdTimer = null, repeatTimer = null;
    const stop = () => {
      clearTimeout(holdTimer); clearInterval(repeatTimer);
      holdTimer = repeatTimer = null;
    };
    btn.addEventListener('click', (e) => { e.preventDefault(); nudge(key, dir); });
    btn.addEventListener('mousedown', () => {
      stop();
      holdTimer = setTimeout(() => { repeatTimer = setInterval(() => nudge(key, dir), 70); }, 450);
    });
    for (const ev of ['mouseup', 'mouseleave', 'blur']) btn.addEventListener(ev, stop);
  }

  function bind() {
    for (const id of [...CHECKS, 'primaryLang', 'secondaryLang']) {
      el(id).addEventListener('change', push);
    }
    for (const btn of document.querySelectorAll('[data-spin]')) bindSpin(btn);
    el('copyTop').addEventListener('click', () => doCopy('top'));
    el('copyBottom').addEventListener('click', () => doCopy('bottom'));
    el('copyBoth').addEventListener('click', () => doCopy('both'));
    el('uiLang').addEventListener('click', () => {
      settings.uiLang = settings.uiLang === 'en' ? 'zh' : 'en';
      applyLanguage();
      // Redraw everything that carries translated text of its own.
      applyState(lastState);
      push();
    });
  }

  // ---- copy the current lines from here ----
  // The reliable path: clicking the picture is a fight with Netflix's own
  // click-catcher, but the popup owns its own buttons. Lines are kept cached
  // and refreshed on a timer, so the click handler can write to the clipboard
  // synchronously -- an await first would spend the user gesture.
  let lines = { top: '', bottom: '' };
  let linesTimer = null;

  function refreshLines() {
    if (!onNetflix || tabId == null) { lines = { top: '', bottom: '' }; renderCopy(); return; }
    api.tabs.sendMessage(tabId, { type: 'subnf-get-lines' }, (res) => {
      if (api.runtime.lastError || !res) lines = { top: '', bottom: '' };
      else lines = { top: res.top || '', bottom: res.bottom || '' };
      renderCopy();
    });
  }

  function renderCopy() {
    const both = [lines.top, lines.bottom].filter(Boolean);
    el('copyTop').disabled = !lines.top;
    el('copyBottom').disabled = !lines.bottom;
    el('copyBoth').disabled = !both.length;
    if (copyNote) return;                       // a flash message is showing
    el('copyPreview').textContent = both.length
      ? both.join('  ／  ')
      : (onNetflix ? T().noSubsNow : '');
  }

  let copyNote = false;
  function flashCopy(text) {
    copyNote = true;
    el('copyPreview').textContent = text;
    setTimeout(() => { copyNote = false; renderCopy(); }, 1200);
  }

  function doCopy(which) {
    const text = which === 'top' ? lines.top
      : which === 'bottom' ? lines.bottom
      : [lines.top, lines.bottom].filter(Boolean).join('\n');
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => flashCopy(T().copied),
      () => flashCopy(T().copyFailed));
  }

  function row(k, v, cls) {
    const li = document.createElement('li');
    const ke = document.createElement('span');
    ke.className = 'k'; ke.textContent = k + ':';
    const ve = document.createElement('span');
    ve.className = 'v' + (cls ? ' ' + cls : ''); ve.textContent = String(v);
    li.appendChild(ke); li.appendChild(ve);
    return li;
  }

  function renderDiag(state) {
    const t = T();
    const list = el('diagList');
    list.innerHTML = '';
    if (!state) { list.appendChild(row(t.dState, t.dNotConnected, 'bad')); return; }
    const d = state.diag || {};
    const yn = (b) => (b ? t.yes : t.no);
    const cls = (b) => (b ? 'good' : 'bad');
    list.appendChild(row(t.dWatch, yn(state.onWatch), cls(state.onWatch)));
    list.appendChild(row(t.dHook, yn(d.pageHook), cls(d.pageHook)));
    list.appendChild(row(t.dPlayerApi, yn(d.hasPlayerApi), cls(d.hasPlayerApi)));
    list.appendChild(row(t.dTracks, d.trackCount || 0, cls((d.trackCount || 0) > 0)));
    list.appendChild(row(t.dSource, d.lastSource || t.dNone, cls(!!d.lastSource)));
    if (d.pageDiag) {
      const p = d.pageDiag;
      list.appendChild(row(t.dPaths, `api=${p.playerApi || 0} json=${p.json || 0} resp=${p.response || 0} xhr=${p.xhr || 0}`));
      list.appendChild(row(t.dProfiles, p.profiles || 0, cls((p.profiles || 0) > 0)));
    }
    const c = d.cues || {};
    list.appendChild(row(t.dCuesTop, c.primary || 0, cls((c.primary || 0) > 0)));
    list.appendChild(row(t.dCuesBottom, c.secondary || 0, cls((c.secondary || 0) > 0)));
    list.appendChild(row(t.dCache, yn(d.fromCache), ''));
    list.appendChild(row(t.dNative, yn(state.nativeVisible), cls(state.nativeVisible)));
    list.appendChild(row(t.dFetch, `${d.fetchOk || 0} / ${d.fetchFail || 0}`, cls((d.fetchOk || 0) > 0 || (d.fetchFail || 0) === 0)));
    if (d.lastError) list.appendChild(row(t.dLastError, d.lastError, 'bad'));
  }

  function applyState(state) {
    lastState = state;
    const t = T();
    const langs = languagesFromState(state);
    fillSelect(el('primaryLang'), langs, settings.primaryLang);
    fillSelect(el('secondaryLang'), langs, settings.secondaryLang);
    reflect();
    renderDiag(onNetflix ? state : null);
    refreshLines();
    if (!linesTimer && onNetflix) linesTimer = setInterval(refreshLines, 700);

    if (!onNetflix) {
      setStatus(t.stOffsite, 'warn');
      hintEl.textContent = t.hintOffsite;
      return;
    }
    const p = state && state.resolved && state.resolved.primary;
    const s = state && state.resolved && state.resolved.secondary;
    if (p && s) {
      setStatus(t.stReady, 'ok');
      hintEl.textContent = t.hintReady;
    } else if (state && state.hasCatalogue) {
      setStatus(t.stPartial, 'warn');
      hintEl.textContent = t.hintPartial;
    } else if (state && state.onWatch) {
      setStatus(t.stNoTracks, 'warn');
      hintEl.textContent = t.hintNoTracks;
    } else {
      setStatus(t.stNoWatch, 'warn');
      hintEl.textContent = '';
    }
  }

  function loadFromTab() {
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      tabId = tab ? tab.id : null;
      onNetflix = !!(tab && /^https:\/\/www\.netflix\.com\//.test(tab.url || ''));
      if (onNetflix && tabId != null) {
        api.tabs.sendMessage(tabId, { type: 'subnf-get-state' }, (state) => {
          if (api.runtime.lastError || !state) { applyState(null); return; }
          if (state.settings) settings = { ...DEFAULTS, ...state.settings };
          applyLanguage();
          applyState(state);
        });
      } else {
        applyState(null);
      }
    });
  }

  api.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'subnf-state') {
      if (msg.settings) settings = { ...DEFAULTS, ...msg.settings };
      applyLanguage();
      applyState(msg);
    }
  });

  function boot() {
    const start = () => { bind(); applyLanguage(); reflect(); loadFromTab(); };
    if (api.storage && api.storage.local) {
      api.storage.local.get('subnf', (res) => {
        if (res && res.subnf) settings = { ...DEFAULTS, ...res.subnf };
        start();
      });
    } else start();
  }
  boot();
})();
