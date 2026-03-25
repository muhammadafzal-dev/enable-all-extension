// content-model-override.js
// Runs in ISOLATED world. Injects content-model-override-main.js into the PAGE's
// JS context via a <script src> tag so it can access and override window.fetch.

(function () {
  if (window.__eabModelOverrideInjected) return;
  window.__eabModelOverrideInjected = true;

  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('content-model-override-main.js');
  s.onload = function () { s.remove(); };
  (document.head || document.documentElement).appendChild(s);

  // Listen for disable signal from background
  chrome.runtime.onMessage.addListener(function handler(msg) {
    if (msg.action === 'disconnect' && msg.feature === 'modeloverride') {
      chrome.runtime.onMessage.removeListener(handler);
      window.__eabModelOverrideInjected = false;

      // Tell the MAIN world to restore fetch
      const s2 = document.createElement('script');
      s2.src = chrome.runtime.getURL('content-model-override-stop.js');
      s2.onload = function () { s2.remove(); };
      (document.head || document.documentElement).appendChild(s2);
    }
  });
})();
