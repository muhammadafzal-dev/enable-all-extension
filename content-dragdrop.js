// content-dragdrop.js — Unblock drag & drop on sites that prevent it

if (window.__enableDragDropActive) {
  // Already running
} else {
  window.__enableDragDropActive = true;

  const DRAG_EVENTS = ['dragstart', 'drag', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend'];

  // Store references for cleanup
  const captureHandlers = {};

  // For dragover: must call preventDefault to signal the browser that drops are allowed.
  // Do NOT stopPropagation — that would kill the target element's own handlers (including
  // the page's real drop listener that shows files).
  function allowDragOver(e) {
    e.preventDefault();
  }

  // For drop: just prevent the browser from navigating to the dropped file.
  // Let the event propagate normally so the page's own drop handler can process files.
  function allowDrop(e) {
    e.preventDefault();
  }

  // For all other drag events: no-op capture handler.
  // We register these so cleanup (removeEventListener) works cleanly,
  // but we don't need to call preventDefault on them.
  function allowEvent() {}

  function enableDraggableAttributes() {
    // Remove draggable="false" from elements
    document.querySelectorAll('[draggable="false"]').forEach(el => {
      el.setAttribute('draggable', 'true');
      el.dataset.eabWasDraggable = 'false';
    });

    // Remove CSS that blocks drag
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      if (style.webkitUserDrag === 'none' || style.userSelect === 'none') {
        if (style.webkitUserDrag === 'none') {
          el.style.webkitUserDrag = 'auto';
          el.dataset.eabWasUserDrag = 'true';
        }
        if (style.userSelect === 'none') {
          el.style.userSelect = 'auto';
          el.dataset.eabWasUserSelect = 'true';
        }
      }
    });
  }

  function start() {
    // Capture-phase listeners to intercept before site's listeners
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

    // Fix draggable attributes
    enableDraggableAttributes();

    // Watch for dynamically added elements with draggable="false"
    window.__eabDragObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.getAttribute?.('draggable') === 'false') {
              node.setAttribute('draggable', 'true');
              node.dataset.eabWasDraggable = 'false';
            }
            node.querySelectorAll?.('[draggable="false"]').forEach(el => {
              el.setAttribute('draggable', 'true');
              el.dataset.eabWasDraggable = 'false';
            });
          }
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'draggable') {
          const el = mutation.target;
          if (el.getAttribute('draggable') === 'false' && !el.dataset.eabWasDraggable) {
            el.setAttribute('draggable', 'true');
            el.dataset.eabWasDraggable = 'false';
          }
        }
      }
    });

    window.__eabDragObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['draggable']
    });
  }

  function stop() {
    // Remove capture listeners
    DRAG_EVENTS.forEach(eventName => {
      if (captureHandlers[eventName]) {
        document.removeEventListener(eventName, captureHandlers[eventName], true);
      }
    });

    // Restore draggable attributes
    document.querySelectorAll('[data-eab-was-draggable]').forEach(el => {
      el.setAttribute('draggable', el.dataset.eabWasDraggable);
      delete el.dataset.eabWasDraggable;
    });

    // Restore CSS
    document.querySelectorAll('[data-eab-was-user-drag]').forEach(el => {
      el.style.webkitUserDrag = 'none';
      delete el.dataset.eabWasUserDrag;
    });

    document.querySelectorAll('[data-eab-was-user-select]').forEach(el => {
      el.style.userSelect = 'none';
      delete el.dataset.eabWasUserSelect;
    });

    // Disconnect observer
    if (window.__eabDragObserver) {
      window.__eabDragObserver.disconnect();
      window.__eabDragObserver = null;
    }

    window.__enableDragDropActive = false;
  }

  // Listen for disconnect
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'disconnect' && message.feature === 'dragdrop') {
      stop();
    }
  });

  start();
}
