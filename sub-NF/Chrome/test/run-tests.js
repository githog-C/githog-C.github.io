// Node unit tests for the pure logic in src/vtt.js and src/inject.js.
// Run: node test/run-tests.js
const assert = require('assert');
const {
  parseVTT, parseTTML, parseSubtitle, textAt, parseTime, ttmlTime,
  stripTags, textFromNode, cleanNative,
} = require('../src/vtt.js');
const { pickUrl, pickFormat, tracksFromManifest, normaliseTracks } = require('../src/inject.js');

let pass = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

// ---- parseTime ----
t('parseTime HH:MM:SS.mmm', () => assert.strictEqual(parseTime('01:02:03.500'), 3723.5));
t('parseTime MM:SS.mmm', () => assert.strictEqual(parseTime('02:03.250'), 123.25));
t('parseTime comma decimals', () => assert.strictEqual(parseTime('00:00:01,000'), 1));
t('parseTime junk -> null', () => assert.strictEqual(parseTime('not a time'), null));

// ---- stripTags / entities ----
t('stripTags removes cue tags', () => assert.strictEqual(stripTags('<c.white>Hi</c>'), 'Hi'));
t('stripTags decodes entities', () => assert.strictEqual(stripTags('Tom &amp; Jerry&#39;s'), "Tom & Jerry's"));
t('stripTags hex entity', () => assert.strictEqual(stripTags('&#x4F60;&#x597D;'), '你好'));

// ---- parseVTT, Netflix (webvtt-lssdh-ios8) shaped ----
const NETFLIX_VTT = `WEBVTT

STYLE
::cue(.bg_transparent) { background-color: transparent; }

REGION
id:bottom width:80% lines:2 regionanchor:0%,100%

0001
00:00:12.000 --> 00:00:14.500 position:50.00%,middle align:middle line:84.67% size:80.00%
<c.white>Hello there.</c>

0002
00:00:15.000 --> 00:00:18.000 line:10.00%
- Who are you?
- I'm nobody.

0003
00:00:18.500 --> 00:00:20.000
Tom &amp; Jerry&#39;s show
`;

const cues = parseVTT(NETFLIX_VTT);
t('parseVTT cue count', () => assert.strictEqual(cues.length, 3));
t('parseVTT first cue timing', () => { assert.strictEqual(cues[0].start, 12); assert.strictEqual(cues[0].end, 14.5); });
t('parseVTT strips <c> tag', () => assert.strictEqual(cues[0].text, 'Hello there.'));
t('parseVTT keeps multi-line dialogue', () => assert.strictEqual(cues[1].text, "- Who are you?\n- I'm nobody."));
t('parseVTT ignores cue settings after end time', () => assert.strictEqual(cues[1].end, 18));
t('parseVTT decodes entities in body', () => assert.strictEqual(cues[2].text, "Tom & Jerry's show"));
t('parseVTT ignores WEBVTT/STYLE/REGION headers', () => assert.ok(cues.every((c) => c.text !== 'WEBVTT')));

// ---- textAt ----
t('textAt before first cue -> empty', () => assert.strictEqual(textAt(cues, 5), ''));
t('textAt inside cue 1', () => assert.strictEqual(textAt(cues, 13), 'Hello there.'));
t('textAt in gap -> empty', () => assert.strictEqual(textAt(cues, 14.8), ''));
t('textAt inside cue 2', () => assert.strictEqual(textAt(cues, 16), "- Who are you?\n- I'm nobody."));
t('textAt empty cues', () => assert.strictEqual(textAt([], 10), ''));

const overlap = parseVTT(`WEBVTT

1
00:00:01.000 --> 00:00:05.000
AAA

2
00:00:02.000 --> 00:00:04.000
BBB
`);
t('textAt joins overlapping cues', () => assert.strictEqual(textAt(overlap, 3), 'AAA\nBBB'));

// ---- TTML / DFXP / IMSC ----
t('ttmlTime clock form', () => assert.strictEqual(ttmlTime('00:00:12.500', 10000000), 12.5));
t('ttmlTime ticks', () => assert.strictEqual(ttmlTime('125000000t', 10000000), 12.5));
t('ttmlTime seconds', () => assert.strictEqual(ttmlTime('12.5s', 10000000), 12.5));
t('ttmlTime milliseconds (not minutes)', () => assert.strictEqual(ttmlTime('1500ms', 10000000), 1.5));
t('ttmlTime minutes', () => assert.strictEqual(ttmlTime('2m', 10000000), 120));
t('ttmlTime junk -> null', () => assert.strictEqual(ttmlTime('zzz', 10000000), null));

