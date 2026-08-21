// Node unit tests for the pure logic in src/vtt.js and src/inject.js.
// Run: node test/run-tests.js
const assert = require('assert');
const { parseVTT, textAt, parseTime, stripTags, textFromNode, cleanNative } = require('../src/vtt.js');
const { pickUrl, tracksFromManifest, normaliseTracks } = require('../src/inject.js');

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

// ---- parseVTT with a realistic Netflix (webvtt-lssdh-ios8) sample ----
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

// overlapping cues join
const overlap = parseVTT(`WEBVTT

1
00:00:01.000 --> 00:00:05.000
AAA

2
00:00:02.000 --> 00:00:04.000
BBB
`);
t('textAt joins overlapping cues', () => assert.strictEqual(textAt(overlap, 3), 'AAA\nBBB'));

// ---- pickUrl variants ----
t('pickUrl array of {url}', () => assert.strictEqual(
  pickUrl({ urls: [{ cdn_id: 1, url: 'https://a.nflxvideo.net/x' }] }), 'https://a.nflxvideo.net/x'));
t('pickUrl downloadUrls object', () => assert.strictEqual(
  pickUrl({ downloadUrls: { cdn9: 'https://b.nflxvideo.net/y' } }), 'https://b.nflxvideo.net/y'));
t('pickUrl none -> null', () => assert.strictEqual(pickUrl({}), null));

// ---- tracksFromManifest ----
const MANIFEST = {
  movieId: 80057281,
  timedtexttracks: [
    { isNoneTrack: true, language: null },
    {
      new_track_id: 'T:1:en', language: 'en', languageDescription: 'English',
      rawTrackType: 'subtitles',
      ttDownloadables: { 'webvtt-lssdh-ios8': { urls: [{ url: 'https://cdn.nflxvideo.net/en.vtt' }] } },
    },
    {
      new_track_id: 'T:2:zh', language: 'zh-Hant', languageDescription: '中文（繁體）',
      rawTrackType: 'closedcaptions', isForcedNarrative: false,
      ttDownloadables: { 'webvtt-lssdh-ios8': { downloadUrls: { cdn9: 'https://cdn.nflxvideo.net/zh.vtt' } } },
    },
    {
      new_track_id: 'T:3:de', language: 'de', languageDescription: 'Deutsch',
      ttDownloadables: { 'dfxp-ls-sdh': { urls: [{ url: 'https://cdn.nflxvideo.net/de.dfxp' }] } }, // no webvtt -> skipped
    },
  ],
};
const mt = tracksFromManifest(MANIFEST);
t('tracksFromManifest skips none + non-webvtt', () => assert.strictEqual(mt.length, 2));
t('tracksFromManifest english url', () => assert.strictEqual(mt[0].url, 'https://cdn.nflxvideo.net/en.vtt'));
t('tracksFromManifest cc flag', () => assert.strictEqual(mt[1].cc, true));
t('tracksFromManifest label preserved', () => assert.strictEqual(mt[1].label, '中文（繁體）'));
t('tracksFromManifest bad input -> []', () => assert.deepStrictEqual(tracksFromManifest({}), []));

// ---- normaliseTracks against the player-API track shape ----
// getTimedTextTrackList() returns bcp47/displayName rather than
// language/languageDescription, so the normaliser must accept both.
const PLAYER_API_TRACKS = [
  { isNoneTrack: true },
  {
    trackId: 'T:2:en', bcp47: 'en', displayName: 'English', trackType: 'PRIMARY',
    ttDownloadables: { 'webvtt-lssdh-ios8': { urls: [{ url: 'https://cdn.nflxvideo.net/api-en.vtt' }] } },
  },
  {
    trackId: 'T:3:zh', bcp47: 'zh-Hant', displayName: '中文（繁體）', trackType: 'PRIMARY',
    downloadables: { webvtt: { urls: [{ url: 'https://cdn.nflxvideo.net/api-zh.vtt' }] } },
  },
];
const pat = normaliseTracks(PLAYER_API_TRACKS);
t('normaliseTracks reads player-API shape', () => assert.strictEqual(pat.length, 2));
t('normaliseTracks maps bcp47 -> language', () => assert.strictEqual(pat[0].language, 'en'));
t('normaliseTracks maps displayName -> label', () => assert.strictEqual(pat[1].label, '中文（繁體）'));
t('normaliseTracks accepts downloadables key', () => assert.strictEqual(pat[1].url, 'https://cdn.nflxvideo.net/api-zh.vtt'));
t('normaliseTracks non-array -> []', () => assert.deepStrictEqual(normaliseTracks(null), []));

// ---- reading Netflix's own rendered caption out of the DOM ----
// Fake node tree mirroring real markup from a live Netflix player. Note the
// <br> sits INSIDE the second span, so textContent would glue the two lines
// together — textFromNode must turn it into a newline.
const text = (s) => ({ nodeType: 3, nodeValue: s });
const elem = (tag, kids) => ({ nodeType: 1, tagName: tag, childNodes: kids || [] });

// <div><span><span>-而你是？</span><span><br>-現在 你唯一的選擇</span></span></div>
const ZH_BOX = elem('DIV', [
  elem('SPAN', [
    elem('SPAN', [text('-而你是？')]),
    elem('SPAN', [elem('BR'), text('-現在 你唯一的選擇')]),
  ]),
]);
t('textFromNode turns a nested <br> into a newline', () =>
  assert.strictEqual(textFromNode(ZH_BOX), '-而你是？\n-現在 你唯一的選擇'));
t('cleanNative keeps both caption lines', () =>
  assert.strictEqual(cleanNative(textFromNode(ZH_BOX)), '-而你是？\n-現在 你唯一的選擇'));

// <div><span><span>who are trying to kill you.</span></span></div>
const EN_BOX = elem('DIV', [
  elem('SPAN', [elem('SPAN', [text('who are trying to kill you.')])]),
]);
t('textFromNode reads a single-line caption', () =>
  assert.strictEqual(cleanNative(textFromNode(EN_BOX)), 'who are trying to kill you.'));

t('cleanNative collapses runs of whitespace', () =>
  assert.strictEqual(cleanNative('  a   b  \n\n   c '), 'a b\nc'));
t('cleanNative on empty -> empty', () => assert.strictEqual(cleanNative(''), ''));
t('textFromNode on null -> empty', () => assert.strictEqual(textFromNode(null), ''));

console.log(`\n${pass} passed` + (process.exitCode ? ', with failures' : ''));
