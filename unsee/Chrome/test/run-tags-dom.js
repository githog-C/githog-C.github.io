/*
 * unsee — tag strip, wiring test. Run: node test/run-tags-dom.js
 *
 * run-tests.js covers the pure functions. This covers the part that has burnt
 * this project twice: code that is logically correct and never actually runs.
 * A DOM small enough to fit in one file cannot prove anything about Google's
 * real markup — the selectors and the layout still have to be seen in a browser
 * — but it does prove that tags.js mounts, that a click reaches the box, and
 * that the switches take the strip down, none of which should need a browser to
 * find out.
 */

/* ---------- a DOM, roughly ---------- */

class FakeEvent {
  constructor(type, init) {
    this.type = type;
    this.bubbles = !!(init && init.bubbles);
    this.defaultPrevented = false;
    this.shiftKey = !!(init && init.shiftKey);
    this.ctrlKey = !!(init && init.ctrlKey);
    this.metaKey = !!(init && init.metaKey);
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { }
}

class El {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.style = { cssText: '' };
    this.className = '';
    this.id = '';
    this._text = '';
    this._value = '';
    this._selStart = 0;
    this._selEnd = 0;
    this._visible = true;
  }

  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join('');
    return this._text;
  }
  set textContent(value) {
    this.children.forEach((c) => { c.parentElement = null; });
    this.children = [];
    this._text = String(value);
  }

  get isConnected() {
    let node = this;
    while (node.parentElement) node = node.parentElement;
    return node === document.documentElement;
  }

  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  removeAttribute(name) { delete this.attributes[name]; }
  toggleAttribute(name, force) {
    const on = force === undefined ? !this.hasAttribute(name) : !!force;
    if (on) this.attributes[name] = '';
    else delete this.attributes[name];
    return on;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    const at = siblings.indexOf(this);
    if (at !== -1) siblings.splice(at, 1);
    this.parentElement = null;
  }
  insertAdjacentElement(where, element) {
    element.remove();
    if (where === 'afterbegin') {
      element.parentElement = this;
      this.children.unshift(element);
      return element;
    }
    const parent = this.parentElement;
    if (!parent) throw new Error('nothing to insert next to');
    const at = parent.children.indexOf(this);
    if (where === 'beforebegin') parent.children.splice(at, 0, element);
    else if (where === 'afterend') parent.children.splice(at + 1, 0, element);
    else throw new Error('unsupported position: ' + where);
    element.parentElement = parent;
    return element;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (matchesSelector(node, selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  descendants() {
    const out = [];
    for (const child of this.children) {
      out.push(child);
      out.push(...child.descendants());
    }
    return out;
  }
  querySelectorAll(selector) {
    return this.descendants().filter((el) => matchesSelector(el, selector));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  get firstElementChild() { return this.children[0] || null; }

  getClientRects() { return this._visible ? [{ width: 100, height: 20 }] : []; }

  getBoundingClientRect() {
    const [x, y, w, h] = this._rect || [0, 0, 0, 0];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h };
  }

  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  dispatchEvent(event) {
    event.currentTarget = event.currentTarget || this;
    event.target = this;
    (this.listeners[event.type] || []).forEach((fn) => fn(event));
    return !event.defaultPrevented;
  }

  focus() { }
  select() { }

  get selectionStart() { return this._selStart; }
  get selectionEnd() { return this._selEnd; }
  setSelectionRange(start, end) { this._selStart = start; this._selEnd = end; }
}

/* Setting .value collapses the selection to the end, as it does in a browser —
   which is exactly why the "" tag has to put the selection back itself. */
class HTMLInputElement extends El {
  get value() { return this._value; }
  set value(v) { this._value = String(v); this._selStart = this._selEnd = this._value.length; }
}
class HTMLTextAreaElement extends El {
  get value() { return this._value; }
  set value(v) { this._value = String(v); this._selStart = this._selEnd = this._value.length; }
}
class HTMLFormElement extends El {
  constructor() { super('form'); this.submitted = 0; }
  requestSubmit() { this.submitted++; }
}

function matchesSelector(el, selector) {
  const sel = String(selector).trim();

  const withAttr = /^([a-zA-Z]*)\[([a-zA-Z-]+)="([^"]*)"\]$/.exec(sel);
  if (withAttr) {
    return (!withAttr[1] || el.tagName === withAttr[1].toUpperCase())
      && el.getAttribute(withAttr[2]) === withAttr[3];
  }
  const byId = /^#([\w-]+)$/.exec(sel);
  if (byId) return el.id === byId[1];

  const byClass = /^([a-zA-Z]*)\.([\w-]+)$/.exec(sel);
  if (byClass) {
    return (!byClass[1] || el.tagName === byClass[1].toUpperCase())
      && String(el.className).split(/\s+/).includes(byClass[2]);
  }
  return el.tagName === sel.toUpperCase();
}

function makeElement(tagName) {
  const tag = String(tagName).toLowerCase();
  if (tag === 'input') return new HTMLInputElement('input');
  if (tag === 'textarea') return new HTMLTextAreaElement('textarea');
  if (tag === 'form') return new HTMLFormElement();
  return new El(tag);
}

const documentElement = new El('html');
const document = {
  documentElement,
  body: null,
  createElement: makeElement,
  addEventListener() { },
  getElementById(id) {
    return documentElement.descendants().find((el) => el.id === id) || null;
  },
  querySelector(sel) { return documentElement.querySelector(sel); },
  querySelectorAll(sel) { return documentElement.querySelectorAll(sel); },
};

/* A stand-in for a Google results page: the header row with the textarea Google
   actually uses plus one stale off-screen input named q (they exist, and picking
   the wrong one is the obvious way to get this wrong), and the results grid —
   #rcnt holding #center_col holding #rso, which is the shape the strip's
   placement logic reads. */
const body = documentElement.appendChild(new El('body'));
document.body = body;

const header = body.appendChild(new El('div'));
header._css = { display: 'flex' };

const form = header.appendChild(makeElement('form'));
const box = form.appendChild(makeElement('textarea'));
box.setAttribute('name', 'q');

/* Measured off a live results page, because the suggestion-band arithmetic is
   the whole point of these two numbers: the form reaches to 1091, the box only
   to 890, and the list that hangs under the box reaches 1071. */
form._rect = [230, 26, 861, 52];
box._rect = [231, 27, 659, 50];

const stale = form.appendChild(makeElement('input'));
stale.setAttribute('name', 'q');
stale._visible = false;

const rcnt = body.appendChild(new El('div'));
rcnt.id = 'rcnt';
rcnt._css = { display: 'grid' };

const center = rcnt.appendChild(new El('div'));
center.id = 'center_col';

const rso = center.appendChild(new El('div'));
rso.id = 'rso';

/* Only the properties the placement logic actually reads. */
globalThis.getComputedStyle = (el) => Object.assign({
  display: 'block',
  position: 'static',
  visibility: 'visible',
  overflowX: 'visible',
}, el && el._css);

/* ---------- the rest of the browser ---------- */

let clipboard = '';
let storageChanged = null;
const messages = [];

const stored = { snippets: [], tagsEnabled: true, enabled: true };

globalThis.document = document;
globalThis.window = globalThis;
globalThis.addEventListener = () => { };
globalThis.location = {
  hostname: 'www.google.com',
  href: 'https://www.google.com/search?q=old&udm=14&start=20',
};
globalThis.Event = FakeEvent;
globalThis.HTMLInputElement = HTMLInputElement;
globalThis.HTMLTextAreaElement = HTMLTextAreaElement;
/* node has had its own `navigator` global since v21 and a plain assignment to it
   does nothing at all — which is worth knowing, because the symptom is a copy
   test that fails while the copy code is fine. */
Object.defineProperty(globalThis, 'navigator', {
  value: {
    // Not a Mac, so Ctrl is the quoting modifier and the context menu is the
    // right button only. The Mac split is a branch on this string.
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0',
    platform: 'Win32',
    clipboard: { writeText: (t) => { clipboard = t; return Promise.resolve(); } },
  },
  configurable: true,
  writable: true,
});
globalThis.MutationObserver = class { observe() { } disconnect() { } };
globalThis.chrome = {
  runtime: {
    getURL: (p) => p,
    sendMessage: (message) => { messages.push(message); },
  },
  storage: {
    sync: {
      get(defaults, done) { done(Object.assign({}, defaults, stored)); },
      set(values, done) { Object.assign(stored, values); if (done) done(); },
    },
    onChanged: { addListener(fn) { storageChanged = fn; } },
  },
};

const FILE = ['# comment', 'edu', 'site:edu.tw', '教育部 = site:moe.gov.tw'].join('\n');
globalThis.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(FILE) });

