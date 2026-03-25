# Enable All — Chrome Extension

A developer utility Chrome extension that unlocks disabled UI elements, enables file drag & drop on any website, and overrides the AI model used in API requests.

---

## Features

### 1. Enable Buttons
Removes `disabled`, `readonly`, and pointer-blocking CSS from all buttons, inputs, textareas, and selects on the page. Uses a MutationObserver to catch dynamically added elements too.

### 2. Enable Drag & Drop
Unblocks file drag & drop on sites that prevent it. Uses capture-phase event interception to override `dragover`, `drop`, and related handlers so files land where you drop them.

### 3. Model Override
Intercepts outgoing `fetch` calls to `/backend-api/f/conversation` (ChatGPT) and replaces the `model` field in the request payload with your selected model.

**Available models (pre-loaded):**
- GPT-5: `gpt-5-3`, `gpt-5-4-pro`, `gpt-5-2`, `gpt-5-1`, `gpt-5`, `gpt-5-mini`, `gpt-5-t-mini`, `gpt-5-4-t-mini`
- GPT-4: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4`
- Other: `o1`, `o1-mini`, `o3-mini`, `research`, `auto`

---

## Installation

> Not published on the Chrome Web Store. Install manually via Developer Mode.

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer Mode** using the toggle in the top-right corner
4. Click **Load unpacked**
5. Select the `enable-all-extension` folder
6. The extension icon will appear in your Chrome toolbar

---

## How to Use

### Enable Buttons
1. Go to any website with disabled/locked buttons or inputs
2. Click the extension icon in the toolbar
3. Toggle **Enable Buttons** ON
4. All disabled, readonly, and blocked elements on the page are unlocked immediately
5. The counter in the popup shows how many elements were fixed
6. Toggle OFF to restore original states

### Enable Drag & Drop
1. Go to any website that blocks file drag & drop (e.g. ChatGPT)
2. Click the extension icon
3. Toggle **Enable Drag & Drop** ON
4. Drag and drop files anywhere on the page normally
5. Toggle OFF to restore original drag & drop restrictions

### Model Override
1. Go to [chatgpt.com](https://chatgpt.com)
2. Click the extension icon
3. Select a model from the dropdown (e.g. `gpt-5-3`, `gpt-4o`, `auto`)
4. Toggle **Model Override** ON
5. Send any message — the selected model will be used for that request
6. You can change the model from the dropdown at any time, even while the toggle is ON — it takes effect on the next message
7. Toggle OFF to stop overriding and let ChatGPT use its default model

> **Note:** State is saved per tab. If you close and reopen the popup, all toggles will be in the same state as you left them. State clears when the browser is closed.

---

## Is Developer Mode Risky?

**Short answer: No, not for your own extensions.**

Developer Mode is a built-in Chrome feature designed for developers. Here is what it does and does not do:

| | Details |
|---|---|
| **What it enables** | Load unpacked extensions from your local machine |
| **Risk to your browser** | None — it is just a setting |
| **Risk to your data** | None from enabling Developer Mode itself |
| **The actual risk** | Installing a malicious unpacked extension from an untrusted source |

As long as you only load extensions you wrote yourself or fully trust, Developer Mode is completely safe.

Chrome shows a warning banner ("Developer mode extensions are enabled") — this is just a reminder, not an error.

**Does it slow down Chrome?**

No. Developer Mode itself adds zero performance overhead. Having more extensions installed (regardless of Developer Mode) can slightly increase memory usage, but a single small extension like this one has no noticeable impact on browser speed.

---

## File Structure

```
enable-all-extension/
├── manifest.json              # MV3 manifest — extension entry point
├── README.md
├── icons/                     # Extension icons (16, 48, 128px PNG + SVG)
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.js               # Popup logic & state sync
│   └── popup.css              # Popup styles
├── background/
│   └── background.js          # Service worker — state manager & script injector
├── content/
│   ├── buttons.js             # Enable Buttons — injected into page (ISOLATED world)
│   ├── dragdrop.js            # Enable Drag & Drop — injected into page (ISOLATED world)
│   ├── model-override-main.js # Model Override — fetch interceptor (MAIN world)
│   └── model-override-stop.js # Model Override — restores original fetch (MAIN world)
└── docs/
    └── anti-detection.md      # Notes on anti-detection techniques used
```

---

## Permissions

| Permission | Why it is needed |
|------------|-----------------|
| `activeTab` | Access the currently active tab to inject scripts |
| `scripting` | Inject content scripts into pages when toggles are turned on |
| `storage` | Save toggle state per tab so it persists across popup open/close |

---

## Technical Notes

- Built with **Manifest V3**
- State stored in `chrome.storage.session` — automatically cleared when the browser closes
- Model override uses `world: 'MAIN'` script injection which bypasses page Content Security Policy (CSP)
- `buttons.js` is wrapped in an IIFE to avoid variable conflicts with other injected scripts
- Toggle state is written directly to `chrome.storage.session` from the popup (not via a background message) to eliminate race conditions when the popup closes immediately after a toggle
