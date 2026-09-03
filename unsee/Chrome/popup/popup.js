/* unsee — popup: the whole settings surface. */
(function () {
  'use strict';

  const M = globalThis.unseeMatcher;
  const listEl = document.getElementById('rule-list');
  const emptyEl = document.getElementById('empty');
  const hintEl = document.getElementById('hint');
  const inputEl = document.getElementById('rule-input');
  const formEl = document.getElementById('add-form');
  const enabledEl = document.getElementById('enabled');

  const DEFAULT_HINT = hintEl.textContent;
  const REASONS = {
    empty: '先輸入一個網域。',
    'no-dot': '看起來不像網域，要有一個點，例如 example.com。',
    'bad-chars': '網域只能有英數字、點與連字號。',
    'bad-edges': '網域不能以點或連字號開頭或結尾。',
  };

  let rules = [];

  function render() {
    listEl.textContent = '';
    for (const rule of rules) {
      const li = document.createElement('li');
      const host = document.createElement('span');
      host.className = 'host';
      host.textContent = rule;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '移除';
      remove.addEventListener('click', () => {
        rules = M.removeRule(rules, rule);
        save();
      });
      li.append(host, remove);
      listEl.appendChild(li);
    }
    emptyEl.hidden = rules.length > 0;
  }

  function save() {
    chrome.storage.sync.set({ rules }, render);
  }

  function setHint(message, isError) {
    hintEl.textContent = message;
    hintEl.classList.toggle('error', Boolean(isError));
  }

  formEl.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const parsed = M.parseRuleInput(inputEl.value);
    if (!parsed.ok) {
      setHint(REASONS[parsed.reason] || '這個網域看不懂。', true);
      return;
    }
    const before = rules.length;
    rules = M.addRule(rules, parsed.rule);
    inputEl.value = '';
    setHint(rules.length === before
      ? parsed.rule + ' 已經被清單裡更上層的規則涵蓋了。'
      : DEFAULT_HINT, false);
    save();
  });

  enabledEl.addEventListener('change', () => {
    chrome.storage.sync.set({ enabled: enabledEl.checked });
  });

  chrome.storage.sync.get({ rules: [], enabled: true }, (stored) => {
    rules = Array.isArray(stored.rules) ? stored.rules : [];
    enabledEl.checked = stored.enabled !== false;
    render();
  });

  /* The file-backed defaults, shown read-only so you can see what is in force
     without opening the file. Editing happens in the file, not here. */
  const summaryEl = document.getElementById('defaults-summary');
  const defaultsEl = document.getElementById('defaults-list');

  fetch(chrome.runtime.getURL('blocklist.txt'))
    .then((response) => (response.ok ? response.text() : ''))
    .then((text) => {
      const parsed = M.parseBlocklistFile(text);
      const entries = parsed.domains.map((d) => ({ kind: '網址', value: d }))
        .concat(parsed.keywords.map((k) => ({ kind: '關鍵字', value: k })));

      summaryEl.textContent = entries.length
        ? '網址 ' + parsed.domains.length + ' 筆、關鍵字 ' + parsed.keywords.length + ' 筆。'
        : '目前是空的。檔案裡的範例都還是註解狀態，拿掉行首的 # 就會生效。';

      for (const entry of entries) {
        const li = document.createElement('li');
        const value = document.createElement('span');
        value.className = 'host';
        value.textContent = entry.value;
        const kind = document.createElement('span');
        kind.className = 'kind';
        kind.textContent = entry.kind;
        li.append(value, kind);
        defaultsEl.appendChild(li);
      }

      if (parsed.problems.length) {
        const li = document.createElement('li');
        li.className = 'problem';
        li.textContent = '有 ' + parsed.problems.length
          + ' 行看不懂，已跳過（第 '
          + parsed.problems.map((p) => p.line).join('、') + ' 行）';
        defaultsEl.appendChild(li);
      }
    })
    .catch(() => {
      summaryEl.textContent = '讀不到 blocklist.txt，預設清單這次沒有生效。';
    });
})();