globalThis.unseeMatcher = require('../src/matcher.js');
globalThis.unseeSnippets = require('../src/snippets.js');
require('../src/tags.js');

/* ---------- assertions ---------- */

let pass = 0;
const failures = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else failures.push(label + '\n    expected ' + e + '\n    actual   ' + a);
}

function strip() { return document.getElementById('unsee-tags'); }
function chips() { const s = strip(); return s ? s.querySelectorAll('.unsee-tag') : []; }
function click(chip, modifiers) { chip.dispatchEvent(new FakeEvent('click', modifiers)); }
function contextMenu(chip) { chip.dispatchEvent(new FakeEvent('contextmenu')); }

/* Everything mounts off a resolved fetch, so let the microtasks run first. */
setTimeout(() => {

  const holder = () => document.getElementById('unsee-tags-holder');

  eq(!!strip(), true, 'the strip mounts');
  eq(strip().dataset.unseeSlot, 'column',
     'on a Google results grid it goes in the right-hand column, not under the box');
  eq(holder().parentElement === rcnt, true, 'as a grid item of #rcnt');
  eq(holder().style.gridColumn, 'span 7 / -2',
     'in the column Google keeps for the knowledge panel, counted from the end of the grid');
  eq(holder().children[0].style.position, 'sticky', 'with a sticky inner wrapper');
  eq(holder().children[0].style.top, '96px', "clearing Google's own fixed header");
  eq(strip().style.paddingLeft, '1103px',
     'and padded clear of the band the suggestion list occupies, measured off the form');
  eq(chips().map((c) => c.textContent), ['""', 'edu', 'site:edu.tw', '教育部'],
     'one tag per line of the file, in the order the file gives them');

  click(chips()[1]);
  eq(box.value, 'edu', 'clicking a tag puts its text in the visible box');
  eq(stale.value, '', 'the off-screen box named q is left alone');
  eq(chips()[1].getAttribute('aria-pressed'), 'true', 'the tag now reads as switched on');

  click(chips()[3]);
  eq(box.value, 'edu site:moe.gov.tw', 'a labelled tag types its text, not its label');
  eq(chips()[2].getAttribute('aria-pressed'), 'false',
     'a tag whose text merely resembles what is in the box stays off');

  click(chips()[1]);
  eq(box.value, 'site:moe.gov.tw', 'clicking again takes that term back out');
  eq(chips()[1].getAttribute('aria-pressed'), 'false', 'and the tag switches off');

  eq(form.submitted, 0, 'an ordinary click does not search');
  click(chips()[1], { shiftKey: true });
  eq(form.submitted, 1, 'shift-click submits the form');
  eq(box.value, 'site:moe.gov.tw edu', 'and the term is in the box when it does');

  click(chips()[1], { ctrlKey: true });
  eq(box.value, 'site:moe.gov.tw',
     'ctrl-click on a tag that is already on switches it off, however it went on');

  click(chips()[1], { ctrlKey: true });
  eq(box.value, 'site:moe.gov.tw "edu"', 'ctrl-click adds the term as a quoted phrase');
  eq(chips()[1].getAttribute('aria-pressed'), 'true', 'the quoted form reads as on too');

  click(chips()[1]);
  eq(box.value, 'site:moe.gov.tw', 'a plain click takes the quoted form out again');

  eq(messages.length, 0, 'nothing has opened a tab so far');
  click(chips()[1], { ctrlKey: true, shiftKey: true });
  eq(box.value, 'site:moe.gov.tw "edu"', 'ctrl-shift-click puts the quoted term in');
  eq(messages.length, 1, 'and asks the worker for a tab');
  eq(messages[0].type, 'unsee-open-tab', 'by the message the worker listens for');
  eq(messages[0].url, 'https://www.google.com/search?q=site%3Amoe.gov.tw+%22edu%22&udm=14',
     'the tab searches the whole box, keeps udm and drops the page offset');

  click(chips()[1], { ctrlKey: true, shiftKey: true });
  eq(box.value, 'site:moe.gov.tw "edu"',
     'ctrl-shift-click never removes: searching for a term it just deleted would be nonsense');
  eq(messages.length, 2, 'and it opens a tab every time');
  eq(form.submitted, 1, 'none of the ctrl variants submit the page you are on');

  const boxBefore = box.value;
  contextMenu(chips()[2]);
  eq(clipboard, 'site:edu.tw', 'right-click copies');
  eq(box.value, boxBefore, 'and leaves the box exactly as it was');

  click(chips()[2]);
  eq(box.value, boxBefore,
     'a click arriving straight after that menu is ignored — on a Mac it is the same gesture');

  storageChanged({ tagsEnabled: { newValue: false } }, 'sync');
  eq(strip(), null, 'unticking 顯示 removes the strip');

  storageChanged({ tagsEnabled: { newValue: true } }, 'sync');
  eq(!!strip(), true, 'and ticking it puts the strip back');

  storageChanged({ enabled: { newValue: false } }, 'sync');
  eq(strip(), null, '啟用 takes the strip down as well');
  storageChanged({ enabled: { newValue: true } }, 'sync');

  storageChanged({ snippets: { newValue: [{ label: '近一年', text: 'after:2025-09-01' }] } }, 'sync');
  eq(chips().map((c) => c.textContent), ['""', 'edu', 'site:edu.tw', '教育部', '近一年'],
     'tags added in the popup land after the ones from the file');

  /* ---------- the "" tag ---------- */

  const quote = () => chips()[0];
  eq(quote().dataset.unseeBuiltin, 'quote', 'the "" tag is pinned first and is not a snippet');
  eq(quote().hasAttribute('aria-pressed'), false, 'it has no on state, because it does not live in the box');

  const down = new FakeEvent('mousedown');
  quote().dispatchEvent(down);
  eq(down.defaultPrevented, true,
     'pressing a tag refuses the default, so the box keeps the focus and the selection');

  box.value = '咖啡 烘焙';
  box.setSelectionRange(3, 5);
  click(quote());
  eq(box.value, '咖啡 "烘焙"', 'it quotes what is selected');
  eq([box.selectionStart, box.selectionEnd], [3, 7],
     'and leaves the quoted words selected, so the next click acts on the same thing');

  click(quote());
  eq(box.value, '咖啡 烘焙', 'clicking again takes the quotes off');
  eq([box.selectionStart, box.selectionEnd], [3, 5], 'and restores the selection to the words');

  // Clicking into the box: the caret moves and the selection is let go of.
  box.setSelectionRange(4, 4);
  box.dispatchEvent(new FakeEvent('mouseup'));
  click(quote());
  eq(box.value, '"咖啡 烘焙"', 'with nothing selected it quotes the whole query');
  click(quote());
  eq(box.value, '咖啡 烘焙', 'and unquotes it again');

  const submittedBefore = form.submitted;
  box.setSelectionRange(3, 5);
  click(quote(), { shiftKey: true });
  eq(box.value, '咖啡 "烘焙"', 'shift quotes');
  eq(form.submitted, submittedBefore + 1, 'and searches');

  const tabsBefore = messages.length;
  box.value = '咖啡 烘焙';
  box.setSelectionRange(3, 5);
  click(quote(), { ctrlKey: true, shiftKey: true });
  eq(box.value, '咖啡 "烘焙"', 'ctrl-shift quotes');
  eq(messages.length, tabsBefore + 1, 'and opens a background tab');
  eq(messages[messages.length - 1].url,
     'https://www.google.com/search?q=%E5%92%96%E5%95%A1+%22%E7%83%98%E7%84%99%22&udm=14',
     'searching for the quoted query');

  box.value = '';
  click(quote());
  eq(box.value, '', 'an empty box is left alone rather than turned into a pair of quotes');

  box.value = '咖啡 烘焙';
  box.setSelectionRange(3, 5);
  const quotedBoxBefore = box.value;
  contextMenu(quote());
  eq(clipboard, '"烘焙"', 'right-click copies the selection with quotes round it');
  eq(box.value, quotedBoxBefore, 'and does not touch the box');

  /* ---------- when a knowledge panel wants the same column ---------- */

  const rhs = new El('div');
  rhs.id = 'rhs';
  const panel = rhs.appendChild(new El('div'));
  panel.id = 'panel-content';
  rcnt.appendChild(rhs);
  storageChanged({ snippets: { newValue: [] } }, 'sync');

  eq(strip().dataset.unseeSlot, 'rhs', 'a knowledge panel takes the column, so the strip moves into it');
  eq(holder().parentElement === rhs, true, "as the panel column's own child");
  eq(rhs.children[0] === holder(), true, 'first, so the panel is pushed down rather than covered');
  eq(rhs.children[1] === panel, true, 'and the panel is still there, below it');
  eq(!holder().children[0].style.position, true, 'not sticky there — it travels with the panel');

  rhs.remove();
  storageChanged({ snippets: { newValue: [] } }, 'sync');
  eq(strip().dataset.unseeSlot, 'column', 'and back to the empty column when the panel goes');

  if (failures.length) {
    console.error('FAIL ' + failures.length + ' of ' + (pass + failures.length));
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('ok — ' + pass + ' assertions passed (stub DOM; not a browser)');
}, 0);
