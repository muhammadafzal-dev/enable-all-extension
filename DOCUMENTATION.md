# Enable All — Chrome Extension Documentation

## What We Built

A Chrome Extension (Manifest V3) that removes disabled states from UI elements on web pages, allowing users to interact with intentionally disabled buttons, inputs, and form fields. It also unblocks file drag-and-drop functionality on sites that prevent it.

**Version:** 1.0
**Type:** Chrome Extension (Manifest V3)
**Category:** Developer Utility / Productivity

---

## Features

### 1. Enable Buttons
Removes all forms of disabled/blocked states from interactive elements:

| What it fixes | How |
|---|---|
| `disabled` HTML attribute | Removes attribute, stores original in `data-eab-was-disabled` |
| `aria-disabled="true"` | Changes to `"false"`, stores in `data-eab-was-aria-disabled` |
| `readonly` attribute | Removes attribute, stores in `data-eab-was-readonly` |
| `pointer-events: none` CSS | Sets to `auto`, stores in `data-eab-was-pointer-events` |
| `cursor: not-allowed` CSS | Sets to `pointer`, stores in `data-eab-was-cursor` |

**Targets:** `button`, `input`, `select`, `textarea`, `a`, `[role="button"]`, `[tabindex]`

**Also handles:**
- Shadow DOM elements (recursively)
- Dynamically added elements via MutationObserver
- Frameworks that re-disable elements after render (React, Vue, Angular, etc.)

**Restoration:** When toggled off, all original states are restored using the stored `data-eab-*` attributes.

---

### 2. Enable Drag & Drop
Unblocks file drag-and-drop on sites that prevent it:

| What it fixes | How |
|---|---|
| `draggable="false"` attribute | Changes to `"true"`, stores original in `data-eab-was-draggable` |
| `-webkit-user-drag: none` CSS | Sets to `auto`, stores in `data-eab-was-user-drag` |
| `user-select: none` CSS | Sets to `auto`, stores in `data-eab-was-user-select` |
| Drop zone blocked by missing `preventDefault` | Attaches capture-phase `dragover` listener that calls `preventDefault` |

**Key technical detail:** The browser only allows a drop if `preventDefault()` is called on the `dragover` event. We attach capture-phase listeners to do this without stopping propagation, so the page's own drop handlers still run.

**Restoration:** When toggled off, all attributes and CSS are reverted.

---

## File Structure

```
enable-all-extension/
├── manifest.json           # Extension config (MV3)
├── popup.html              # Popup UI markup
├── popup.css               # Popup styling (dark theme)
├── popup.js                # Popup logic and state sync
├── background.js           # Service worker — state management and script injection
├── content.js              # Content script — enables disabled elements
├── content-dragdrop.js     # Content script — unblocks drag & drop
├── test-page.html          # Local test page for all features
├── generate-icons.html     # Utility to generate PNG icons from canvas
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── DOCUMENTATION.md        # This file
```

---

## Architecture

### How It Works — End to End

```
User clicks toggle in popup
        ↓
popup.js sends message to background.js
{ action: 'enable'|'disable', feature: 'buttons'|'dragdrop', tabId }
        ↓
background.js updates per-tab state in chrome.storage.session
        ↓
background.js injects content script into the active tab
(content.js or content-dragdrop.js)
        ↓
Content script scans DOM and enables elements
        ↓
Content script sends count updates back to background.js
{ action: 'countUpdate', count: N }
        ↓
background.js stores updated count
        ↓
popup.js receives count and updates UI display
```

### Per-Tab State

Each tab has its own independent state stored in `chrome.storage.session`:

```js
{
  enableButtons: boolean,
  enableDragdrop: boolean,
  count: number          // elements fixed so far
}
```

State is cleared when:
- Tab is closed (`chrome.tabs.onRemoved`)
- Browser is closed (session storage is cleared automatically)

### Script Injection Strategy

Content scripts are injected **on demand** (not declared in manifest), using `chrome.scripting.executeScript`. This means:
- Scripts only run on tabs where the user enables a feature
- Scripts are re-injected on page navigation (`chrome.tabs.onUpdated` with `status: 'complete'`)
- Double injection is prevented by guard variables (`window.__enableAllButtonsActive`, `window.__enableDragDropActive`)

---

## Component Details

### manifest.json
- Manifest V3
- Permissions: `activeTab`, `scripting`, `storage`
- Service worker: `background.js`
- Popup: `popup.html`
- Icons: 16, 48, 128px PNG

### background.js (Service Worker)
Central orchestrator. Manages state and injects scripts.

**Message handlers:**

| Action | What it does |
|---|---|
| `enable` | Sets feature state to true, injects content script |
| `disable` | Sets feature state to false, sends disconnect message to tab |
| `getState` | Returns current state for a tab (used by popup on open) |
| `countUpdate` | Receives element count from content script, stores it |

**Lifecycle listeners:**

