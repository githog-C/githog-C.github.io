/*
 * unsee — matcher tests. Run: node test/run-tests.js
 * No dependencies, no network, no browser.
 */
const m = require('../src/matcher.js');

let pass = 0;
const failures = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else failures.push(label + '\n    expected ' + e + '\n    actual   ' + a);
}

/* normalizeHost */
eq(m.normalizeHost('https://www.example.com/@someone'), 'example.com', 'strips scheme, www and path');
eq(m.normalizeHost('HTTP://Example.COM:8443/x?y#z'), 'example.com', 'lowercases, drops port/query/hash');
// assembled rather than written inline, so the fixture cannot be read as a real address
const withCredentials = 'https://user' + String.fromCharCode(64) + 'example.com/path';
eq(m.normalizeHost(withCredentials), 'example.com', 'drops credentials');
eq(m.normalizeHost('example.com.'), 'example.com', 'drops the root dot');
eq(m.normalizeHost('  Example.com  '), 'example.com', 'trims');
eq(m.normalizeHost(''), '', 'empty stays empty');
eq(m.normalizeHost(null), '', 'null is safe');

/* hostMatchesRule */
eq(m.hostMatchesRule('example.com', 'example.com'), true, 'exact host matches');
eq(m.hostMatchesRule('www.example.com', 'example.com'), true, 'www subdomain matches');
eq(m.hostMatchesRule('cdn.eu.example.com', 'example.com'), true, 'deep subdomain matches');
eq(m.hostMatchesRule('example.com', 'www.example.com'), true, 'rule written with www still matches bare host');
eq(m.hostMatchesRule('notexample.com', 'example.com'), false, 'suffix without a dot boundary does NOT match');
eq(m.hostMatchesRule('example.com.evil.test', 'example.com'), false, 'rule as a left-hand label does not match');
eq(m.hostMatchesRule('example.co', 'example.com'), false, 'example.co is a different site from example.com');
eq(m.hostMatchesRule('example.net', 'example.com'), false, 'different TLD does not match');
eq(m.hostMatchesRule('', 'example.com'), false, 'empty host never matches');
eq(m.hostMatchesRule('example.com', ''), false, 'empty rule never matches');

/* findMatchingRule */
eq(m.findMatchingRule('www.example.com', ['example.test', 'example.com']), 'example.com', 'returns the rule that matched');
eq(m.findMatchingRule('example.org', ['example.test', 'example.com']), null, 'no match returns null');
eq(m.findMatchingRule('example.com', null), null, 'non-array rules are safe');

/* unwrapRedirect */
eq(m.hostOfResultLink('https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.example.com%2F%40a&rut=x'), 'example.com', 'unwraps DuckDuckGo /l/');
eq(m.hostOfResultLink('https://www.google.com/url?q=https://example.com/x&sa=U'), 'example.com', 'unwraps Google /url');
eq(m.hostOfResultLink('https://www.bing.com/ck/a?!&&p=1&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9hYmM'), 'example.com', 'unwraps Bing /ck/a base64');
eq(m.hostOfResultLink('https://www.bing.com/ck/a?u=notbase64prefix'), 'bing.com', 'leaves a Bing link alone when u lacks the a1 prefix');
eq(m.hostOfResultLink('//example.com/x'), 'example.com', 'protocol-relative link');
eq(m.hostOfResultLink('javascript:void(0)'), '', 'javascript: link is ignored');
eq(m.hostOfResultLink(''), '', 'empty link is ignored');
eq(m.hostOfResultLink('https://example.com/x'), 'example.com', 'plain link passes through');

/* parseRuleInput */
eq(m.parseRuleInput('https://www.Example.com/@x'), { ok: true, rule: 'example.com' }, 'accepts a pasted URL');
eq(m.parseRuleInput('example.com'), { ok: true, rule: 'example.com' }, 'accepts a bare domain');
eq(m.parseRuleInput('localhost').ok, false, 'rejects a name with no dot');
eq(m.parseRuleInput('').ok, false, 'rejects empty');
eq(m.parseRuleInput('.example.com').ok, false, 'rejects a leading dot');
eq(m.parseRuleInput('example.com-').ok, false, 'rejects a trailing dash');
eq(m.parseRuleInput('thr eads.com').ok, false, 'rejects a space inside');

