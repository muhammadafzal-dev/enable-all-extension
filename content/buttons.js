// content.js — Injected into pages to enable disabled elements in real-time
(function () {

// Symbols are not enumerable via Object.keys(window) or for..in — invisible to site scans
const _GUARD  = Symbol.for('_cb1');
const _RESCAN = Symbol.for('_cb2');

if (window[_GUARD]) {
  // Already running — just re-scan (handles background re-injecting on navigation)
  if (typeof window[_RESCAN] === 'function') window[_RESCAN]();
} else {
  window[_GUARD] = true;

  // Random attribute prefix per page load — looks like data-x7f3k2a, not data-eab-*
  // A site would have to know this random value to detect us
  const _p = Math.random().toString(36).slice(2, 9);
  const A = {
    disabled: `data-${_p}a`,
    aria:     `data-${_p}b`,
    readonly: `data-${_p}c`,
    pointer:  `data-${_p}d`,
    cursor:   `data-${_p}e`,
  };

  let totalCount = 0;
  let observer = null;
  let shadowObservers = [];
  let debounceTimer = null;

  const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, [role="button"], [tabindex]';
  const DISABLED_SELECTOR = '[disabled], [aria-disabled="true"], [readonly]';

  // Enable a single element — returns true if anything changed
  function enableElement(el) {
    if (el.nodeType !== Node.ELEMENT_NODE) return false;
    let changed = false;

    if (el.hasAttribute('disabled')) {
      el.removeAttribute('disabled');
      el.setAttribute(A.disabled, 'true');
      changed = true;
    }

    if (el.getAttribute('aria-disabled') === 'true') {
      el.setAttribute('aria-disabled', 'false');
      el.setAttribute(A.aria, 'true');
      changed = true;
    }

    if (el.hasAttribute('readonly')) {
      el.removeAttribute('readonly');
      el.setAttribute(A.readonly, 'true');
      changed = true;
    }

    const computed = getComputedStyle(el);
    if (computed.pointerEvents === 'none') {
      el.style.pointerEvents = 'auto';
      el.setAttribute(A.pointer, 'true');
      changed = true;
    }

    if (computed.cursor === 'not-allowed') {
      el.style.cursor = 'pointer';
      el.setAttribute(A.cursor, 'true');
      changed = true;
    }

    // Traverse open shadow DOM
    if (el.shadowRoot) {
      el.shadowRoot.querySelectorAll(DISABLED_SELECTOR).forEach(child => {
        if (enableElement(child)) changed = true;
      });
      attachShadowObserver(el.shadowRoot);
    }

    return changed;
  }

  // Scan the entire DOM and enable all disabled elements
  function scanAndEnable(root) {
    let count = 0;
    const targetRoot = root || document;

    targetRoot.querySelectorAll(DISABLED_SELECTOR).forEach(el => {
      if (enableElement(el)) count++;
    });

    // Check interactive elements for CSS-based blocking (only if not already processed)
    targetRoot.querySelectorAll(INTERACTIVE_SELECTOR).forEach(el => {
      if (!el.hasAttribute(A.disabled) && !el.hasAttribute(A.pointer)) {
        const computed = getComputedStyle(el);
        if (computed.pointerEvents === 'none' || computed.cursor === 'not-allowed') {
          if (enableElement(el)) count++;
        }
      }
    });

    return count;
  }

  // Restore all elements to their original disabled state
  function restoreAll() {
    document.querySelectorAll(`[${A.disabled}]`).forEach(el => {
      el.setAttribute('disabled', '');
      el.removeAttribute(A.disabled);
    });

    document.querySelectorAll(`[${A.aria}]`).forEach(el => {
      el.setAttribute('aria-disabled', 'true');
      el.removeAttribute(A.aria);
    });

    document.querySelectorAll(`[${A.readonly}]`).forEach(el => {
      el.setAttribute('readonly', '');
      el.removeAttribute(A.readonly);
    });

    document.querySelectorAll(`[${A.pointer}]`).forEach(el => {
      el.style.pointerEvents = 'none';
      el.removeAttribute(A.pointer);
    });

    document.querySelectorAll(`[${A.cursor}]`).forEach(el => {
      el.style.cursor = 'not-allowed';
      el.removeAttribute(A.cursor);
    });
  }

  // Check if extension context is still valid
  function isContextValid() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  // Tear down observers when extension is reloaded mid-page
  function teardownOnInvalidContext() {
    if (observer) { observer.disconnect(); observer = null; }
    shadowObservers.forEach(obs => obs.disconnect());
    shadowObservers = [];
    window[_GUARD] = false;
  }

  // Report count back to background with debouncing
  function reportCount() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!isContextValid()) {
        teardownOnInvalidContext();
        return;
      }
      try {
        chrome.runtime.sendMessage({ action: 'countUpdate', count: totalCount })
          .catch(() => {});
      } catch {
        teardownOnInvalidContext();
      }
    }, 200);
  }

  // MutationObserver callback
  function handleMutations(mutations) {
    let newCount = 0;

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (enableElement(node)) newCount++;
          node.querySelectorAll?.(DISABLED_SELECTOR).forEach(el => {
            if (enableElement(el)) newCount++;
          });
        }
      }

      if (mutation.type === 'attributes') {
        const el = mutation.target;
        // Skip attributes we set ourselves to avoid infinite loops
        if (mutation.attributeName === 'disabled'      && el.hasAttribute(A.disabled)) continue;
        if (mutation.attributeName === 'aria-disabled' && el.hasAttribute(A.aria))     continue;
        if (mutation.attributeName === 'readonly'      && el.hasAttribute(A.readonly)) continue;
        if (enableElement(el)) newCount++;
      }
    }

    if (newCount > 0) {
      totalCount += newCount;
      reportCount();
    }
  }

  const observerConfig = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'readonly', 'style'],
  };

  function attachShadowObserver(shadowRoot) {
    const shadowObs = new MutationObserver(handleMutations);
    shadowObs.observe(shadowRoot, observerConfig);
    shadowObservers.push(shadowObs);
  }

  function start() {
    totalCount = scanAndEnable();
    reportCount();

    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, observerConfig);
  }

  function stop() {
    if (observer) { observer.disconnect(); observer = null; }
    shadowObservers.forEach(obs => obs.disconnect());
    shadowObservers = [];
    restoreAll();
    totalCount = 0;
    window[_GUARD] = false;
  }

  // Expose rescan via Symbol — invisible to site scans
  window[_RESCAN] = () => {
    totalCount += scanAndEnable();
    reportCount();
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'disconnect' && message.feature === 'buttons') stop();
  });

  start();
}
})();
