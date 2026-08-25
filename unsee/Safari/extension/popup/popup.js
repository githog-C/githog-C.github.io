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
    'no-dot': '看起來不像網域，要有一個點，例如 threads.com。',
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
})();
