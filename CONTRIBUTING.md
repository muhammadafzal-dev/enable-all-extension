# Contributing

Contributions are welcome. Please follow the guidelines below.

---

## Getting Started

1. Fork the repository
2. Clone your fork
   ```bash
   git clone https://github.com/YOUR_USERNAME/enable-all-extension.git
   ```
3. Load the extension in Chrome
   - Go to `chrome://extensions`
   - Enable **Developer Mode**
   - Click **Load unpacked** → select the `enable-all-extension` folder
4. Make your changes — Chrome auto-reloads most changes, but click the refresh icon on `chrome://extensions` after editing `background.js` or `manifest.json`

---

## Project Structure

```
popup/       — UI layer (HTML, CSS, JS)
background/  — Service worker, state management, script injection
content/     — Scripts injected into pages
docs/        — Technical documentation
```

---

## Guidelines

- **One feature per PR** — keep changes focused and reviewable
- **No new permissions** without a clear justification
- **Test on ChatGPT** for model override changes, and on a few different sites for buttons/drag & drop
- Follow the existing code style — no external dependencies, vanilla JS only
- Update `CHANGELOG.md` with what you added or changed

---

## Reporting Issues

Open a GitHub Issue with:
- What you expected to happen
- What actually happened
- The website URL (if site-specific)
- Chrome version and OS
