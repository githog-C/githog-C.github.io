// sub-NF popup: read state from the active Netflix tab, edit settings, push
// them back. Falls back to stored settings when no Netflix tab is in focus.
(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;

  const NATIVE = '__native__';
  const NONE = '__none__';

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

  function fillSelect(select, langs, value) {
    const map = new Map();
    map.set(NONE, '（不顯示）');
    // The always-available source: whatever Netflix itself is drawing.
    map.set(NATIVE, 'Netflix 目前顯示的字幕');
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
    const list = el('diagList');
    list.innerHTML = '';
    if (!state) { list.appendChild(row('狀態', '沒有連上 Netflix 分頁', 'bad')); return; }
    const d = state.diag || {};
    const yn = (b) => (b ? '是' : '否');
    const cls = (b) => (b ? 'good' : 'bad');
    list.appendChild(row('播放頁', yn(state.onWatch), cls(state.onWatch)));
    list.appendChild(row('頁面掛鉤有回應', yn(d.pageHook), cls(d.pageHook)));
    list.appendChild(row('Netflix 播放器 API', yn(d.hasPlayerApi), cls(d.hasPlayerApi)));
    list.appendChild(row('抓到字幕軌', d.trackCount || 0, cls((d.trackCount || 0) > 0)));
    list.appendChild(row('來源', d.lastSource || '（無）', cls(!!d.lastSource)));
    if (d.pageDiag) {
      const p = d.pageDiag;
      list.appendChild(row('各路徑', `api=${p.playerApi || 0} json=${p.json || 0} resp=${p.response || 0} xhr=${p.xhr || 0}`));
      list.appendChild(row('已補上 WebVTT 的請求數', p.profiles || 0, cls((p.profiles || 0) > 0)));
    }
    const c = d.cues || {};
    list.appendChild(row('上行 cue 數', c.primary || 0, cls((c.primary || 0) > 0)));
    list.appendChild(row('下行 cue 數', c.secondary || 0, cls((c.secondary || 0) > 0)));
    list.appendChild(row('用了快取軌道', yn(d.fromCache), ''));
    list.appendChild(row('原生字幕可讀', yn(state.nativeVisible), cls(state.nativeVisible)));
    list.appendChild(row('下載成功 / 失敗', `${d.fetchOk || 0} / ${d.fetchFail || 0}`, cls((d.fetchOk || 0) > 0 || (d.fetchFail || 0) === 0)));
    if (d.lastError) list.appendChild(row('最後錯誤', d.lastError, 'bad'));
  }

  function applyState(state) {
    const langs = languagesFromState(state);
    fillSelect(el('primaryLang'), langs, settings.primaryLang);
    fillSelect(el('secondaryLang'), langs, settings.secondaryLang);
    reflect();
    renderDiag(onNetflix ? state : null);

    if (!onNetflix) {
      setStatus('打開 netflix.com 的播放頁即可套用。', 'warn');
      hintEl.textContent = '目前設定已儲存，下次在 Netflix 播放時自動生效。';
      return;
    }
    const p = state && state.resolved && state.resolved.primary;
    const s = state && state.resolved && state.resolved.secondary;
    if (p && s) {
      setStatus('雙語字幕已就緒。', 'ok');
      hintEl.textContent = '也可以直接在 Netflix 的「音訊與字幕」選單裡，用每列右側的圓鈕勾選兩種語言。';
    } else if (state && state.hasCatalogue) {
      setStatus('已載入語言清單，但所選語言此片可能沒有。', 'warn');
      hintEl.textContent = '換一個語言，或把其中一行設成「Netflix 目前顯示的字幕」。';
    } else if (state && state.onWatch) {
      setStatus('尚未取得字幕軌，請先播放幾秒。', 'warn');
      hintEl.textContent = '若一直抓不到，把其中一行設成「Netflix 目前顯示的字幕」仍可運作，並展開下方診斷。';
    } else {
      setStatus('請打開一部片的播放頁。', 'warn');
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
      applyState(msg);
    }
  });

  function boot() {
    const start = () => { bind(); reflect(); loadFromTab(); };
    if (api.storage && api.storage.local) {
      api.storage.local.get('subnf', (res) => {
        if (res && res.subnf) settings = { ...DEFAULTS, ...res.subnf };
        start();
      });
    } else start();
  }
  boot();
})();