/* addRule / removeRule */
eq(m.addRule([], 'example.com'), ['example.com'], 'adds to an empty list');
eq(m.addRule(['example.com'], 'example.com'), ['example.com'], 'adding a duplicate changes nothing');
eq(m.addRule(['example.com'], 'www.example.com'), ['example.com'], 'a rule already covered is not added');
eq(m.addRule(['cdn.example.com'], 'example.com'), ['example.com'], 'a broader rule replaces the narrower one');
eq(m.addRule(['b.test'], 'a.test'), ['a.test', 'b.test'], 'stays sorted');
eq(m.removeRule(['a.test', 'example.com'], 'https://www.example.com/'), ['a.test'], 'removes by any spelling of the host');
eq(m.removeRule([], 'example.com'), [], 'removing from empty is safe');

/* parseBlocklistFile — the file a person edits by hand */
const parsed = m.parseBlocklistFile([
  '# 我的預設遮蔽清單',
  '',
  'example.com',
  '  www.Example.NET  ',
  '限時特價',
  '3.5 折',
  'keyword: e.g.',
  'domain: another.test',
  '# example.com   <- 註解掉的不算',
].join('\n'));
eq(parsed.domains, ['another.test', 'example.com', 'example.net'], 'domains are collected, normalised and sorted');
eq(parsed.keywords, ['3.5 折', 'e.g.', '限時特價'], 'keywords are collected, lowercased and sorted');
eq(parsed.problems, [], 'a well-formed file reports no problems');
eq(m.parseBlocklistFile('').domains, [], 'an empty file yields nothing');
eq(m.parseBlocklistFile(null).keywords, [], 'null is safe');
eq(m.parseBlocklistFile('a.test\r\nb.test').domains, ['a.test', 'b.test'], 'CRLF line endings are handled');
eq(m.parseBlocklistFile('example.com\nexample.com').domains, ['example.com'], 'duplicates collapse');
eq(m.parseBlocklistFile('domain: not a host').problems.length, 1, 'a forced domain that is not a host is reported, not silently kept');
eq(m.parseBlocklistFile('domain: not a host').keywords, [], 'and it is not quietly demoted to a keyword either');
eq(m.parseBlocklistFile('keyword: example.com').domains, [], 'an explicit keyword is never treated as a domain');
eq(m.parseBlocklistFile('keyword: example.com').keywords, ['example.com'], 'an explicit keyword stays a keyword');

/* findMatchingKeyword */
eq(m.findMatchingKeyword('本季限時特價開跑', ['限時特價']), '限時特價', 'finds a keyword inside a title');
eq(m.findMatchingKeyword('Big SALE today', ['sale']), 'sale', 'matching is case-insensitive');
eq(m.findMatchingKeyword('nothing here', ['sale']), null, 'no match returns null');
eq(m.findMatchingKeyword('anything', []), null, 'an empty keyword list never matches');
eq(m.findMatchingKeyword('', ['sale']), null, 'empty text never matches');
eq(m.findMatchingKeyword(null, ['sale']), null, 'null text is safe');
eq(m.findMatchingKeyword('anything', null), null, 'null keyword list is safe');

/* climbToResultBlock — picking the element that is one result */

// A tiny stand-in for the DOM: each node knows its parent and how many distinct
// outbound sites live inside it. That is all the climb actually looks at.
function tree(spec) {
  const nodes = {};
  for (const name of Object.keys(spec)) nodes[name] = { name, hosts: spec[name].hosts };
  for (const name of Object.keys(spec)) {
    const parent = spec[name].parent;
    nodes[name].parentElement = parent ? nodes[parent] : null;
  }
  return nodes;
}
const countHosts = (node) => node.hosts;

