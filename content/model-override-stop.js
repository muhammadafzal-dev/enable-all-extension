// content-model-override-stop.js
// Runs in PAGE's JS context. Restores the original window.fetch and clears flags.

(function () {
  if (window.__eabOriginalFetch) {
    window.fetch = window.__eabOriginalFetch;
    delete window.__eabOriginalFetch;
  }
  delete window.__eabModelOverrideActive;
  console.log('[EAB] Model override removed — fetch restored.');
})();
