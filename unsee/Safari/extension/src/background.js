/*
 * unsee — the one thing a content script cannot do for itself.
 *
 * Opening a tab *in the background* needs `chrome.tabs`, which content scripts
 * are not given. This worker exists for that single call and nothing else: it
 * takes one message, checks the URL is http(s), and opens it unfocused.
 *
 * No new permission is involved. The "tabs" permission gates reading a tab's
 * URL and title, not creating one, so the extension still asks for `storage`
 * and nothing more. The worker starts when a message arrives and is torn down
 * again by the browser; it holds no state, watches nothing, and never runs
 * unless you Ctrl-Shift-click a tag.
 */
chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'unsee-open-tab') return;

  const url = typeof message.url === 'string' ? message.url : '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;

  chrome.tabs.create({ url, active: false });
});
