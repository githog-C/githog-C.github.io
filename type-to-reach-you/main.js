/* ===== Type to Reach You / 深深一擊 DepthDot =====
   main.js — 模式切換、資料載入、打字練習核心邏輯
   ============================================== */

(() => {
  'use strict';

  // ---------- 設定 ----------

  const PLATFORMS = [
    { key: 'streetvoice',  label: 'StreetVoice', short: 'SV'   },
    { key: 'youtube',      label: 'YouTube',     short: 'YT'   },
    { key: 'spotify',      label: 'Spotify',     short: 'Sptf' },
    { key: 'apple-music',  label: 'Apple Music', short: 'iT'   },
    { key: 'soundcloud',   label: 'SoundCloud',  short: 'SC'   },
    { key: 'line-music',   label: 'LINE MUSIC',  short: 'LINE' },
    { key: 'amazon-music', label: 'Amazon Music',short: 'AMZ'  },
    { key: 'kkbox',        label: 'KKBOX',       short: 'KK'   }
  ];

  const TABS_NORMAL = [
    { id: 'en',   label: '英文',   file: 'data/list_en.txt',   kind: 'en'   },
    { id: 'code', label: '程式碼', file: 'data/list_code.txt', kind: 'code' },
    { id: 'tw',   label: '繁中',   file: 'data/list_tw.txt',   kind: 'cn'   }
  ];
  const TABS_DEPTH = [
    { id: 'en',     label: '英文',   file: 'data/list_en.txt',   kind: 'en'   },
    { id: 'code',   label: '程式碼', file: 'data/list_code.txt', kind: 'code' },
    { id: 'lyrics', label: '歌詞',   file: null,                 kind: 'cn'   }
  ];

  // ---------- 彩蛋固定文案 ----------
  const EGG = {
    STAGE2_TEXT: '你各位都是最棒的觀眾！',
    STAGE2_BTN:  '乾杯！！！！',
    STAGE1_BTNS: ['好', '好QQ']
  };

  // ---------- 狀態 ----------
  const state = {
    mode: 'normal',       // 'normal' | 'depth'
    tabId: 'en',
    texts: {},            // tabId -> [paragraphs]
    lyrics: {},           // songName -> [paragraphs]
    links: {},            // section -> { key: url }
    lyricFiles: [],       // 動態從 list_links.txt 推導
    currentIdx: 0,
    target: '',
    typed: '',
    startTs: 0,
    _endTs: 0,
    errors: 0,
    finished: false,
    timer: null,
    compareMode: 'A'
  };

  // ---------- 工具 ----------
  const $ = sel => document.querySelector(sel);

  function pickRandom(arr) {
    if (!arr || !arr.length) return -1;
    return Math.floor(Math.random() * arr.length);
  }

  function parseListFile(text) {
    const lines = text.split(/\r?\n/);
    const paragraphs = [];
    let buf = [];
    for (const line of lines) {
      if (line.trim().startsWith('#')) continue;
      if (line.trim() === '') {
        if (buf.length) { paragraphs.push(buf.join('\n').trim()); buf = []; }
      } else {
        buf.push(line);
      }
    }
    if (buf.length) paragraphs.push(buf.join('\n').trim());
    return paragraphs.filter(p => p.length);
  }

  // 歌詞專用解析：略過開頭的標題與版權／製作資訊段落
  function parseLyricsFile(text) {
    const paras = parseListFile(text);
    let i = 0;
    while (i < paras.length) {
      const p = paras[i];
      const lines = p.split('\n').filter(l => l.trim());
      // 版權/製作資訊特徵：≤3 行且含 詞/曲/編曲/混音/製作 等關鍵字
      const isMeta = lines.length <= 3 && /詞|曲|編曲|混音|製作/.test(p);
      if (isMeta) { i++; continue; }
      break;
    }
    return paras.slice(i);
  }

  function parseLinksFile(text) {
    const out = {};
    let cur = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^\[(.+)\]$/);
      if (m) { cur = m[1]; out[cur] = {}; continue; }
      if (cur) {
        const i = line.indexOf('=');
        if (i > 0) {
          const k = line.slice(0, i).trim();
          const v = line.slice(i + 1).trim();
          out[cur][k] = v;
        }
      }
    }
    return out;
  }

  // ---------- 載入資料（A 版：自 <script src> 載入的 window 全域變數讀取，file:// 與 https:// 一致） ----------
  function loadAll() {
    state.texts['en']   = parseListFile(window.LIST_EN   || '');
    state.texts['code'] = parseListFile(window.LIST_CODE || '');
    state.texts['tw']   = parseListFile(window.LIST_TW   || '');
    // 連結先於歌詞（動態推導 lyricFiles 需要 state.links 先就緒）
    state.links = parseLinksFile(window.LIST_LINKS || '');
    // 動態歌曲清單：list_links 中非 social／shop 的所有 section
    state.lyricFiles = Object.keys(state.links)
      .filter(k => k !== 'social' && k !== 'shop');
    // 歌詞：自 window.LYRICS 物件取，key 為歌名
    const LY = window.LYRICS || {};
    for (const name of state.lyricFiles) {
      state.lyrics[name] = parseLyricsFile(LY[name] || '');
    }
  }

  // ---------- 取得題目清單 ----------
  function questionsForCurrentTab() {
    if (state.mode === 'depth' && state.tabId === 'lyrics') {
      const items = [];
      for (const song of state.lyricFiles) {
        const paras = state.lyrics[song] || [];
        if (!paras.length) continue;
        items.push({ text: paras.join('\n\n'), song });
      }
      return items;
    }
    const paras = state.texts[state.tabId] || [];
    return paras.map((p, i) => ({ text: p, idx: i }));
  }

  // ---------- 渲染：模式整體 ----------
  function applyMode() {
    document.documentElement.setAttribute('data-mode', state.mode);
    const titleMain   = $('#titleMain');
    const titleCredit = $('#titleCredit');
    if (state.mode === 'depth') {
      titleMain.textContent = '深深一擊 DepthDot';
      titleCredit.textContent = '[詞曲版權皆屬深深]';
      titleCredit.style.display = '';
    } else {
      titleMain.textContent = 'Type to Reach You\u3000打字練習';
      titleCredit.textContent = '';
      titleCredit.style.display = 'none';
    }
    applyTitleExtras();
    renderTabs();
    applyFooterEgg();
  }

  function applyTitleExtras() {
    const social = $('#titleSocial');
    const shop   = $('#titleShop');
    if (state.mode === 'depth') {
      social.hidden = false;
      shop.hidden   = false;
      renderSocial();
      renderShop();
    } else {
      social.hidden = true;
      shop.hidden   = true;
    }
  }

  // 社群連結：[social] 區的 key 即顯示標籤（如 FB/YT/IG/SV），value 為 URL
  // 動態：新增社群平台只需在 list_links.txt [social] 加一行 標籤=URL
  function renderSocial() {
    const links  = state.links.social || {};
    const entries = Object.entries(links).filter(([, v]) => (v || '').trim());
    const host   = $('#titleSocial');
    host.innerHTML = '';
    if (!entries.length) { host.hidden = true; return; }
    host.hidden = false;
    host.appendChild(document.createTextNode('['));
    entries.forEach(([key, url], i) => {
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = key; a.className = 'social-link';
      host.appendChild(a);
      if (i < entries.length - 1) host.appendChild(document.createTextNode('\uff0e'));
    });
    host.appendChild(document.createTextNode(']'));
  }

  function renderShop() {
    const shops = Object.entries(state.links.shop || {})
                        .filter(([, v]) => (v || '').trim());
    const host  = $('#titleShop');
    host.innerHTML = '';
    if (!shops.length) return;
    host.appendChild(document.createTextNode('['));
    const sel = document.createElement('select');
    sel.className = 'shop-select';
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = '購買專輯／周邊';
    ph.disabled = true; ph.selected = true;
    sel.appendChild(ph);
    for (const [name, url] of shops) {
      const opt = document.createElement('option');
      opt.value = url; opt.textContent = name;
      sel.appendChild(opt);
    }
    host.appendChild(sel);
    host.appendChild(document.createTextNode(']'));
    const anchor = document.createElement('a');
    anchor.className = 'shop-anchor disabled';
    anchor.href = '#'; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    anchor.textContent = '\u2197'; // ↗
    anchor.setAttribute('aria-label', '前往所選通路');
    anchor.addEventListener('click', e => {
      if (anchor.classList.contains('disabled')) e.preventDefault();
    });
    sel.addEventListener('change', () => {
      anchor.href = sel.value || '#';
      anchor.classList.toggle('disabled', !sel.value);
    });
    host.appendChild(anchor);
  }

  // ---------- Footer 彩蛋符號 ----------
  function applyFooterEgg() {
    const el = $('#footerEgg');
    if (!el) return;
    if (state.mode === 'depth') {
      el.textContent = '\u3000\uD80C\uDDB8\u3000\u00B7'; // 　𓆸　·
      el.hidden = false;
    } else if (state.mode === 'normal' && state.tabId === 'tw') {
      el.textContent = '\u3000\uD80C\uDDB9\u3000\u00B7'; // 　𓆹　·
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  // ---------- Tabs ----------
  function renderTabs() {
    const list = state.mode === 'depth' ? TABS_DEPTH : TABS_NORMAL;
    const bar  = $('#tabsBar');
    bar.innerHTML = '';
    for (const tab of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab' + (tab.id === state.tabId ? ' active' : '');
      btn.textContent = tab.label;
      btn.addEventListener('click', () => onTabClick(tab));
      bar.appendChild(btn);
    }
    renderQuestionControls();
  }

  function onTabClick(tab) {
    if (state.mode === 'depth' && (tab.id === 'en' || tab.id === 'code')) {
      state.mode  = 'normal';
      state.tabId = tab.id;
      applyMode();
      pickRandomQuestion();
      return;
    }
    state.tabId = tab.id;
    renderTabs();
    applyFooterEgg();
    pickRandomQuestion();
  }

  function toggleFocusMode() {
    if (document.body.classList.contains('focus-mode')) exitFocusMode();
    else enterFocusMode();
  }
  function enterFocusMode() {
    document.body.classList.add('focus-mode');
    $('#input').focus();
  }
  function exitFocusMode() {
    document.body.classList.remove('focus-mode');
    $('#input').focus();
  }

  function toggleMode() {
    if (state.mode === 'normal') {
      state.mode = 'depth';
      if (state.tabId === 'tw') state.tabId = 'lyrics';
    } else {
      state.mode = 'normal';
      if (state.tabId === 'lyrics') state.tabId = 'tw';
    }
    applyMode();
    pickRandomQuestion();
  }

  // ---------- 題目選擇列 ----------
  function renderQuestionControls() {
    const host = $('#qControls');
    host.innerHTML = '';

    const randBtn = document.createElement('button');
    randBtn.className = 'btn'; randBtn.type = 'button';
    randBtn.textContent = '隨機出題';
    randBtn.addEventListener('click', pickRandomQuestion);

    const label = document.createElement('span');
    label.className = 'q-label'; label.textContent = '題目：';

    const sel = document.createElement('select');
    sel.className = 'q-select grow'; sel.id = 'qSelect';

    const qs = questionsForCurrentTab();
    qs.forEach((q, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      if (q.song) {
        opt.textContent = `${String(i + 1).padStart(2, '0')}. ${q.song}`;
      } else {
        const preview = (q.text || '').replace(/\s+/g, ' ').slice(0, 36);
        opt.textContent = `${String(i + 1).padStart(2, '0')}. ${preview}${q.text.length > 36 ? '\u2026' : ''}`;
      }
      sel.appendChild(opt);
    });
    if (state.currentIdx >= qs.length) state.currentIdx = 0;
    sel.value = String(state.currentIdx);
    sel.addEventListener('change', () => {
      state.currentIdx = parseInt(sel.value, 10) || 0;
      loadQuestion();
    });

    host.appendChild(randBtn);
    host.appendChild(label);
    host.appendChild(sel);

    const listenRow  = $('#listenRow');
    const compareRow = $('#compareRow');
    if (state.mode === 'depth' && state.tabId === 'lyrics') {
      listenRow.style.display  = '';
      compareRow.style.display = '';
      renderListenRow();
    } else {
      listenRow.style.display  = 'none';
      compareRow.style.display = 'none';
    }
  }

  function renderListenRow() {
    const qs   = questionsForCurrentTab();
    const cur  = qs[state.currentIdx];
    const song = cur && cur.song;
    const links = (song && state.links[song]) || {};
    const host  = $('#listenList');
    host.innerHTML = '';
    for (const p of PLATFORMS) {
      const v = ((links[p.key] ?? '')).trim();
      if (!v) continue;
      if (/^https?:\/\//i.test(v)) {
        const a = document.createElement('a');
        a.className = 'listen-link';
        a.href = v; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = `[${p.short}]`; a.title = p.label;
        host.appendChild(a);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'listen-link egg-trigger';
        btn.textContent = `[${p.short}]`; btn.title = p.label;
        btn.addEventListener('click', () => showEggPopup(v));
        host.appendChild(btn);
      }
    }
  }

  // ---------- 彩蛋彈窗（兩階段 modal） ----------
  let _eggPrevFocus = null;

  function showEggPopup(stage1Text) {
    _eggPrevFocus = document.activeElement;
    _renderEggStage1(stage1Text);
    const m = $('#eggModal');
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('show'));
    _trapEggFocus();
  }

  function _renderEggStage1(text) {
    // 原樣顯示，不做任何半形／全形轉換
    $('#eggModalText').textContent = text;
    const acts = $('#eggModalActions');
    acts.innerHTML = '';
    for (const label of EGG.STAGE1_BTNS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'egg-btn';
      b.textContent = label;
      b.addEventListener('click', _renderEggStage2);
      acts.appendChild(b);
    }
    acts.firstChild && acts.firstChild.focus();
  }

  function _renderEggStage2() {
    $('#eggModalText').textContent = EGG.STAGE2_TEXT;
    const acts = $('#eggModalActions');
    acts.innerHTML = '';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'egg-btn';
    b.textContent = EGG.STAGE2_BTN;
    b.addEventListener('click', _closeEggPopup);
    acts.appendChild(b);
    b.focus();
  }

  function _closeEggPopup() {
    const m = $('#eggModal');
    m.classList.remove('show');
    setTimeout(() => {
      m.hidden = true;
      if (_eggPrevFocus && document.contains(_eggPrevFocus)) {
        _eggPrevFocus.focus();
      } else {
        $('#input').focus();
      }
      _eggPrevFocus = null;
    }, 200);
  }

  function _trapEggFocus() {
    function onKey(e) {
      if ($('#eggModal').hidden) {
        document.removeEventListener('keydown', onKey);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); _closeEggPopup(); }
    }
    document.addEventListener('keydown', onKey);
  }

  // ---------- 題目載入與顯示 ----------
  function pickRandomQuestion() {
    const qs = questionsForCurrentTab();
    if (!qs.length) {
      state.target = ''; state.currentIdx = 0;
      renderDisplay(); return;
    }
    state.currentIdx = pickRandom(qs);
    const sel = $('#qSelect');
    if (sel) sel.value = String(state.currentIdx);
    loadQuestion();
  }

  function loadQuestion() {
    const qs  = questionsForCurrentTab();
    const cur = qs[state.currentIdx];
    state.target   = cur ? cur.text : '';
    state.typed    = '';
    state.errors   = 0;
    state.startTs  = 0;
    state._endTs   = 0;
    state.finished = false;
    stopTimer();
    const input = $('#input');
    input.value = '';
    renderDisplay(); renderStats();
    if (state.mode === 'depth' && state.tabId === 'lyrics') renderListenRow();
  }

  function renderDisplay() {
    const disp = $('#display');
    const tab  = currentTabMeta();
    disp.className = 'display' + (tab.kind === 'cn' ? ' cn' : '');
    disp.innerHTML = '';
    const target = state.target;
    const typed  = state.typed;
    const tokens = tab.kind === 'code' ? lightTokenize(target) : null;
    if (tokens) {
      let pos = 0;
      for (const tk of tokens) {
        const frag = document.createDocumentFragment();
        for (const ch of tk.text) {
          const span = makeCharSpan(ch, pos, typed);
          if (tk.cls) span.classList.add(tk.cls);
          frag.appendChild(span); pos++;
        }
        disp.appendChild(frag);
      }
    } else {
      for (let i = 0; i < target.length; i++) {
        disp.appendChild(makeCharSpan(target[i], i, typed));
      }
    }
    $('.ch.cursor')?.scrollIntoView({ block: 'center' });
  }

  function makeCharSpan(ch, i, typed) {
    const span = document.createElement('span');
    span.className = 'ch';
    if (ch === '\n') {
      span.textContent = '\u21b5'; // ↵
      span.appendChild(document.createTextNode('\n'));
    } else {
      span.textContent = ch;
    }
    if (i < typed.length) {
      span.classList.add(typed[i] === ch ? 'done' : 'err');
    } else if (i === typed.length) {
      span.classList.add('cursor');
    }
    return span;
  }

  // ---------- 簡易程式碼 token 化 ----------
  const KW = new Set([
    'function','return','const','let','var','if','else','for','while','do','switch','case','break','continue',
    'class','new','this','super','async','await','try','catch','finally','throw','import','export','default',
    'def','True','False','None','elif','lambda','yield','pass','self','in','is','not','and','or','from','as','with'
  ]);

  function lightTokenize(src) {
    const out = []; let i = 0; const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i+1] === '/') {
        const j = src.indexOf('\n', i); const end = j === -1 ? n : j;
        out.push({ text: src.slice(i, end), cls: 'tok-com' }); i = end; continue;
      }
      if (c === '#') {
        const j = src.indexOf('\n', i); const end = j === -1 ? n : j;
        out.push({ text: src.slice(i, end), cls: 'tok-com' }); i = end; continue;
      }
      if (c === '/' && src[i+1] === '*') {
        const j = src.indexOf('*/', i + 2); const end = j === -1 ? n : j + 2;
        out.push({ text: src.slice(i, end), cls: 'tok-com' }); i = end; continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        const q = c; let j = i + 1;
        while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === q) { j++; break; } j++; }
        out.push({ text: src.slice(i, j), cls: 'tok-str' }); i = j; continue;
      }
      if (/[0-9]/.test(c)) {
        let j = i + 1; while (j < n && /[0-9.]/.test(src[j])) j++;
        out.push({ text: src.slice(i, j), cls: 'tok-num' }); i = j; continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        let j = i + 1; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
        const word = src.slice(i, j);
        out.push({ text: word, cls: KW.has(word) ? 'tok-kw' : '' }); i = j; continue;
      }
      out.push({ text: c, cls: '' }); i++;
    }
    return out;
  }

  // ---------- 輸入處理 ----------
  function currentTabMeta() {
    const list = state.mode === 'depth' ? TABS_DEPTH : TABS_NORMAL;
    return list.find(t => t.id === state.tabId) || list[0];
  }

  function onInput(e) {
    const v = e.target.value;
    if (state.finished) return;
    if (state.startTs === 0 && v.length > 0) { state.startTs = performance.now(); startTimer(); }
    state.typed = v;
    let errCount = 0;
    const lim = Math.min(v.length, state.target.length);
    for (let i = 0; i < lim; i++) { if (v[i] !== state.target[i]) errCount++; }
    errCount += Math.max(0, v.length - state.target.length);
    state.errors = errCount;
    renderDisplay(); renderStats();
    if (v === state.target) {
      state.finished = true; stopTimer(); renderStats();
    }
  }

  function renderStats() {
    const tab = currentTabMeta();
    const isCN = tab.kind === 'cn';
    const elapsedMs = state.startTs
      ? ((state.finished ? state._endTs || performance.now() : performance.now()) - state.startTs)
      : 0;
    if (state.finished && !state._endTs) state._endTs = performance.now();
    const elapsedSec = elapsedMs / 1000;
    const typedLen   = state.typed.length;
    const correct    = Math.max(0, typedLen - state.errors);
    const acc  = typedLen > 0 ? Math.max(0, Math.round((correct / typedLen) * 1000) / 10) : 0;
    const cpm  = elapsedSec > 0 ? Math.round((correct / elapsedSec) * 60) : 0;
    const wpm  = elapsedSec > 0 ? Math.round(((correct / 5) / elapsedSec) * 60) : 0;
    if (isCN) {
      $('#statSpeed').innerHTML = `CPM <span class="v">${cpm}</span>`;
    } else {
      $('#statSpeed').innerHTML = `WPM <span class="v">${wpm}</span>\u3000CPM <span class="v">${cpm}</span>`;
    }
    $('#statAcc').innerHTML  = `\u6b63\u78ba\u7387 <span class="v">${acc}%</span>`;
    $('#statTime').innerHTML = `\u6642\u9593 <span class="v">${elapsedSec.toFixed(1)}s</span>`;
    $('#statErr').innerHTML  = `\u932f\u8aa4 <span class="v err">${state.errors}</span>`;
  }

  let timerRaf = null;
  function startTimer() {
    function loop() { renderStats(); timerRaf = requestAnimationFrame(loop); }
    timerRaf = requestAnimationFrame(loop);
  }
  function stopTimer() {
    if (timerRaf) cancelAnimationFrame(timerRaf);
    timerRaf = null;
  }

  // ---------- 啟動 ----------
  async function init() {
    $('#input').addEventListener('input', onInput);
    $('#restartBtn').addEventListener('click', () => { loadQuestion(); $('#input').focus(); });
    $('#nextBtn').addEventListener('click', () => {
      const qs = questionsForCurrentTab();
      state.currentIdx = (state.currentIdx + 1) % Math.max(qs.length, 1);
      const sel = $('#qSelect');
      if (sel) sel.value = String(state.currentIdx);
      loadQuestion(); $('#input').focus();
    });
    $('#compareSelect').addEventListener('change', e => { state.compareMode = e.target.value; });

    const footerEgg = $('#footerEgg');
    footerEgg.addEventListener('click', toggleMode);
    footerEgg.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMode(); }
    });

    const focusToggle = $('#focusToggle');
    focusToggle.addEventListener('click', toggleFocusMode);
    focusToggle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFocusMode(); }
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('#eggModal').hidden) return;
      if (document.body.classList.contains('focus-mode')) {
        e.preventDefault();
        exitFocusMode();
      }
    });

    loadAll();
    applyMode();
    pickRandomQuestion();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
