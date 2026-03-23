// content.js — Injected into pages to enable disabled elements in real-time

// Guard against double injection
if (window.__enableAllButtonsActive) {
  // Already running — just re-scan (handles page navigation re-inject)
  if (typeof window.__eabRescan === 'function') {
    window.__eabRescan();
  }
} else {
  window.__enableAllButtonsActive = true;

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
      el.dataset.eabWasDisabled = 'true';
      changed = true;
    }

    if (el.getAttribute('aria-disabled') === 'true') {
      el.setAttribute('aria-disabled', 'false');
      el.dataset.eabWasAriaDisabled = 'true';
      changed = true;
    }

    if (el.hasAttribute('readonly')) {
      el.removeAttribute('readonly');
      el.dataset.eabWasReadonly = 'true';
      changed = true;
    }

    const computed = getComputedStyle(el);
    if (computed.pointerEvents === 'none') {
      el.style.pointerEvents = 'auto';
      el.dataset.eabWasPointerEvents = 'true';
      changed = true;
    }

    // Handle cursor style that indicates disabled
    if (computed.cursor === 'not-allowed') {
      el.style.cursor = 'pointer';
      el.dataset.eabWasCursor = 'true';
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

    // Elements with explicit disabled/aria-disabled/readonly
    targetRoot.querySelectorAll(DISABLED_SELECTOR).forEach(el => {
      if (enableElement(el)) count++;
    });

    // Elements with pointer-events: none (check interactive elements only for performance)
    targetRoot.querySelectorAll(INTERACTIVE_SELECTOR).forEach(el => {
      if (!el.dataset.eabWasDisabled && !el.dataset.eabWasPointerEvents) {
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
    document.querySelectorAll('[data-eab-was-disabled]').forEach(el => {
      el.setAttribute('disabled', '');
      delete el.dataset.eabWasDisabled;
    });

    document.querySelectorAll('[data-eab-was-aria-disabled]').forEach(el => {
      el.setAttribute('aria-disabled', 'true');
      delete el.dataset.eabWasAriaDisabled;
    });

    document.querySelectorAll('[data-eab-was-readonly]').forEach(el => {
      el.setAttribute('readonly', '');
      delete el.dataset.eabWasReadonly;
    });

    document.querySelectorAll('[data-eab-was-pointer-events]').forEach(el => {
      el.style.pointerEvents = 'none';
      delete el.dataset.eabWasPointerEvents;
    });

    document.querySelectorAll('[data-eab-was-cursor]').forEach(el => {
      el.style.cursor = 'not-allowed';
      delete el.dataset.eabWasCursor;
    });
  }

  // Report count back to background with debouncing
  function reportCount() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      chrome.runtime.sendMessage({
        action: 'countUpdate',
        count: totalCount
      }).catch(() => {}); // Extension context may be invalidated
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
          // Also check descendants
          const descendants = node.querySelectorAll?.(DISABLED_SELECTOR);
          if (descendants) {
            descendants.forEach(el => {
              if (enableElement(el)) newCount++;
            });
          }
        }
      }

      if (mutation.type === 'attributes') {
        const el = mutation.target;
        // Skip if we already processed this element (avoid loops)
        if (mutation.attributeName === 'disabled' && el.dataset.eabWasDisabled) continue;
        if (mutation.attributeName === 'aria-disabled' && el.dataset.eabWasAriaDisabled) continue;
        if (mutation.attributeName === 'readonly' && el.dataset.eabWasReadonly) continue;
        if (enableElement(el)) newCount++;
      }
    }

    if (newCount > 0) {
      totalCount += newCount;
      reportCount();
    }
  }

  // Observer config
  const observerConfig = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'readonly', 'style']
  };

  // Attach observer to a shadow root
  function attachShadowObserver(shadowRoot) {
    const shadowObs = new MutationObserver(handleMutations);
    shadowObs.observe(shadowRoot, observerConfig);
    shadowObservers.push(shadowObs);
  }

  // Start observing and enable all existing elements
  function start() {
    totalCount = scanAndEnable();
    reportCount();

    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, observerConfig);
  }

  // Stop observing and restore elements
  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    shadowObservers.forEach(obs => obs.disconnect());
    shadowObservers = [];

    restoreAll();
    totalCount = 0;
    window.__enableAllButtonsActive = false;
  }

  // Expose rescan for re-injection
  window.__eabRescan = () => {
    totalCount += scanAndEnable();
    reportCount();
  };

  // Listen for disconnect message from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'disconnect') {
      stop();
    }
  });

  // Start immediately
  start();
}