/* unsee — popup: the tag strip.
   Its own IIFE so it shares nothing with the blocklist half above. */
(function () {
  'use strict';

  const S = globalThis.unseeSnippets;
  const listEl = document.getElementById('tag-list');
  const emptyEl = document.getElementById('tag-empty');
  const hintEl = document.getElementById('tag-hint');
  const inputEl = document.getElementById('tag-input');
  const formEl = document.getElementById('tag-form');
  const switchEl = document.getElementById('tags-enabled');

  const DEFAULT_HINT = hintEl.textContent;
  const REASONS = {
    empty: '先輸入一個字串。',
    'no-text': '等號右邊是空的，等號右邊才是真正加進搜尋框的字。',
    'label-too-long': '標籤名稱太長了，24 個字以內比較放得下。',
  };

  let snippets = [];

  function render() {
    listEl.textContent = '';
    for (const snippet of snippets) {
      const li = document.createElement('li');

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = snippet.label;

      // Only worth showing when it differs from the label; otherwise it is the
      // same word twice.
      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = snippet.label === snippet.text ? '' : snippet.text;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '移除';
      remove.addEventListener('click', () => {
        snippets = S.removeSnippet(snippets, snippet.text);
        save();
      });

      li.append(label, text, remove);
      listEl.appendChild(li);
    }
    emptyEl.hidden = snippets.length > 0;
  }

  function save() {
    chrome.storage.sync.set({ snippets }, render);
  }

  function setHint(message, isError) {
    hintEl.textContent = message;
    hintEl.classList.toggle('error', Boolean(isError));
  }

  formEl.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const parsed = S.parseSnippetLine(inputEl.value);
    if (!parsed.ok) {
      setHint(REASONS[parsed.reason] || '這一行看不懂。', true);
      return;
    }
    const before = snippets.length;
    snippets = S.addSnippet(snippets, parsed.snippet);
    inputEl.value = '';
    setHint(snippets.length === before
      ? parsed.snippet.text + ' 已經在清單裡了。'
      : DEFAULT_HINT, false);
    save();
  });

  switchEl.addEventListener('change', () => {
    chrome.storage.sync.set({ tagsEnabled: switchEl.checked });
  });

  chrome.storage.sync.get({ snippets: [], tagsEnabled: true }, (stored) => {
    snippets = Array.isArray(stored.snippets) ? stored.snippets : [];
    switchEl.checked = stored.tagsEnabled !== false;
    render();
  });

  /* The file-backed tags, read-only, in the order the file gives them. */
  const summaryEl = document.getElementById('tag-defaults-summary');
  const defaultsEl = document.getElementById('tag-defaults-list');

  fetch(chrome.runtime.getURL('snippets.txt'))
    .then((response) => (response.ok ? response.text() : ''))
    .then((text) => {
      const parsed = S.parseSnippetFile(text);

      summaryEl.textContent = parsed.snippets.length
        ? '共 ' + parsed.snippets.length + ' 個標籤，順序就是畫面上的順序。'
        : '目前是空的。檔案裡的範例都還是註解狀態，拿掉行首的 # 就會出現。';

      for (const snippet of parsed.snippets) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = snippet.label;
        const value = document.createElement('span');
        value.className = 'text';
        value.textContent = snippet.label === snippet.text ? '' : snippet.text;
        li.append(label, value);
        defaultsEl.appendChild(li);
      }

      if (parsed.problems.length) {
        const li = document.createElement('li');
        li.className = 'problem';
        li.textContent = '有 ' + parsed.problems.length
          + ' 行看不懂，已跳過（第 '
          + parsed.problems.map((p) => p.line).join('、') + ' 行）';
        defaultsEl.appendChild(li);
      }
    })
    .catch(() => {
      summaryEl.textContent = '讀不到 snippets.txt，檔案清單這次沒有生效。';
    });
})();
