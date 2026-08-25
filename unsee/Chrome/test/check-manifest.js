/*
 * unsee — manifest lint. Run: node test/check-manifest.js
 *
 * This exists because Chrome only reports "Invalid match pattern" at load time,
 * with no indication of which pattern or why, and the rules differ between keys:
 * a content_scripts pattern may restrict the path, a web_accessible_resources
 * pattern may not. Both mistakes are cheap to make and cost a load failure.
 */
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const SCHEMES = ['*', 'http', 'https', 'file', 'ftp', 'urn'];
const problems = [];

/**
 * Validate one match pattern. `pathMustBeStar` is the web_accessible_resources
 * rule: those patterns are host-level only.
 */
function checkPattern(pattern, where, pathMustBeStar) {
  const label = where + ': "' + pattern + '"';

  if (pattern === '<all_urls>') return;

  const schemeSplit = pattern.indexOf('://');
  if (schemeSplit === -1) {
    problems.push(label + ' — no scheme; expected something like *://host/*');
    return;
  }

  const scheme = pattern.slice(0, schemeSplit);
  if (!SCHEMES.includes(scheme)) {
    problems.push(label + ' — unknown scheme "' + scheme + '"');
  }

  const rest = pattern.slice(schemeSplit + 3);
  const slash = rest.indexOf('/');
  if (slash === -1) {
    problems.push(label + ' — no path; a pattern must end with at least /');
    return;
  }

  const host = rest.slice(0, slash);
  const urlPath = rest.slice(slash);

  if (!host) {
    problems.push(label + ' — empty host');
  } else if (host !== '*') {
    // A wildcard is allowed only as the whole host or as the leftmost label.
    // "www.google.*" is the classic invalid one.
    const body = host.startsWith('*.') ? host.slice(2) : host;
    if (body.includes('*')) {
      problems.push(label + ' — "*" may only be the leftmost label, as in *.example.com');
    }
    if (!/^[a-z0-9.-]+$/.test(body)) {
      problems.push(label + ' — host has characters that are not allowed: "' + body + '"');
    }
  }

  if (pathMustBeStar && urlPath !== '/*') {
    problems.push(label + ' — web_accessible_resources patterns are host-level; '
      + 'the path must be exactly "/*", not "' + urlPath + '"');
  }
}

for (const [i, script] of (manifest.content_scripts || []).entries()) {
  for (const pattern of script.matches || []) {
    checkPattern(pattern, 'content_scripts[' + i + '].matches', false);
  }
}

for (const [i, entry] of (manifest.web_accessible_resources || []).entries()) {
  for (const pattern of entry.matches || []) {
    checkPattern(pattern, 'web_accessible_resources[' + i + '].matches', true);
  }
  for (const resource of entry.resources || []) {
    const file = path.join(__dirname, '..', resource);
    if (!fs.existsSync(file)) {
      problems.push('web_accessible_resources[' + i + '].resources: "' + resource
        + '" is declared but not present in the folder');
    }
  }
}

/* Every file the manifest points at should actually exist. */
const referenced = []
  .concat(Object.values(manifest.icons || {}))
  .concat(Object.values((manifest.action || {}).default_icon || {}))
  .concat((manifest.action || {}).default_popup ? [manifest.action.default_popup] : [])
  .concat(...(manifest.content_scripts || []).map((s) => (s.js || []).concat(s.css || [])));

for (const file of referenced) {
  if (!fs.existsSync(path.join(__dirname, '..', file))) {
    problems.push('manifest references "' + file + '", which is not in the folder');
  }
}

if (problems.length) {
  console.error('FAIL — ' + problems.length + ' problem(s) in manifest.json');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('ok — manifest.json patterns and file references check out');