| Event | What it does |
|---|---|
| `chrome.tabs.onUpdated` | Re-injects scripts after page navigation if features were active |
| `chrome.tabs.onRemoved` | Cleans up state for closed tabs |

### content.js (Enable Buttons)
Injected into pages when "Enable Buttons" is toggled on.

**Key functions:**

| Function | Purpose |
|---|---|
| `enableElement(el)` | Removes all disabled states from a single element |
| `scanAndEnable(root)` | Scans entire DOM (or subtree) and enables all disabled elements |
| `restoreAll()` | Reverts all changes using `data-eab-*` attributes |
| `handleMutations(mutations)` | MutationObserver callback — handles new/changed elements |
| `reportCount()` | Debounced (200ms) count report to background |
| `start()` | Scans DOM, attaches MutationObserver |
| `stop()` | Disconnects observers, restores all elements |

**MutationObserver config:**
```js
{
  childList: true,          // Watch for added/removed elements
  subtree: true,            // Watch entire DOM tree
  attributes: true,         // Watch for attribute changes
  attributeFilter: ['disabled', 'aria-disabled', 'readonly', 'style']
}
```

**Guard against double injection:**
```js
if (window.__enableAllButtonsActive) {
  window.__eabRescan();  // Already running — just rescan
} else {
  window.__enableAllButtonsActive = true;
  // ... full init
}
```

### content-dragdrop.js (Enable Drag & Drop)
Injected into pages when "Enable Drag & Drop" is toggled on.

**Key design decision:** Capture-phase listeners on `dragover` and `drop` so we can call `preventDefault()` before site listeners run, without blocking propagation. This allows the site's own drop handlers to still receive and process files.

**Bug note:** `allowEvent` function is referenced in `start()` for non-dragover/drop events but is not defined in the script. This is a known bug.

### popup.html / popup.css
Dark-themed popup (320px wide).

**UI elements:**
- Header with green logo and "Enable All" title + version badge
- Two feature cards (Enable Buttons, Enable Drag & Drop), each with:
  - Icon
  - Title and description/status text
  - Toggle switch
- Stats bar (hidden when both features off) showing:
  - Element count
  - "Watching page" indicator with pulsing green dot
- Footer: "Works on current tab only"

**Active state:** Cards get a green tint when their feature is on.

### popup.js
Manages popup UI state and communicates with background.

**On open (`init`):**
1. Queries the active tab ID
2. Sends `getState` to background
3. Updates UI with stored state

**On toggle change:**
1. Updates local state
2. Calls `updateUI()`
3. Sends `enable` or `disable` message to background

**Count updates:**
Listens for `countUpdate` messages (note: there's a known bug here — background doesn't forward count updates to popup, so live count updates don't work after popup is open).

---

## Known Issues / Bugs

| # | File | Issue | Impact |
|---|---|---|---|
| 1 | `content-dragdrop.js:57` | ~~`allowEvent` function was referenced but never defined~~ | **FIXED** — defined as no-op function |
| 2 | `popup.js:84` | Listens for `countUpdate` with `message.tabId`, but background sends `countUpdate` from content script without a `tabId` field in the forwarded message | Live element count doesn't update in popup after it's opened |
| 3 | `content-dragdrop.js:34` | `document.querySelectorAll('*')` scans every element on the page for CSS properties — very expensive on large pages | Performance issue on pages with many elements |
| 4 | `content.js:93-116` | `restoreAll()` only queries `document` — does not restore elements inside shadow DOM | Elements inside shadow roots are not restored when toggling off |
| 5 | `background.js:98` | `handler().then(sendResponse)` — if `handler()` throws, the Promise rejects silently and `sendResponse` is never called, leaving the message sender hanging | Error handling gap |

---

## How to Install (Development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `enable-all-extension/` folder
5. The extension icon appears in the toolbar

---

## How to Test

Open `test-page.html` in Chrome (with the extension loaded). It contains:

1. Disabled buttons (HTML `disabled` attribute)
2. Disabled inputs (text, checkbox, readonly)
3. Disabled select and textarea
4. ARIA disabled elements
5. CSS-blocked elements (`pointer-events: none`, `cursor: not-allowed`)
6. Dynamically added disabled buttons
7. Framework re-disabling simulation (re-disables every 2 seconds)
8. Drag & drop blocked scenarios:
   - `draggable="false"` images
   - CSS `-webkit-user-drag: none`
   - Drop zone with no `preventDefault` on dragover

---

## Permissions

| Permission | Why needed |
|---|---|
| `activeTab` | Access current tab URL and inject scripts |
| `scripting` | Execute content scripts via `chrome.scripting.executeScript` |
| `storage` | Store per-tab state in `chrome.storage.session` |

**No network requests. No external services. No persistent data after browser closes.**

---

## What's Next (Planned Fixes)

- Fix `allowEvent` undefined bug in `content-dragdrop.js`
- Fix live count update flow (background → popup)
- Optimize CSS scan in drag & drop script
- Extend `restoreAll()` to handle shadow DOM
- Add error handling in background message handler
