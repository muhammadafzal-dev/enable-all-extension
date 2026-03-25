# ChatGPT File Upload via Drag & Drop — Implementation Guide

> **Status:** Partially implemented, reverted for later. Upload pipeline works correctly.
> The remaining open question is the exact conversation payload injection format.

---

## What We're Building

When the user enables "Enable Drag & Drop" on ChatGPT and drops a file, instead of the page
ignoring or blocking the drop, our extension:

1. Intercepts the dropped file
2. Uploads it to ChatGPT's file API (same pipeline as native uploads)
3. Caches the file reference
4. Injects it into the next conversation request payload so the model can read it

---

## Reverse-Engineered API Flow

All 3 steps must complete **in order** before the file can be used in a message.

### Step 1 — Register File (POST /backend-api/files)

```
POST https://chatgpt.com/backend-api/files
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**
```json
{
  "file_name": "CONTRIBUTING.md",
  "file_size": 1345,
  "use_case": "my_files",
  "timezone_offset_min": -300,
  "reset_rate_limits": false
}
```

**Response:**
```json
{
  "status": "success",
  "upload_url": "https://sdmntpraustralieast.oaiusercontent.com/files/...",
  "file_id": "file_000000000c0471faab828ca7299c52a6"
}
```

`upload_url` is a pre-signed Azure Blob Storage URL (expires quickly — use immediately).

---

### Step 2 — Upload Bytes to Azure (PUT <upload_url>)

```
PUT <upload_url from step 1>
Content-Type: <file.type or application/octet-stream>
x-ms-blob-type: BlockBlob          ← REQUIRED by Azure, will 400 without it
```

**Body:** raw file bytes

**Expected response:** `201 Created` (empty body)

---

### Step 3 — Process/Index the File (POST /backend-api/files/process_upload_stream)

This is **mandatory**. Without it, the file is uploaded to Azure but ChatGPT's backend never
indexes it, so the model can't read the content — it shows as "expired" or "unavailable".

```
POST https://chatgpt.com/backend-api/files/process_upload_stream
Authorization: Bearer <token>
Content-Type: application/json
Accept: text/event-stream
```

**Request body:**
```json
{
  "file_id": "file_000000000c0471faab828ca7299c52a6",
  "use_case": "my_files",
  "index_for_retrieval": true,
  "file_name": "CONTRIBUTING.md"
}
```

**Response:** SSE stream (Server-Sent Events). Must be consumed until the stream closes.
The stream takes ~3 seconds for small files. Each `data:` line is a JSON event.
Parse events to extract `file_token_size` or `token_count` if present.

**Timing observed (from ChatGPT analytics):**
- Blob Store Upload Completed → Process Upload Stream Started: ~1ms
- Process Upload Stream Started → Completed: ~3 seconds

---

## Auth Token Capture

The extension has no direct access to the auth token. It's captured by wrapping `window.fetch`
in the MAIN world and reading the `Authorization` header from every outgoing request.

```js
window.__eabOriginalFetch = window.fetch;  // save true original for our own API calls
const _origFetch = window.fetch;           // closure copy — survives later deletion

window.fetch = async function(input, init) {
  // read Authorization from init.headers (plain object or Headers instance)
  // read from input.headers if input is a Request object
  // store in _token
  return _origFetch.call(this, input, init);
};
```

**Important:** Use the captured `_rawFetch` (true original) for our own API calls.
Never use `window.fetch` for our API calls — it would go through our own wrapper infinitely.

**When to send first message:** The user must send at least one chat message before dropping
a file, because tokens are captured from outgoing requests. The extension shows an error toast
if no token has been captured yet.

---

## Fetch Wrapper Chain

Two scripts wrap `window.fetch`. Order depends on which is injected first:

```
window.fetch (outermost wrapper)
  └─ dragdrop-upload-main.js wrapper     → captures token, injects attachment
       └─ model-override-main.js wrapper → replaces model field
            └─ _origFetch (true browser fetch)