// An ordinary result: every level covers the one site, so the climb should reach
// the child of the results container exactly as it always did.
const plain = tree({
  root:  { hosts: 9, parent: null },
  block: { hosts: 1, parent: 'root' },
  inner: { hosts: 1, parent: 'block' },
  link:  { hosts: 1, parent: 'inner' },
});
eq(m.climbToResultBlock(plain.link, plain.root, countHosts).name, 'block',
   'an ordinary result still climbs to the child of the results container');

// A cluster: the group holds two sites, so the climb must stop at the item.
const cluster = tree({
  root:    { hosts: 9, parent: null },
  group:   { hosts: 2, parent: 'root' },
  itemA:   { hosts: 1, parent: 'group' },
  innerA:  { hosts: 1, parent: 'itemA' },
  linkA:   { hosts: 1, parent: 'innerA' },
});
eq(m.climbToResultBlock(cluster.linkA, cluster.root, countHosts).name, 'itemA',
   'inside a group, the climb stops at the single item and never takes the group');

// The boundary can sit at any depth.
const deep = tree({
  root:  { hosts: 9, parent: null },
  group: { hosts: 3, parent: 'root' },
  a:     { hosts: 1, parent: 'group' },
  b:     { hosts: 1, parent: 'a' },
  c:     { hosts: 1, parent: 'b' },
  link:  { hosts: 1, parent: 'c' },
});
eq(m.climbToResultBlock(deep.link, deep.root, countHosts).name, 'a',
   'the climb goes as high as it can without crossing the group boundary');

// A link that is already a direct child of the container stays put.
const shallow = tree({ root: { hosts: 9, parent: null }, link: { hosts: 1, parent: 'root' } });
eq(m.climbToResultBlock(shallow.link, shallow.root, countHosts).name, 'link',
   'a link directly under the container is its own block');

eq(m.climbToResultBlock(plain.root, plain.root, countHosts), null, 'the container itself is not a result');
eq(m.climbToResultBlock(null, plain.root, countHosts), null, 'a missing start is safe');
eq(m.climbToResultBlock(plain.link, null, countHosts), null, 'a missing container is safe');


/* ===================== snippets: the tag strip ===================== */
const s = require('../src/snippets.js');

/* parseSnippetLine */
eq(s.parseSnippetLine('edu'), { ok: true, snippet: { label: 'edu', text: 'edu' } },
   'a bare line is both the label and the text');
eq(s.parseSnippetLine('教育部 = site:edu.tw'),
   { ok: true, snippet: { label: '教育部', text: 'site:edu.tw' } },
   'an equals sign splits label from text');
eq(s.parseSnippetLine('  filetype:pdf  '),
   { ok: true, snippet: { label: 'filetype:pdf', text: 'filetype:pdf' } }, 'trims');
eq(s.parseSnippetLine('a   b'), { ok: true, snippet: { label: 'a b', text: 'a b' } },
   'runs of whitespace collapse to one space');
eq(s.parseSnippetLine('等式 = a=b'),
   { ok: true, snippet: { label: '等式', text: 'a=b' } },
   'only the first equals sign splits, so text may contain one');
eq(s.parseSnippetLine('=oops').ok, true, 'a leading equals is part of the text, not a split');
eq(s.parseSnippetLine('label ='), { ok: false, reason: 'no-text' }, 'nothing after the equals is a problem');
eq(s.parseSnippetLine('   '), { ok: false, reason: 'empty' }, 'blank is rejected');
eq(s.parseSnippetLine(null), { ok: false, reason: 'empty' }, 'null is safe');
eq(s.parseSnippetLine('site:https://www.plurk.com/').ok, true,
   'a whole site: URL is a usable label — long, but a normal thing to want on a tag');
eq(s.parseSnippetLine('x'.repeat(60) + ' = y').reason, 'label-too-long',
   'a label longer than the strip could ever show is rejected rather than silently cut');

