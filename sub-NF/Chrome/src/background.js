// sub-NF — background service worker.
//
// The only privileged thing it does: fetch a subtitle (WebVTT) file from
// Netflix's caption CDN on behalf of the content script. Doing the fetch here
// (with host_permissions for the CDN) sidesteps page CORS. It returns plain
// text; it never stores or forwards it anywhere else.
const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'subnf-fetch' || typeof msg.url !== 'string') return;
  // Accept only Netflix-operated hosts. Caption files are served from the Open
  // Connect CDN (*.nflxvideo.net) but the exact host varies by ISP and region,
  // so allow the whole family rather than one name.
  let host = '';
  try { host = new URL(msg.url).hostname; } catch (_) { sendResponse({ ok: false, error: 'bad url' }); return; }
  const allowed = /(^|\.)(nflxvideo\.net|nflxext\.com|nflximg\.net|nflxso\.net|netflix\.com)$/.test(host);
  if (!allowed) { sendResponse({ ok: false, error: 'host not allowed: ' + host }); return; }

  fetch(msg.url, { credentials: 'omit' })
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((text) => sendResponse({ ok: true, text }))
    .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true; // keep the message channel open for the async response
});