const TTML = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" ttp:tickRate="10000000" xml:lang="en">
 <body><div>
  <p begin="120000000t" end="145000000t">Hello <span tts:fontStyle="italic">there</span>.</p>
  <p begin="00:00:15.000" end="00:00:18.000">- Who are you?<br/>- I&apos;m nobody.</p>
  <p begin="18.5s" end="20s">Tom &amp; Jerry</p>
  <p>no timing at all</p>
 </div></body>
</tt>`;

const tcues = parseTTML(TTML);
t('parseTTML cue count (skips untimed <p>)', () => assert.strictEqual(tcues.length, 3));
t('parseTTML tick timing', () => { assert.strictEqual(tcues[0].start, 12); assert.strictEqual(tcues[0].end, 14.5); });
t('parseTTML strips inline spans', () => assert.strictEqual(tcues[0].text, 'Hello there.'));
t('parseTTML <br/> becomes a newline', () => assert.strictEqual(tcues[1].text, "- Who are you?\n- I'm nobody."));
t('parseTTML decodes entities', () => assert.strictEqual(tcues[2].text, 'Tom & Jerry'));
t('parseSubtitle sniffs TTML', () => assert.strictEqual(parseSubtitle(TTML).length, 3));
t('parseSubtitle sniffs WebVTT', () => assert.strictEqual(parseSubtitle(NETFLIX_VTT).length, 3));
t('parseSubtitle on junk -> []', () => assert.deepStrictEqual(parseSubtitle('nonsense'), []));

// ---- pickUrl / pickFormat ----
t('pickUrl array of {url}', () => assert.strictEqual(
  pickUrl({ urls: [{ cdn_id: 1, url: 'https://a.nflxvideo.net/x' }] }), 'https://a.nflxvideo.net/x'));
t('pickUrl downloadUrls object', () => assert.strictEqual(
  pickUrl({ downloadUrls: { cdn9: 'https://b.nflxvideo.net/y' } }), 'https://b.nflxvideo.net/y'));
t('pickUrl none -> null', () => assert.strictEqual(pickUrl({}), null));
t('pickFormat prefers webvtt-lssdh-ios8', () => assert.strictEqual(pickFormat({
  'dfxp-ls-sdh': { urls: [{ url: 'd' }] },
  'webvtt-lssdh-ios8': { urls: [{ url: 'v' }] },
}).fmt, 'webvtt-lssdh-ios8'));
t('pickFormat falls back to a TTML variant', () => assert.strictEqual(
  pickFormat({ 'imsc1.1': { urls: [{ url: 'i' }] } }).url, 'i'));
t('pickFormat with nothing usable -> null', () => assert.strictEqual(
  pickFormat({ 'nflx-cmisc': { urls: [{ url: 'x' }] } }), null));

// ---- normaliseTracks: the regressions that produced zero tracks ----
// Real manifests use UPPERCASE track types. Lowercasing the comparison, and
// accepting closedcaptions as well as subtitles, is what makes these pass.
const UPPER = [
  { new_track_id: 'T:1:en', language: 'en', languageDescription: 'English',
    rawTrackType: 'SUBTITLES',
    ttDownloadables: { 'webvtt-lssdh-ios8': { urls: [{ url: 'https://cdn.nflxvideo.net/en.vtt' }] } } },
  { new_track_id: 'T:2:zh', language: 'zh-Hant', languageDescription: '中文（繁體）',
    rawTrackType: 'CLOSEDCAPTIONS', trackType: 'ASSISTIVE',
    ttDownloadables: { 'webvtt-lssdh-ios8': { urls: [{ url: 'https://cdn.nflxvideo.net/zh.vtt' }] } } },
];
const up = normaliseTracks(UPPER);
t('normaliseTracks accepts UPPERCASE SUBTITLES', () => assert.strictEqual(up.length, 2));
t('normaliseTracks accepts CLOSEDCAPTIONS (was dropped)', () =>
  assert.strictEqual(up[1].language, 'zh-Hant'));
t('normaliseTracks flags CC', () => { assert.strictEqual(up[1].cc, true); assert.strictEqual(up[0].cc, false); });
t('normaliseTracks uses Netflix track id', () => assert.strictEqual(up[0].id, 'T:1:en'));

// Same language twice (CC + SUBTITLES) must not collide on one key.
const DUP = normaliseTracks([
  { new_track_id: 'T:a', language: 'en', rawTrackType: 'SUBTITLES',
    ttDownloadables: { webvtt: { urls: [{ url: 'a' }] } } },
  { new_track_id: 'T:b', language: 'en', rawTrackType: 'CLOSEDCAPTIONS',
    ttDownloadables: { webvtt: { urls: [{ url: 'b' }] } } },
]);
t('normaliseTracks keeps both tracks of one language', () => assert.strictEqual(DUP.length, 2));
t('normaliseTracks gives them distinct ids', () => assert.notStrictEqual(DUP[0].id, DUP[1].id));

// One malformed track used to throw and zero the WHOLE batch, because the
// try/catch sat outside the loop. It is now per track.
const exploding = {};
Object.defineProperty(exploding, 'ttDownloadables', {
  get() { throw new Error('boom'); }, enumerable: true,
});
const MIXED = normaliseTracks([
  UPPER[0],
  exploding,
  UPPER[1],
  null,
  { isNoneTrack: true, language: null },
  { language: 'de', rawTrackType: 'SUBTITLES', ttDownloadables: {} },  // no usable format
]);
t('one throwing track no longer zeroes the batch', () => assert.strictEqual(MIXED.length, 2));
t('batch survivors are the right tracks', () =>
  assert.deepStrictEqual(MIXED.map((x) => x.language), ['en', 'zh-Hant']));
t('normaliseTracks skips the none track', () =>
  assert.ok(MIXED.every((x) => x.language !== null)));
t('normaliseTracks non-array -> []', () => assert.deepStrictEqual(normaliseTracks(null), []));

// player-API shape (bcp47 / displayName) must work too
const pat = normaliseTracks([
  { isNoneTrack: true },
  { trackId: 'T:2:en', bcp47: 'en', displayName: 'English', trackType: 'PRIMARY',
    ttDownloadables: { 'webvtt-lssdh-ios8': { urls: [{ url: 'https://cdn.nflxvideo.net/api-en.vtt' }] } } },
  { trackId: 'T:3:zh', bcp47: 'zh-Hant', displayName: '中文（繁體）',
    downloadables: { webvtt: { urls: [{ url: 'https://cdn.nflxvideo.net/api-zh.vtt' }] } } },
]);
t('normaliseTracks reads player-API shape', () => assert.strictEqual(pat.length, 2));
t('normaliseTracks maps bcp47 -> language', () => assert.strictEqual(pat[0].language, 'en'));
t('normaliseTracks maps displayName -> label', () => assert.strictEqual(pat[1].label, '中文（繁體）'));
t('normaliseTracks accepts downloadables key', () => assert.strictEqual(pat[1].url, 'https://cdn.nflxvideo.net/api-zh.vtt'));

// ---- tracksFromManifest ----
const mt = tracksFromManifest({ movieId: 80014529, timedtexttracks: UPPER });
t('tracksFromManifest passes through', () => assert.strictEqual(mt.length, 2));
t('tracksFromManifest bad input -> []', () => assert.deepStrictEqual(tracksFromManifest({}), []));

// ---- reading Netflix's own rendered caption out of the DOM ----
const text = (s) => ({ nodeType: 3, nodeValue: s });
const elem = (tag, kids) => ({ nodeType: 1, tagName: tag, childNodes: kids || [] });
// <div><span><span>-而你是？</span><span><br>-現在 你唯一的選擇</span></span></div>
const ZH_BOX = elem('DIV', [elem('SPAN', [
  elem('SPAN', [text('-而你是？')]),
  elem('SPAN', [elem('BR'), text('-現在 你唯一的選擇')]),
])]);
t('textFromNode turns a nested <br> into a newline', () =>
  assert.strictEqual(textFromNode(ZH_BOX), '-而你是？\n-現在 你唯一的選擇'));
t('cleanNative keeps both caption lines', () =>
  assert.strictEqual(cleanNative(textFromNode(ZH_BOX)), '-而你是？\n-現在 你唯一的選擇'));
const EN_BOX = elem('DIV', [elem('SPAN', [elem('SPAN', [text('And ultimately killed.')])])]);
t('textFromNode reads a single-line caption', () =>
  assert.strictEqual(cleanNative(textFromNode(EN_BOX)), 'And ultimately killed.'));
t('cleanNative collapses runs of whitespace', () =>
  assert.strictEqual(cleanNative('  a   b  \n\n   c '), 'a b\nc'));
t('cleanNative on empty -> empty', () => assert.strictEqual(cleanNative(''), ''));
t('textFromNode on null -> empty', () => assert.strictEqual(textFromNode(null), ''));

console.log(`\n${pass} passed` + (process.exitCode ? ', with failures' : ''));
