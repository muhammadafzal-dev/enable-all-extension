# Changelog

All notable changes to this project are documented here.

---

## [1.0.0] — 2026-03-25

### Added
- **Enable Buttons** — removes `disabled`, `readonly`, and pointer-blocking states from all interactive elements on any page, with live MutationObserver support
- **Enable Drag & Drop** — unblocks file drag & drop on sites that intercept and cancel drag events
- **Model Override** — intercepts ChatGPT API requests and replaces the `model` field in the payload with a user-selected model
  - Dropdown with GPT-5, GPT-4, and other model slugs
  - Live model switching without toggling off
  - State persists across popup close/reopen
- Per-tab state management via `chrome.storage.session`
- Anti-detection measures in `buttons.js` (Symbol guards, random attribute prefixes, IIFE scope)
- Organised folder structure: `popup/`, `background/`, `content/`, `docs/`