/* parseSnippetFile */
const file = s.parseSnippetFile([
  '# a comment',
  '',
  'edu',
  '   ',
  'site:edu.tw',
  '教育部 = site:edu.tw',
  '#filetype:pdf',
  'edu',
].join('\n'));
eq(file.snippets, [
  { label: 'edu', text: 'edu' },
  { label: 'site:edu.tw', text: 'site:edu.tw' },
], 'comments and blanks are skipped, and the same text twice is one tag');
eq(file.problems, [], 'a well-formed file reports no problems');
eq(s.parseSnippetFile('b\na').snippets.map((x) => x.text), ['b', 'a'],
   'file order is kept, because it is the order of the tags on screen');
eq(s.parseSnippetFile('x =').problems.length, 1, 'a line that cannot be read is reported, not dropped silently');
eq(s.parseSnippetFile('').snippets, [], 'an empty file yields no tags');
eq(s.parseSnippetFile(null).snippets, [], 'a missing file is safe');

/* addSnippet / removeSnippet */
eq(s.addSnippet([{ label: 'a', text: 'a' }], { label: 'b', text: 'b' }).map((x) => x.text),
   ['a', 'b'], 'a new snippet goes on the end, not into sort order');
eq(s.addSnippet([{ label: 'a', text: 'a' }], { label: 'A', text: 'A' }).length, 1,
   'the same text in another case is not a second tag');
eq(s.removeSnippet([{ label: 'a', text: 'a' }, { label: 'b', text: 'b' }], 'A').map((x) => x.text),
   ['b'], 'removal is case-insensitive');
eq(s.removeSnippet([], 'a'), [], 'removing from nothing is safe');

/* findTerm — the whole point is the token boundary */
eq(s.hasTerm('edu', 'edu'), true, 'the whole query is the term');
eq(s.hasTerm('咖啡 edu 烘焙', 'edu'), true, 'a term between spaces is found');
eq(s.hasTerm('education', 'edu'), false, 'a term inside a longer word is NOT found');
eq(s.hasTerm('site:edu.tw', 'edu'), false, 'a term inside another token is NOT found');
eq(s.hasTerm('EDU', 'edu'), true, 'matching ignores case');
eq(s.hasTerm('x', ''), false, 'an empty term matches nothing');
eq(s.hasTerm('', 'edu'), false, 'an empty query contains nothing');
eq(s.hasTerm('報告 filetype:pdf', 'filetype:pdf'), true, 'operators with punctuation match as tokens');
eq(s.hasTerm('a "逐字 比對" b', '"逐字 比對"'), true, 'a term containing a space still matches');

/* toggleTerm */
eq(s.toggleTerm('', 'edu'), { text: 'edu', added: true, changed: true },
   'toggling into an empty box just puts the term in');
eq(s.toggleTerm('咖啡', 'edu'), { text: '咖啡 edu', added: true, changed: true },
   'the term is appended with one space');
eq(s.toggleTerm('咖啡 edu', 'edu'), { text: '咖啡', added: false, changed: true },
   'toggling again takes it out');
eq(s.toggleTerm('edu 咖啡', 'edu'), { text: '咖啡', added: false, changed: true },
   'removal from the front leaves no leading space');
eq(s.toggleTerm('a edu b', 'edu'), { text: 'a b', added: false, changed: true },
   'removal from the middle does not leave a double space');
eq(s.toggleTerm('education', 'edu'), { text: 'education edu', added: true, changed: true },
   'a word that merely contains the term is left alone');
eq(s.toggleTerm('咖啡  ', 'edu'), { text: '咖啡 edu', added: true, changed: true },
   'trailing whitespace does not become a double space');
eq(s.toggleTerm('咖啡', ''), { text: '咖啡', added: false, changed: false },
   'an empty term changes nothing');
eq(s.toggleTerm(null, 'edu').text, 'edu', 'a null query is safe');


