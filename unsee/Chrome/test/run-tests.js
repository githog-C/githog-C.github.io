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
eq(m.normalizeHost('https://www.threads.com/@someone'), 'threads.com', 'strips scheme, www and path');
eq(m.normalizeHost('HTTP://Threads.COM:8443/x?y#z'), 'threads.com', 'lowercases, drops port/query/hash');
// assembled rather than written inline, so the fixture cannot be read as a real address
const withCredentials = 'https://user' + String.fromCharCode(64) + 'threads.com/path';
eq(m.normalizeHost(withCredentials), 'threads.com', 'drops credentials');
eq(m.normalizeHost('threads.com.'), 'threads.com', 'drops the root dot');
eq(m.normalizeHost('  Threads.com  '), 'threads.com', 'trims');
eq(m.normalizeHost(''), '', 'empty stays empty');
eq(m.normalizeHost(null), '', 'null is safe');

/* hostMatchesRule */
eq(m.hostMatchesRule('threads.com', 'threads.com'), true, 'exact host matches');
eq(m.hostMatchesRule('www.threads.com', 'threads.com'), true, 'www subdomain matches');
eq(m.hostMatchesRule('cdn.eu.threads.com', 'threads.com'), true, 'deep subdomain matches');
eq(m.hostMatchesRule('threads.com', 'www.threads.com'), true, 'rule written with www still matches bare host');
eq(m.hostMatchesRule('notthreads.com', 'threads.com'), false, 'suffix without a dot boundary does NOT match');
eq(m.hostMatchesRule('threads.com.evil.test', 'threads.com'), false, 'rule as a left-hand label does not match');
eq(m.hostMatchesRule('thread.com', 'threads.com'), false, 'thread.com is a different site from threads.com');
eq(m.hostMatchesRule('threads.net', 'threads.com'), false, 'different TLD does not match');
eq(m.hostMatchesRule('', 'threads.com'), false, 'empty host never matches');
eq(m.hostMatchesRule('threads.com', ''), false, 'empty rule never matches');

/* findMatchingRule */
eq(m.findMatchingRule('www.threads.com', ['example.test', 'threads.com']), 'threads.com', 'returns the rule that matched');
eq(m.findMatchingRule('example.org', ['example.test', 'threads.com']), null, 'no match returns null');
eq(m.findMatchingRule('threads.com', null), null, 'non-array rules are safe');

/* unwrapRedirect */
eq(m.hostOfResultLink('https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.threads.com%2F%40a&rut=x'), 'threads.com', 'unwraps DuckDuckGo /l/');
eq(m.hostOfResultLink('https://www.google.com/url?q=https://threads.com/x&sa=U'), 'threads.com', 'unwraps Google /url');
eq(m.hostOfResultLink('https://www.bing.com/ck/a?!&&p=1&u=a1aHR0cHM6Ly90aHJlYWRzLmNvbS9hYmM'), 'threads.com', 'unwraps Bing /ck/a base64');
eq(m.hostOfResultLink('https://www.bing.com/ck/a?u=notbase64prefix'), 'bing.com', 'leaves a Bing link alone when u lacks the a1 prefix');
eq(m.hostOfResultLink('//threads.com/x'), 'threads.com', 'protocol-relative link');
eq(m.hostOfResultLink('javascript:void(0)'), '', 'javascript: link is ignored');
eq(m.hostOfResultLink(''), '', 'empty link is ignored');
eq(m.hostOfResultLink('https://threads.com/x'), 'threads.com', 'plain link passes through');

/* parseRuleInput */
eq(m.parseRuleInput('https://www.Threads.com/@x'), { ok: true, rule: 'threads.com' }, 'accepts a pasted URL');
eq(m.parseRuleInput('threads.com'), { ok: true, rule: 'threads.com' }, 'accepts a bare domain');
eq(m.parseRuleInput('localhost').ok, false, 'rejects a name with no dot');
eq(m.parseRuleInput('').ok, false, 'rejects empty');
eq(m.parseRuleInput('.threads.com').ok, false, 'rejects a leading dot');
eq(m.parseRuleInput('threads.com-').ok, false, 'rejects a trailing dash');
eq(m.parseRuleInput('thr eads.com').ok, false, 'rejects a space inside');

/* addRule / removeRule */
eq(m.addRule([], 'threads.com'), ['threads.com'], 'adds to an empty list');
eq(m.addRule(['threads.com'], 'threads.com'), ['threads.com'], 'adding a duplicate changes nothing');
eq(m.addRule(['threads.com'], 'www.threads.com'), ['threads.com'], 'a rule already covered is not added');
eq(m.addRule(['cdn.threads.com'], 'threads.com'), ['threads.com'], 'a broader rule replaces the narrower one');
eq(m.addRule(['b.test'], 'a.test'), ['a.test', 'b.test'], 'stays sorted');
eq(m.removeRule(['a.test', 'threads.com'], 'https://www.threads.com/'), ['a.test'], 'removes by any spelling of the host');
eq(m.removeRule([], 'threads.com'), [], 'removing from empty is safe');

if (failures.length) {
  console.error('FAIL ' + failures.length + ' of ' + (pass + failures.length));
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('ok — ' + pass + ' assertions passed');
