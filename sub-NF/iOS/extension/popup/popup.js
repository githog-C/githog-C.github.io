// sub-NF popup: read state from the active Netflix tab, edit settings, push
// them back. Falls back to stored settings when no Netflix tab is in focus.
(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;

  const DEFAULTS = {
    enabled: true, primaryLang: 'en', secondaryLang: 'zh-Hant',
    hideNative: true, preferCC: false, fontScale: 1.0, bottomVh: 12, gap: 4,
    primaryOffsetMs: 0, secondaryOffsetMs: 0, swapOrder: false,
  };

  // Common Netflix languages, for when no title has been opened yet.
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

  function q(sel) { return document.querySelector(sel); }

  function fillSelect(select, langs, value) {
    const map = new Map();
    for (const l of langs) map.set(l.code, l.label);
    // guarantee the current value is present
    if (value && !map.has(value)) map.set(value, value);
    select.innerHTML = '';
    for (const [code, label] of map) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${label} — ${code}`;
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

  function reflect() {
    el('enabled').checked = !!settings.enabled;
    el('swapOrder').checked = !!settings.swapOrder;
    el('hideNative').checked = !!settings.hideNative;
    el('preferCC').checked = !!settings.preferCC;
    el('fontScale').value = settings.fontScale;
    el('bottomVh').value = settings.bottomVh;
    el('gap').value = settings.gap;
    el('primaryOffsetMs').value = settings.primaryOffsetMs;
    el('secondaryOffsetMs').value = settings.secondaryOffsetMs;
    el('fontScaleOut').textContent = Number(settings.fontScale).toFixed(2) + '×';
    el('bottomVhOut').textContent = settings.bottomVh + ' vh';
    el('gapOut').textContent = settings.gap + ' px';
    el('primaryOffsetOut').textContent = (settings.primaryOffsetMs / 1000).toFixed(1) + ' s';
    el('secondaryOffsetOut').textContent = (settings.secondaryOffsetMs / 1000).toFixed(1) + ' s';
  }

  function gather() {
    settings.enabled = el('enabled').checked;
    settings.swapOrder = el('swapOrder').checked;
    settings.hideNative = el('hideNative').checked;
    settings.preferCC = el('preferCC').checked;
    settings.fontScale = parseFloat(el('fontScale').value);
    settings.bottomVh = parseInt(el('bottomVh').value, 10);
    settings.gap = parseInt(el('gap').value, 10);
    settings.primaryOffsetMs = parseInt(el('primaryOffsetMs').value, 10);
    settings.secondaryOffsetMs = parseInt(el('secondaryOffsetMs').value, 10);
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

  function bind() {
    for (const id of ['enabled', 'swapOrder', 'hideNative', 'preferCC',
      'primaryLang', 'secondaryLang']) {
      el(id).addEventListener('change', push);
    }
    for (const id of ['fontScale', 'bottomVh', 'gap', 'primaryOffsetMs', 'secondaryOffsetMs']) {
      el(id).addEventListener('input', push);
    }
  }

  function applyState(state) {
    const langs = languagesFromState(state);
    fillSelect(el('primaryLang'), langs, settings.primaryLang);
    fillSelect(el('secondaryLang'), langs, settings.secondaryLang);
    reflect();

    if (!onNetflix) {
      setStatus('打開 netflix.com 的播放頁即可套用。', 'warn');
      hintEl.textContent = '目前設定已儲存，下次在 Netflix 播放時自動生效。';
      return;
    }
    if (state && state.hasCatalogue) {
      const p = state.resolved && state.resolved.primary;
      const s = state.resolved && state.resolved.secondary;
      if (p && s) setStatus('雙語字幕已就緒。', 'ok');
      else setStatus('已載入語言清單，但所選語言此片可能沒有。', 'warn');
      hintEl.textContent = '語言清單來自本片實際可用的字幕軌。';
    } else {
      setStatus('請先在此頁開始播放，讓字幕軌載入。', 'warn');
      hintEl.textContent = '按下播放後幾秒，語言清單就會出現。';
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
          applyState(state);
        });
      } else {
        applyState(null);
      }
    });
  }

  // Content script may broadcast fresh state when a title's tracks load.
  api.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'subnf-state') {
      if (msg.settings) settings = { ...DEFAULTS, ...msg.settings };
      applyState(msg);
    }
  });

  function boot() {
    api.storage && api.storage.local && api.storage.local.get('subnf', (res) => {
      if (res && res.subnf) settings = { ...DEFAULTS, ...res.subnf };
      bind();
      reflect();
      loadFromTab();
    });
  }
  boot();
})();