/* quoteTerm / presentForm */
eq(s.quoteTerm('edu'), '"edu"', 'quoting wraps the term');
eq(s.quoteTerm('  a b  '), '"a b"', 'quoting trims first');
eq(s.quoteTerm('"edu"'), '"edu"', 'text that is already a phrase is left alone');
eq(s.quoteTerm(''), '', 'nothing to quote stays nothing');
eq(s.presentForm('a edu b', 'edu'), 'plain', 'the plain form is spotted');
eq(s.presentForm('a "edu" b', 'edu'), 'quoted', 'so is the quoted one');
eq(s.presentForm('a education b', 'edu'), null, 'and neither is found inside a longer word');
eq(s.presentForm('', 'edu'), null, 'an empty box holds no form');

/* toggleTermAs — the tag is one switch, whichever click flipped it */
eq(s.toggleTermAs('', 'edu', 'plain'), { text: 'edu', added: true, changed: true },
   'plain toggle adds the plain form');
eq(s.toggleTermAs('', 'edu', 'quoted'), { text: '"edu"', added: true, changed: true },
   'quoted toggle adds the phrase');
eq(s.toggleTermAs('a edu', 'edu', 'quoted').text, 'a',
   'a quoted click on a plainly-present term switches it off rather than adding a second copy');
eq(s.toggleTermAs('a "edu"', 'edu', 'plain').text, 'a',
   'and a plain click switches off a quoted one');
eq(s.toggleTermAs('a', '', 'quoted').text, 'a', 'an empty term changes nothing');

/* ensureTermAs — for the click that also searches, so it never removes */
eq(s.ensureTermAs('a', 'edu', 'quoted'), { text: 'a "edu"', added: true, changed: true },
   'the term goes in');
eq(s.ensureTermAs('a "edu"', 'edu', 'quoted'), { text: 'a "edu"', added: false, changed: false },
   'and stays in when it is already there, rather than toggling off');
eq(s.ensureTermAs('a edu b', 'edu', 'quoted').text, 'a b "edu"',
   'a plain one already in the box is swapped for the phrase, not duplicated');
eq(s.ensureTermAs('a', '', 'quoted').text, 'a', 'an empty term changes nothing here either');

/* searchUrlWithQuery */
eq(s.searchUrlWithQuery('https://www.google.com/search?q=old&udm=14', 'new'),
   'https://www.google.com/search?q=new&udm=14',
   'the query is replaced and the rest of the settings ride along');
eq(s.searchUrlWithQuery('https://www.google.com/search?q=old&start=20&ei=x&ved=y', 'new'),
   'https://www.google.com/search?q=new',
   'parameters describing this particular result page are dropped');
eq(s.searchUrlWithQuery('https://www.google.com.tw/search?q=old', 'new'),
   'https://www.google.com.tw/search?q=new', 'the country domain is kept');
eq(s.searchUrlWithQuery('https://duckduckgo.com/?q=old&ia=web', 'a b'),
   'https://duckduckgo.com/?q=a+b&ia=web', 'other engines work the same way');
eq(s.searchUrlWithQuery('https://www.google.com/search?q=old#frag', 'new'),
   'https://www.google.com/search?q=new', 'the fragment goes');
eq(s.searchUrlWithQuery('not a url', 'new'), '', 'an unusable address yields nothing to open');


/* rangeText / toggleQuoteAround — what the "" tag stands on */
eq(s.rangeText('abc def', 4, 7), 'def', 'a range is the text it covers');
eq(s.rangeText('abc def', 3, 7), 'def', 'whitespace dragged in at the edges is left out');
eq(s.rangeText('abc def', 0, 0), 'abc def', 'an empty range means the whole thing');
eq(s.rangeText('abc def', 7, 4), 'def', 'a backwards range is the same range');
eq(s.rangeText('  ', 0, 0), '', 'nothing but spaces is nothing');

eq(s.toggleQuoteAround('abc def', 4, 7),
   { text: 'abc "def"', start: 4, end: 9, quoted: true, changed: true },
   'the selected words are quoted, and the quotes are left selected');