```

Each wrapper captures `_prevFetch = window.fetch` at injection time (closure),
so the chain always calls through correctly regardless of injection order.

**Key guard:** `window.__eabDragUploadActive` prevents double injection.

---

## Conversation Payload Injection

When the user sends a message and a file is pending, we intercept the request to
`/backend-api/f/conversation` and modify the payload.

### Target URL pattern
```
/backend-api/f/conversation
```

### Injection approach (TWO places in the message object)

**A. Content parts — what the model actually reads:**

```json
{
  "content": {
    "content_type": "multimodal_text",
    "parts": [
      {
        "content_type": "file_attachment",
        "asset_pointer": "file-service://file_000000000c0471faab828ca7299c52a6",
        "size_bytes": 1345,
        "width": null,
        "height": null,
        "fovea": null,
        "metadata": {
          "dalle": null,
          "gizmo": null,
          "sanitized": true,
          "asset_pointer_link": null
        }
      },
      "user message text here"
    ]
  }
}
```

- Change `content_type` from `"text"` to `"multimodal_text"`
- Prepend the file part before the existing text parts
- `asset_pointer` format: `"file-service://<file_id>"`
- The `metadata` sub-object shape must match exactly (null fields included)

**B. Metadata attachments — for the UI file badge:**

```json
{
  "metadata": {
    "attachments": [
      {
        "name": "CONTRIBUTING.md",
        "id": "file_000000000c0471faab828ca7299c52a6",
        "size": 1345,
        "mimeType": "text/markdown"
      }
    ]
  }
}
```

Note: field is `mimeType` (camelCase), not `mime_type`.

### ⚠️ Open Issue

Despite implementing both injections above, the model still reports "file expired/unavailable".
The upload pipeline (Steps 1–3) is confirmed working. The conversation injection format
may still have a field mismatch, or there could be a timing issue where the file is referenced
before ChatGPT's backend has fully indexed it.

**Debugging approach for next session:**
1. Enable the feature, drop a file, send a message
2. In DevTools → Network → find the `/backend-api/f/conversation` request
3. Copy the full request payload
4. Compare the `content.parts[0]` structure and `metadata.attachments[0]` structure
   against a native ChatGPT upload (upload via the normal paperclip button first to capture
   the native payload shape, then compare with our injected payload)

---

## MAIN World vs ISOLATED World

Two separate script contexts are used:

| Script | World | Why |
|---|---|---|
| `dragdrop-upload-main.js` | MAIN | Must access `window.fetch` to wrap it. CSP blocks ISOLATED scripts from doing this. |
| `dragdrop.js` | ISOLATED (default) | MutationObserver, attribute fixes, `chrome.runtime` access. |

Cross-world communication uses custom `window.dispatchEvent` / `window.addEventListener`:

```
MAIN world                         ISOLATED world
dragdrop-upload-main.js  ──────→  dragdrop.js
  window.dispatchEvent              window.addEventListener
  ('__eab_file_ready', detail)      → chrome.runtime.sendMessage
  ('__eab_file_cleared')            → chrome.runtime.sendMessage
```

---

## Pending File State

After successful upload (all 3 steps complete), the file reference is stored in a closure
variable `_pendingAttachment`:

```js
_pendingAttachment = {
  id:              "file_000...",
  size:            1345,
  name:            "CONTRIBUTING.md",
  mime_type:       "text/markdown",
  file_token_size: 0,              // from process_upload_stream SSE response
  source:          "local",
  is_big_paste:    false,
};
```

This is consumed (set to null) immediately when injected into a conversation payload.
Only one file can be pending at a time — dropping a new file replaces any existing pending file.

---

## Popup UI — Pending File Indicator (reverted, implement later)

When a file is cached and waiting to be sent, show an indicator in the popup:

```
┌──────────────────────────────────────────┐
│  📄  CONTRIBUTING.md                  ✕  │   ← green bar, below header
└──────────────────────────────────────────┘
```

**Files to modify:**
- `popup/popup.html` — add `<div id="file-indicator">` between header and cards
- `popup/popup.css` — add `.file-indicator` styles (green border, truncate long names)
- `popup/popup.js` — show/hide on `fileReady`/`fileCleared` messages; delete button sends `clearPendingFile`
- `content/dragdrop.js` — listen to `__eab_file_ready` / `__eab_file_cleared` window events, relay to background
- `background/background.js` — handle `fileReady`, `fileCleared`, `clearPendingFile` messages; store `pendingFile` in session storage; forward to popup

**Cross-context message flow:**
```
MAIN world                ISOLATED world          Background            Popup
dragdrop-upload-main  →  dragdrop.js          →  background.js     →  popup.js
  dispatchEvent            sendMessage             store + forward      show indicator
  __eab_file_ready         { action:'fileReady' }  pendingFile in       fileIndicator.show
                                                    session storage
```

---

## Files Involved

| File | World | Role |
|---|---|---|
| `content/dragdrop-upload-main.js` | MAIN | Token capture, file upload API calls, fetch wrapping, attachment injection |
| `content/dragdrop-upload-stop.js` | MAIN | Calls `window.__eabSetDragUpload(false)` to restore fetch and clear state |
| `content/dragdrop.js` | ISOLATED | Drag event capture, DOM fixes, MutationObserver, window event relay |
| `background/background.js` | Service Worker | Injects scripts, stores state, relays messages |
| `popup/popup.js` | Popup | UI state, toggle handlers, file indicator |

---

## Analytics Events (for reference only — do NOT need to replicate)

ChatGPT sends these to `/ces/v1/t` (Segment analytics) during a native upload.
They are **purely telemetry** and have no effect on file processing or accessibility.

| Order | Event | When |
|---|---|---|
| 1 | Upload File | Drag detected |
| 2 | Upload File Initiated | Upload starts |
| 3 | Create File Entry Started | POST /backend-api/files sent |
| 4 | Create File Entry Completed | file_id received |
| 5 | Blob Store Upload Started | PUT to Azure starts |
| 6 | Blob Store Upload Completed | PUT 201 received |
| 7 | Process Upload Stream Started | POST /process_upload_stream sent |
| 8 | Process Upload Stream Completed | SSE stream closed |
| 9 | Upload File Completed | status: "uploading" |

The `status: "uploading"` on event 9 appears to be a UI state label, not an error.

---

## Extension Reload Gotcha

After editing `dragdrop-upload-main.js`:

1. Go to `chrome://extensions` → click Reload on the extension
2. **Also toggle the Drag & Drop feature OFF then ON** in the popup
   (or refresh the ChatGPT tab)

The MAIN world script is injected dynamically. Simply reloading the extension does not
re-inject it into existing tabs — the old version keeps running until the script is
re-injected via background.js.
