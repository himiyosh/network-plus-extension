# Architecture

Implementation notes for Network+ for DevTools. The [README](../README.md) covers what the panel does; this document covers how it behaves under load and why the structure is shaped the way it is.

## Composition

```
Microsoft Edge DevTools
└── devtools.html          registers the panel via chrome.devtools.panels.create()
    └── panel.html         panel UI (toolbar, table, detail sidebar, status bar, dialogs)
        ├── panel.js       all logic (single IIFE, 17 numbered sections)
        ├── panel.css      System / Dark / Light themes via CSS custom properties
        └── vendor/fflate.js  vendored zip codec for SAZ import and packaging (sha256-pinned)
background.js              single-job service worker: minimizes the undocked
                           DevTools window when the pop-out mirror tab opens
```

- **DevTools panel extension.** Requests are captured through `chrome.devtools.network.onRequestFinished` (the `chrome.*` namespace of the Edge extension API).
- **No ES modules.** DevTools panel pages do not support `<script type="module">`, so the panel uses a single-file IIFE. This is a platform constraint; `import` / `export` cannot be introduced without a bundler, and the project deliberately has none.
- **Buildless.** Files are loaded into Edge exactly as they are checked in. `npm run extension:package` archives an explicit allowlist of 11 runtime files without transforming code.

## Rendering pipeline

- When there is no sort (or an ascending sort by ID) and no column filter or search keyword is active, newly captured rows are appended once per `requestAnimationFrame` in a `DocumentFragment`. Existing rows are not re-created.
- The conditions are re-checked when the frame commits. If the sort, filter, or search state changed in the meantime, rendering falls back to a full, safe redraw. Row IDs prevent duplicates when another render finished first.
- Normal selection, arrow-key selection, and <kbd>Ctrl</kbd>/<kbd>⌘</kbd> toggling replace only the affected rows. Operations that affect many rows, such as range selection or deletion, use the full redraw path.

## Retention and the body cache

- Request rows default to the newest 20,000 (configurable from 100 to 100,000 in the Settings dialog). Live capture, HAR import, and SAZ import share the same retention decision, and row IDs stay monotonically increasing across deletion, `Clear`, and import.
- `Clear` resets the display and working state immediately, and for 10 seconds the status bar offers **Undo clear** to restore rows, filters, search, selection, details, sort order, and recording state. Held rows still count against the request limit and the 32 MiB body cache; if new traffic reaches a limit, the oldest held rows are released first.
- When a limit is exceeded, the oldest rows are removed as a batch, and filter results, focus, single and multiple selection, search matches, pending incremental renders, DOM rows, the detail pane, and statistics are reconciled at the same time.
- The response body cache holds 1 MiB per body and 32 MiB in total. At the total limit, the least recently accessed bodies are evicted while their rows are kept.
- Bodies larger than 1 MiB are omitted rather than stored partially. Detail views, search, and HAR never present omitted, evicted, or unavailable bodies as complete data.
- Base64 bodies are decoded with the charset declared by the response's `Content-Type` header (unknown labels fall back to UTF-8), and SAZ imports split header from body at byte level before decoding, so non-UTF-8 bodies render without mojibake.
- An evicted body can be fetched again when the detail view is opened, as long as the DevTools source is still available. HAR export resolves missing bodies through a small fixed worker pool (four, matching the prefetch background budget), so a large uncached export neither serializes thousands of round-trips nor spikes in-flight body memory without bound.
- The status bar continuously shows body cache usage; the active retention policy and the cumulative counts of evicted rows, omitted bodies, evicted bodies, and omitted previews live in its tooltip, and the limit itself is edited in the Settings dialog.
- If stored settings are invalid or cannot be read or written, Network+ falls back to defaults and reports the reason in the retention or operation status.

These are limits on request rows, import staging, and the shared response-body cache. They are not an absolute memory ceiling for the extension as a whole, which also holds each retained row's URL, headers, `requestPostData`, and DevTools request object.

## Pop-out mirror

- The 🪟 button opens `panel.html?view=window&src=<tabId>` as a normal browser tab. The DevTools panel (host) connects to it over a `chrome.runtime` port named `networkplus-mirror:<tabId>`; the tab (viewer) only listens.
- Protocol v2: rows stream as they are captured, a one-second sync heartbeat carries row count, max id, and a control payload (paused, retention, undo availability, stream-capture state, minimize outcome); any count/id mismatch makes the viewer request a full chunked snapshot. Response bodies travel only on demand.
- The viewer's toolbar is a remote control: a document-level capture listener turns its buttons into commands (pause, clear, undo, retention, stream toggle, resend), import files travel as bounded base64 chunks (64 MiB cap, declared-size enforced during accumulation), and the host executes every command through its own controls so guards and undo snapshots behave like local clicks. Commands time out (30 s; import results 120 s) rather than hanging.
- A mirror tab that outlives its DevTools session is adopted back: the reopened host briefly probes the port at startup and a surviving tab resyncs instead of stranding; clicking 🪟 while adopted points at the existing tab. Theme and language changes propagate live between both pages via `chrome.storage.onChanged`.
- The background worker's only job is asking `chrome.windows` (permissionless) to minimize an undocked DevTools window when the pop-out opens; a docked session stays put and the viewer explains the one-time undock in a dialog.

## Settings and language

- The 🎛️ Settings dialog gathers language, theme, and capture retention. The language preference (`networkPlus.lang`) localizes explanatory text only through a `data-i18n` dictionary (`UI_TEXT`); control labels stay English by design. Both preferences persist through `chrome.storage.local` with a localStorage fallback.

## Import validation

- Import accepts `.har` and Fiddler SAZ (`.saz`) only. Input files are limited to 32 MiB; SAZ archives to 20,000 entries, 4 MiB per expanded entry, and 64 MiB expanded in total.
- SAZ treats only `raw/<number>_[csm].(txt|xml)` as a candidate, and an HTTP session requires a complete `_c.txt` and `_s.txt` pair.
- HAR validates the `log.entries` array and every request and response object, normalizing strings, headers, and post data into safe types. In bounded mode, only the final retained range is turned into row objects.
- SAZ uses fflate streaming inflation, which is compatible with the extension CSP, yielding to the event loop every 16 KiB input chunk and at most every 4 entries. Limits are checked per entry, and only complete retained sessions become rows.
- Import is atomic: the current capture is replaced only after staging succeeds. Malformed input, JSON or HTTP parse failures, unsupported compression, exceeded limits, and inflation failures all leave existing rows, selection, recording state, and the detail view untouched. The import control is disabled while an import runs, and the same file can be selected again afterward.

## Outbound data safety

The clipboard and HAR downloads are the only outbound surfaces, and sanitized output is always the default. A confirmed full output applies to that one action and is never saved as a setting or default. The full policy — URL, header, cookie, and body handling, fail-closed behavior, and the `Copy safe support summary` allowlist — is documented in [privacy.md](privacy.md) and summarized in the [README](../README.md#data-safety).

## UI stability rules

- Switching between `Recording` and `Paused` must not cause a layout jump: the toolbar indicator always reserves its height. Implementation rule — `.topbar` always carries a `border-top` (transparent is fine) and only its color changes while recording.
- In a narrow DevTools window, only the toolbar scrolls horizontally, so the table and detail panel keep their horizontal position.
- At 700 px and below, the request list stacks above the detail panel, and the main divider switches its orientation, cursor, and ARIA role to a horizontal separator.
- Filter, column, context, search-scope, and search-color popups stay at least 8 px away from the viewport edge and scroll internally instead of overflowing it.