eq(s.toggleQuoteAround('abc "def"', 4, 9),
   { text: 'abc def', start: 4, end: 7, quoted: false, changed: true },
   'selecting the quoted phrase takes the quotes off again');
eq(s.toggleQuoteAround('abc "def"', 5, 8).text, 'abc def',
   'selecting the words *inside* the quotes undoes it too, rather than making ""def""');
eq(s.toggleQuoteAround('abc def', 0, 0),
   { text: '"abc def"', start: 0, end: 9, quoted: true, changed: true },
   'with nothing selected the whole query is quoted');
eq(s.toggleQuoteAround('abc def ', 3, 8).text, 'abc "def" ',
   'a selection that swept up a trailing space does not quote the space');
eq(s.toggleQuoteAround('', 0, 0),
   { text: '', start: 0, end: 0, quoted: false, changed: false },
   'an empty box is left alone, not turned into a pair of quotes');
eq(s.toggleQuoteAround('   ', 0, 3).changed, false, 'nor is a box holding only spaces');
eq(s.toggleQuoteAround('abc def', 4, 999).text, 'abc "def"', 'a range past the end is clamped');
eq(s.toggleQuoteAround(null, 0, 0).changed, false, 'a null query is safe');
eq(s.toggleQuoteAround('"abc"', 0, 5).text, 'abc', 'a fully quoted query unquotes whole');
eq(s.toggleQuoteAround('a "b c" d', 2, 7).text, 'a b c d', 'a quoted phrase with a space in it unquotes');


/* classifySnippet / groupSnippets — the rows */
eq(s.classifySnippet('edu'), 'keyword', 'a bare word is a keyword');
eq(s.classifySnippet('site:edu.tw'), 'url', 'site: is a url');
eq(s.classifySnippet('SITE:edu.tw'), 'url', 'and the operator is not case-sensitive');
eq(s.classifySnippet('filetype:pdf'), 'filetype', 'filetype: is its own kind');
eq(s.classifySnippet('after:2025-09-01'), 'date', 'after: is a date');
eq(s.classifySnippet('before:2026-01-01'), 'date', 'so is before:');
eq(s.classifySnippet('after:2025-01-01 before:2026-01-01'), 'date', 'a range counts once, by what it starts with');
eq(s.classifySnippet('daterange:2460000-2460100'), 'date', 'daterange: too');
eq(s.classifySnippet('mysite:x'), 'keyword', 'the operator has to start the term, not merely appear in it');

const grouped = s.groupSnippets([
  { label: '""', text: '', builtin: 'quote' },
  { label: 'filetype:pdf', text: 'filetype:pdf' },
  { label: 'edu', text: 'edu' },
  { label: '近一年', text: 'after:2025-09-01' },
  { label: 'plurk', text: 'site:https://www.plurk.com/' },
  { label: 'filetype:md', text: 'filetype:md' },
  { label: 'wiki', text: 'wiki' },
]);
eq(grouped.map((row) => row.cat), ['keyword', 'url', 'filetype', 'date'],
   'the rows come out in a fixed order, whatever order the file is in');
eq(grouped[0].snippets.map((x) => x.label), ['""', 'edu', 'wiki'],
   'the "" tag heads the keyword row, and the rest keep the file order');
eq(grouped[2].snippets.map((x) => x.label), ['filetype:pdf', 'filetype:md'],
   'same kind stays on one row, in file order');
eq(s.groupSnippets([{ label: 'edu', text: 'edu' }]).map((row) => row.cat), ['keyword'],
   'a kind with nothing in it does not get an empty row');
eq(s.groupSnippets([]), [], 'nothing in, nothing out');
eq(s.groupSnippets(null), [], 'null is safe');
eq(s.CATEGORY_ORDER, ['keyword', 'url', 'filetype', 'date'], 'the order is stated once, not scattered');

if (failures.length) {
  console.error('FAIL ' + failures.length + ' of ' + (pass + failures.length));
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('ok — ' + pass + ' assertions passed');
