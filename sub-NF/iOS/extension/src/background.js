// sub-NF — background service worker.
//
// The only privileged thing it does: fetch a subtitle (WebVTT) file from
// Netflix's caption CDN on behalf of the content script. Doing the fetch here
// (with host_permissions for the CDN) sidesteps page CORS. It returns plain
// text; it never stores or forwards it anywhere else.
// Classic (non-module) service worker, so importScripts is available. The
// allowlist lives in one tested place rather than as a regex copied around.
importScripts('/src/hosts.js');

const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'subnf-fetch' || typeof msg.url !== 'string') return;
  // Accept only https URLs on Netflix-operated hosts. See src/hosts.js.
  // Fail closed, and say so plainly: if importScripts ever fails on a browser
  // that does not support it, subtitles stop working either way, and a clear
  // error beats an exception on every request.
  const H = globalThis.SubNFHosts;
  if (!H) { sendResponse({ ok: false, error: 'hosts.js did not load' }); return; }
  if (!H.isNetflixHost(msg.url)) {
    sendResponse({ ok: false, error: 'url not allowed: ' + String(msg.url).slice(0, 120) });
    return;
  }

  fetch(msg.url, { credentials: 'omit' })
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((text) => sendResponse({ ok: true, text }))
    .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true; // keep the message channel open for the async response
});
