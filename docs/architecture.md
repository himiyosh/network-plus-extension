# Architecture

Implementation notes for Network+ for DevTools. The [README](../README.md) covers what the panel does; this document covers how it behaves under load and why the structure is shaped the way it is.

## Composition

```
Microsoft Edge DevTools
└── devtools.html          registers the panel via chrome.devtools.panels.create()
    └── panel.html         panel UI (toolbar, table, detail sidebar, status bar)
        ├── panel.js       all logic (single IIFE, 15 sections)
        └── panel.css      System / Dark / Light themes via CSS custom properties
```

- **DevTools panel extension.** Requests are captured through `chrome.devtools.network.onRequestFinished` (the `chrome.*` namespace of the Edge extension API).
- **No ES modules.** DevTools panel pages do not support `<script type="module">`, so the panel uses a single-file IIFE. This is a platform constraint; `import` / `export` cannot be introduced without a bundler, and the project deliberately has none.
- **Buildless.** Files are loaded into Edge exactly as they are checked in. `npm run extension:package` archives an explicit allowlist of 10 runtime files without transforming code.

## Rendering pipeline

- When there is no sort (or an ascending sort by ID) and no column filter or search keyword is active, newly captured rows are appended once per `requestAnimationFrame` in a `DocumentFragment`. Existing rows are not re-created.
- The conditions are re-checked when the frame commits. If the sort, filter, or search state changed in the meantime, rendering falls back to a full, safe redraw. Row IDs prevent duplicates when another render finished first.
- Normal selection, arrow-key selection, and <kbd>Ctrl</kbd>/<kbd>⌘</kbd> toggling replace only the affected rows. Operations that affect many rows, such as range selection or deletion, use the full redraw path.

## Retention and the body cache

- Request rows default to the newest 5,000. Live capture, HAR import, and SAZ import share the same retention decision, and row IDs stay monotonically increasing across deletion, `Clear`, and import.
- `Clear` resets the display and working state immediately, and for 10 seconds the status bar offers **Undo clear** to restore rows, filters, search, selection, details, sort order, and recording state. Held rows still count against the request limit and the 32 MiB body cache; if new traffic reaches a limit, the oldest held rows are released first.
- When a limit is exceeded, the oldest rows are removed as a batch, and filter results, focus, single and multiple selection, search matches, pending incremental renders, DOM rows, the detail pane, and statistics are reconciled at the same time.
- The response body cache holds 1 MiB per body and 32 MiB in total. At the total limit, the least recently accessed bodies are evicted while their rows are kept.
- Bodies larger than 1 MiB are omitted rather than stored partially. Detail views, search, and HAR never present omitted, evicted, or unavailable bodies as complete data.
- An evicted body can be fetched again when the detail view is opened, as long as the DevTools source is still available. HAR export fetches bodies one at a time so it does not restore the shared cache without bound.
- The status bar continuously shows the active retention policy, body cache usage, and the cumulative counts of evicted rows, omitted bodies, evicted bodies, and omitted previews.
- If stored settings are invalid or cannot be read or written, Network+ falls back to defaults and reports the reason in the retention or operation status.

These are limits on request rows, import staging, and the shared response-body cache. They are not an absolute memory ceiling for the extension as a whole, which also holds each retained row's URL, headers, `requestPostData`, and DevTools request object.

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
