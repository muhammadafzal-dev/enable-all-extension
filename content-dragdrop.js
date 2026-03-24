// content-dragdrop.js — Unblock drag & drop on sites that prevent it

if (window.__enableDragDropActive) {
  // Already running — just rescan for any newly blocked elements
  if (typeof window.__eabDragRescan === 'function') {
    window.__eabDragRescan();
  }
} else {
  window.__enableDragDropActive = true;

  const DRAG_EVENTS = ['dragstart', 'drag', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend'];
  const captureHandlers = {};

  // ─── Layer 1: Capture-phase event interception ───────────────────────────
  // These fire BEFORE any site code. The site can remove its own listeners,
  // set draggable="false", call stopPropagation — none of it matters because
  // our capture listeners already ran. This is the core guarantee.

  function allowDragOver(e) {
    // Browser only allows a drop if preventDefault is called during dragover.
    // We do it here in capture phase so it always fires regardless of site state.
    e.preventDefault();
  }

  function allowDrop(e) {
    // Prevents browser from navigating to the dropped file.
    // Page's own drop handler still runs after this (we don't stopPropagation).
    e.preventDefault();
  }

  // No-op for other drag events — registered only so cleanup works cleanly.
  function allowEvent() {}

  // ─── Layer 2: Fix element attributes and inline styles ───────────────────

  function fixElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

    // Fix draggable="false" attribute
    if (el.getAttribute('draggable') === 'false') {
      el.setAttribute('draggable', 'true');
      el.dataset.eabWasDraggable = 'false';
    }

    // Fix inline style drag blocking
    if (el.style.webkitUserDrag === 'none') {
      el.style.webkitUserDrag = 'auto';
      el.dataset.eabWasUserDrag = 'true';
    }
    if (el.style.userSelect === 'none') {
      el.style.userSelect = 'auto';
      el.dataset.eabWasUserSelect = 'true';
    }
    if (el.style.pointerEvents === 'none') {
      el.style.pointerEvents = 'auto';
      el.dataset.eabWasPointerEvents = 'true';
    }
  }

  // Scan full DOM and fix all blocked elements
  function scanAndFix() {
    // Fix attribute-based blocking
    document.querySelectorAll('[draggable="false"]').forEach(fixElement);

    // Fix inline-style-based blocking on any element
    document.querySelectorAll('[style]').forEach(el => {
      if (
        el.style.webkitUserDrag === 'none' ||
        el.style.userSelect === 'none' ||
        el.style.pointerEvents === 'none'
      ) {
        fixElement(el);
      }
    });
  }

  // Restore everything to original state (called when toggled off)
  function restoreAll() {
    document.querySelectorAll('[data-eab-was-draggable]').forEach(el => {
      el.setAttribute('draggable', el.dataset.eabWasDraggable);
      delete el.dataset.eabWasDraggable;
    });
    document.querySelectorAll('[data-eab-was-user-drag]').forEach(el => {
      el.style.webkitUserDrag = 'none';
      delete el.dataset.eabWasUserDrag;
    });
    document.querySelectorAll('[data-eab-was-user-select]').forEach(el => {
      el.style.userSelect = 'none';
      delete el.dataset.eabWasUserSelect;
    });
    document.querySelectorAll('[data-eab-was-pointer-events]').forEach(el => {
      el.style.pointerEvents = 'none';
      delete el.dataset.eabWasPointerEvents;
    });
  }

  // ─── Layer 3: MutationObserver — re-enable the moment site tries to disable ─

  function handleMutations(mutations) {
    for (const mutation of mutations) {
      // New elements added to DOM
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          fixElement(node);
          node.querySelectorAll?.('[draggable="false"]').forEach(fixElement);
          node.querySelectorAll?.('[style]').forEach(el => {
            if (
              el.style.webkitUserDrag === 'none' ||
              el.style.userSelect === 'none' ||
              el.style.pointerEvents === 'none'
            ) {
              fixElement(el);
            }
          });
        }
      }

      // Attribute changed on existing element (site trying to re-disable)
      if (mutation.type === 'attributes') {
        const el = mutation.target;
        // Skip if we set this attribute ourselves to avoid infinite loop
        if (mutation.attributeName === 'draggable' && el.dataset.eabWasDraggable) continue;
        fixElement(el);
      }
    }
  }

  function start() {
    // Layer 1: Capture-phase event listeners
    DRAG_EVENTS.forEach(eventName => {
      if (eventName === 'dragover') {
        captureHandlers[eventName] = allowDragOver;
      } else if (eventName === 'drop') {
        captureHandlers[eventName] = allowDrop;
      } else {
        captureHandlers[eventName] = allowEvent;
      }
      document.addEventListener(eventName, captureHandlers[eventName], true);
    });

    // Layer 2: Fix all currently blocked elements
    scanAndFix();

    // Layer 3: Watch for the site trying to re-disable anything
    window.__eabDragObserver = new MutationObserver(handleMutations);
    window.__eabDragObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['draggable', 'style']
    });
  }

  function stop() {
    // Remove capture-phase listeners
    DRAG_EVENTS.forEach(eventName => {
      if (captureHandlers[eventName]) {
        document.removeEventListener(eventName, captureHandlers[eventName], true);
      }
    });

    // Stop watching
    if (window.__eabDragObserver) {
      window.__eabDragObserver.disconnect();
      window.__eabDragObserver = null;
    }

    // Restore original state
    restoreAll();
    window.__enableDragDropActive = false;
  }

  // Expose rescan for re-injection after page navigation
  window.__eabDragRescan = () => {
    scanAndFix();
  };

  // Listen for toggle-off from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'disconnect' && message.feature === 'dragdrop') {
      stop();
    }
  });

  start();
}
