// sub-NF — casing repair for ALL-CAPS caption tracks, isolated so it can be
// unit-tested outside a browser. Exposes globalThis.SubNFCase; also exports via
// CommonJS under Node (for tests).
//
// Netflix's SDH / CC tracks are frequently typeset entirely in capitals. The
// lossless fix is to pick the plain (non-CC) track instead -- correct casing
// AND correct punctuation, no guessing -- but plenty of titles ship no plain
// English track at all, and then this is the next best thing.
//
// Nothing here is clever about English. It is a set of rules that are right far
// more often than they are wrong, plus one trick: SDH tracks label their
// speakers, and those labels are exactly the proper nouns worth preserving.
(() => {
  'use strict';
  const root = (typeof self !== 'undefined') ? self
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  // Kept as capitals wherever they appear.
  // Deliberately excludes anything that is also an ordinary word: AM, US, ER
  // and AD are far more often "am", "us", "er" and "ad" in dialogue, and
  // freezing them as capitals is worse than losing the rare true acronym.
  const ACRONYMS = new Set([
    'OK', 'TV', 'DVD', 'CD', 'FBI', 'CIA', 'NSA', 'DNA', 'RNA', 'USA',
    'UK', 'EU', 'UN', 'AI', 'ID', 'CEO', 'CFO', 'NASA', 'ATM', 'GPS', 'SUV',
    'PC', 'TSA', 'NYPD', 'LAPD', 'ICU', 'MD', 'BC',
  ]);

  // Look like acronyms (no vowels) but are ordinary words that want Title Case.
  const NOT_ACRONYMS = new Set(['MR', 'MRS', 'MS', 'DR', 'ST', 'JR', 'SR', 'MT']);

  // Generic SDH speaker labels. Harvesting these as "names" would Title-Case an
  // ordinary noun everywhere it appeared, which is worse than doing nothing.
  const ROLE_LABELS = new Set([
    'MAN', 'WOMAN', 'BOY', 'GIRL', 'CHILD', 'BOTH', 'ALL', 'VOICE', 'VOICES',
    'NARRATOR', 'ANNOUNCER', 'REPORTER', 'DOCTOR', 'NURSE', 'OFFICER',
    'SOLDIER', 'DRIVER', 'WAITER', 'CLERK', 'GUARD', 'JUDGE', 'TEACHER',
    'STUDENT', 'MOTHER', 'FATHER', 'MOM', 'DAD', 'SON', 'DAUGHTER',
    'COMPUTER', 'RADIO', 'TELEVISION', 'PHONE', 'CROWD', 'AUDIENCE',
    'TOGETHER', 'CONTINUES', 'OVER', 'ON', 'IN', 'THE', 'A', 'AND',
  ]);

  const LETTER = /[A-Za-z]/;
  const VOWEL = /[AEIOUY]/;

  // A caption is only rewritten when it is overwhelmingly capitals. This is the
  // guard that matters: it leaves a correctly-cased track untouched, and a line
  // with no Latin letters at all (the Chinese line, say) fails it outright, so
  // no language detection is needed anywhere.
  function looksAllCaps(text) {
    const s = String(text || '');
    let upper = 0, letters = 0;
    for (const ch of s) {
      if (!LETTER.test(ch)) continue;
      letters++;
      if (ch === ch.toUpperCase()) upper++;
    }
    if (letters < 2) return false;
    return upper / letters >= 0.9;
  }

  // SDH marks who is speaking as "NAME:" at the head of a line. Sweeping the
  // whole cue array once therefore yields the cast list -- the proper nouns a
  // dictionary would otherwise be needed for. Place names and brands are still
  // lost, but character names are the ones that grate.
  function harvestNames(cues, limit) {
    const out = new Set();
    const cap = limit || 200;
    for (const cue of (cues || [])) {
      const text = cue && cue.text;
      if (!text) continue;
      for (const line of String(text).split('\n')) {
        const m = /^\s*-?\s*([A-Z][A-Z'’\- ]{1,30}?)\s*:\s/.exec(line + ' ');
        if (!m) continue;
        for (const word of m[1].split(/[\s\-]+/)) {
          const w = word.replace(/[^A-Z'’]/g, '');
          if (w.length < 2 || ROLE_LABELS.has(w) || ACRONYMS.has(w)) continue;
          out.add(w);
          if (out.size >= cap) return out;
        }
      }
    }
    return out;
  }

  function titleCase(word) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  function keepUpper(original) {
    const bare = original.replace(/[^A-Za-z]/g, '');
    if (!bare || bare !== bare.toUpperCase()) return false;
    if (NOT_ACRONYMS.has(bare)) return false;
    if (ACRONYMS.has(bare)) return true;
    return bare.length >= 2 && bare.length <= 4 && !VOWEL.test(bare);
  }

  // Restore sentence case. Order is deliberate: acronyms and names are settled
  // first, then sentence starts, then the pronoun I -- each later pass only
  // ever raises a first letter, so it cannot undo an earlier decision.
  function restoreCase(text, opts) {
    const src = String(text || '');
    if (!looksAllCaps(src)) return src;
    const names = (opts && opts.names) || null;

    let out = src.replace(/[A-Za-z][A-Za-z'’]*/g, (word) => {
      if (keepUpper(word)) return word.toUpperCase();
      const bare = word.replace(/[^A-Za-z]/g, '').toUpperCase();
      if (names && names.has && names.has(bare)) return titleCase(word);
      return word.toLowerCase();
    });

    // Start of the text, and after . ! ? … possibly followed by quotes/brackets.
    out = out.replace(/^([^A-Za-z]*)([a-z])/, (_, lead, ch) => lead + ch.toUpperCase());
    out = out.replace(/([.!?…])([^A-Za-z]*)([a-z])/g,
      (_, stop, gap, ch) => stop + gap + ch.toUpperCase());

    // A courtesy title is always followed by a surname, which makes it one of
    // the few proper-noun signals available without a dictionary.
    out = out.replace(/\b(mr|mrs|ms|dr|st|jr|sr|prof|sgt|capt|lt|rev)(\.?)\s+([a-z][a-z'’]*)/gi,
      (_, title, dot, next) => titleCase(title) + dot + ' ' + titleCase(next));

    // The pronoun. Never wrong in English, and glaring when left lowercase.
    out = out.replace(/\bi\b/g, 'I');
    out = out.replace(/\bi('|’)(m|ll|ve|d|s)\b/gi, (_, q, tail) => 'I' + q + tail.toLowerCase());

    return out;
  }

  // SDH carries sound description, music marks and speaker labels. For study
  // they are noise, so this is offered separately and off by default -- it
  // removes information rather than repairing it.
  function stripSdh(text) {
    let out = String(text || '');
    out = out.replace(/\[[^\]]*\]/g, ' ');
    out = out.replace(/\([^)]*\)/g, ' ');
    out = out.replace(/[♪♫]/g, ' ');
    out = out.split('\n')
      .map((line) => line.replace(/^\s*-?\s*[A-Z][A-Z'’\- ]{0,30}\s*:\s*/, ''))
      .join('\n');
    return out.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  }

  // The whole pipeline, in the order the options are meant to compose.
  function clean(text, opts) {
    const o = opts || {};
    let out = String(text || '');
    if (o.stripSdh) out = stripSdh(out);
    if (o.fixAllCaps) out = restoreCase(out, o);
    return out;
  }

  const exp = { looksAllCaps, harvestNames, restoreCase, stripSdh, clean, titleCase, keepUpper };
  root.SubNFCase = exp;
  if (typeof module !== 'undefined' && module.exports) module.exports = exp;
})();
