# Anti-Detection Guide

How to make the extension harder to detect by sites that actively scan for it.

---

## Current Fingerprints (detectable by sites)

Sites can find the extension by scanning for these:

| Fingerprint | Where | How a site detects it |
|---|---|---|
| `window.__enableAllButtonsActive` | content.js | `if (window.__enableAllButtonsActive)` |
| `window.__enableDragDropActive` | content-dragdrop.js | `if (window.__enableDragDropActive)` |
| `window.__eabRescan` | content.js | `Object.keys(window).includes('__eabRescan')` |
| `window.__eabDragRescan` | content-dragdrop.js | same |
| `window.__eabDragObserver` | content-dragdrop.js | same |
| `data-eab-was-disabled` | DOM elements | `document.querySelector('[data-eab-was-disabled]')` |
| `data-eab-was-draggable` | DOM elements | `document.querySelector('[data-eab-was-draggable]')` |
| All other `data-eab-*` attrs | DOM elements | `document.querySelectorAll('[data-eab-*]')` |

---

## The Fix

Two independent upgrades. Either can be applied separately.

### Upgrade 1 — Symbol guards (hides window properties)

Replace `window.__enableAllButtonsActive` etc. with `window[Symbol.for('_cb1')]`.

**Why it works:** Symbols are NOT visible via:
- `Object.keys(window)`
- `for (let k in window)`
- `window.hasOwnProperty('...')`
- `Object.getOwnPropertyNames(window)`

A site would have to specifically call `Object.getOwnPropertySymbols(window)` and know to look for `_cb1`. No known site fingerprinting script does this.

```js
// Before
window.__enableAllButtonsActive = true;
window.__eabRescan = () => { ... };
if (window.__enableAllButtonsActive) { ... }

// After
const _GUARD  = Symbol.for('_cb1');  // same symbol returned each time
const _RESCAN = Symbol.for('_cb2');
window[_GUARD] = true;
window[_RESCAN] = () => { ... };
if (window[_GUARD]) { ... }
```

**IMPORTANT — wrap in IIFE to avoid "already declared" error:**

Both `content.js` and `content-dragdrop.js` run in the same Chrome extension isolated world (shared JS context). If both files have `const _GUARD` at top level, the second file throws `SyntaxError: Identifier '_GUARD' has already been declared`.

The fix: wrap each file in an IIFE so `const` is function-scoped, not shared:

```js
// content.js
(function () {
  const _GUARD  = Symbol.for('_cb1');
  const _RESCAN = Symbol.for('_cb2');
  // ... rest of file ...
})();

// content-dragdrop.js
(function () {
  const _GUARD  = Symbol.for('_dd1');
  const _RESCAN = Symbol.for('_dd2');
  // ... rest of file ...
})();
```

This was the root cause of the error in the previous attempt.

---

### Upgrade 2 — Random data-attribute prefix (hides DOM markers)

Replace `data-eab-was-disabled` etc. with `data-[random7chars][letter]`.

**Why it works:** The random prefix changes every page load. A site would have to scan for all `data-*` attributes and apply heuristics — no fingerprinting script does this.

```js
// Generate once per page load (inside the IIFE)
const _p = Math.random().toString(36).slice(2, 9);  // e.g. "x7f3k2a"
const A = {
  disabled: `data-${_p}a`,   // e.g. "data-x7f3k2aa"
  aria:     `data-${_p}b`,
  readonly: `data-${_p}c`,
  pointer:  `data-${_p}d`,
  cursor:   `data-${_p}e`,
};

// Use setAttribute/getAttribute instead of el.dataset
el.setAttribute(A.disabled, 'true');
el.hasAttribute(A.disabled);
el.removeAttribute(A.disabled);
document.querySelectorAll(`[${A.disabled}]`);
```

**Why `_p` stays consistent within a session:** The random value is generated once when the IIFE runs and closes over `A`. `restoreAll()` uses the same `A` object, so it always cleans up its own attributes correctly.

---

## Implementation Checklist

When applying both upgrades to a file:

- [ ] Wrap entire file in `(function () { ... })();`
- [ ] Declare `const _GUARD = Symbol.for('...')` inside the IIFE (unique key per file)
- [ ] Declare `const _RESCAN = Symbol.for('...')` inside the IIFE
- [ ] Replace `window.__*Active` with `window[_GUARD]`
- [ ] Replace `window.__*Rescan` with `window[_RESCAN]`
- [ ] Move any other `window.__*` vars into the closure or use Symbols
- [ ] Generate `const _p = Math.random().toString(36).slice(2, 9)` inside IIFE
- [ ] Build `const A = { ... }` attribute name map using `_p`
- [ ] Replace all `el.dataset.eabWas*` reads/writes with `el.getAttribute/setAttribute/hasAttribute/removeAttribute(A.xxx)`
- [ ] Replace all `document.querySelectorAll('[data-eab-*]')` with `document.querySelectorAll(`[${A.xxx}]`)`

---

## Symbol key registry (avoid collisions between files)

| File | Guard symbol | Rescan symbol |
|---|---|---|
| content.js | `Symbol.for('_cb1')` | `Symbol.for('_cb2')` |
| content-dragdrop.js | `Symbol.for('_dd1')` | `Symbol.for('_dd2')` |
