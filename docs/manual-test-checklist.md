# Manual test checklist

DOM behavior, export contents, and theme switching are verified by loading the extension in Microsoft Edge DevTools. Run the relevant section before releasing a change that touches it. The general checklist in [.github/copilot-instructions.md](../.github/copilot-instructions.md#66-手動テストチェックリスト) applies in addition to the sections below.

Automated coverage lives in [tests/](../tests); see the test table in the [README](../README.md#tests).

## Guided local sample

- [ ] `Explore sample capture` appears only when there are zero requests, and stays readable at 320 / 375 / 414 / 768 px without scrolling the toolbar horizontally.
- [ ] The action is reachable by keyboard, with a working focus ring, <kbd>Enter</kbd> / <kbd>Space</kbd> activation, and a screen-reader description.
- [ ] Toggling Pause / Resume with zero requests keeps the empty-state heading and description in sync, and the status bar stays a single horizontally scrollable line at narrow widths.
- [ ] After starting the sample, exactly one 200 API request, one slow 503, and one 304 asset on `.test` domains are shown, with focus on the first row and its details open.
- [ ] The startup status, the persistent `Local sample · live paused`, and `Exit · restore prior recording state` state clearly that the data is local and synthetic, that no network traffic was sent, that live recording is paused, and how to return to the recording state and column filters from before the sample.
- [ ] `Sample guide` appears only during the local sample — never during normal capture, on the pre-traffic empty state, or when real requests are filtered down to zero.
- [ ] The exit action in the status bar and in the guide appears only for the complete set of three known samples, and stays hidden or disabled (fail closed) for normal capture, import, partial deletion, signature mismatch, and rows that are no longer retained.
- [ ] When the guide is opened, only the four questions ("which request failed", "which timing phase dominates", "which retry hint", "what browser timing cannot prove") are announced; no answer value or navigation action exists in the DOM, the accessibility tree, the focus order, or on screen.
- [ ] Only after `Reveal evidence` are `POST /v1/orders/preview`, `HTTP 503`, the `2,450 ms` total, the dominant `Wait (TTFB) · 2,200 ms`, `Retry-After: 30 seconds`, the limitation that browser timing does not prove a server-side root cause, and the two navigation actions generated.
- [ ] Running `Inspect Timing evidence` by keyboard or touch closes the guide without returning focus to the trigger, selects and shows the failing sample row, activates the Response `Timing` tab, focuses that tab, and reports the dominant phase in the status.
- [ ] Running `Inspect Retry-After header` by keyboard or touch activates and focuses the Response `Headers` tab for the same failing row and reports the retry value in the status without duplicating raw traffic.
- [ ] If a column filter applied during the sample hides the target row, only the rule that rejects it is released, with the reason reported; keyword search, other rules, and the filters saved from before the sample are left unchanged, and the saved filters are restored when the sample ends.
- [ ] If the failing row was deleted or dropped by the retention limit, the guide stays open and reports that the action is unavailable without changing filters, selection, or real traffic; it never navigates to normal or imported data, or to look-alike data outside `.test`.
- [ ] After `Clear`, Undo, or an explicit sample exit, the guide returns to its closed, un-revealed state and stores no attempt or navigation state.
- [ ] At 320 / 375 / 414 / 768 px in Light and Dark, the prompt, reveal, two navigation actions, exit action, and Close all keep a 24 px minimum target size with no horizontal scrolling of the document root, no truncated text, and no off-screen dialog. <kbd>Esc</kbd> / Close / backdrop return focus to the trigger; after reveal focus lands on the evidence heading, after navigation on the activated Response tab, and after exit on the regenerated empty-state action.
- [ ] The sample's body, headers, timing, statistics, keyword search, and sanitized HAR all work and contain no customer data or secret-shaped values.
- [ ] If real traffic arrives before the empty state is dismissed, no sample is added and nothing is mixed into the existing rows.
- [ ] After `Delete Selected` / `Keep Selected` leaves only part of the sample, the remaining sample count in the status is updated, the explicit exit action disappears, and deleting all of them leaves sample mode.
- [ ] Starting the sample temporarily saves existing column filters so all three rows are visible, and an explicit exit, deleting all rows, or an import restores the original filters and counts. `Clear` still resets filters to their defaults as before.
- [ ] An explicit exit keeps the search terms but recalculates matches to zero, releases the sample selection, details, comparison, and highlights, and creates no Clear Undo snapshot. If recording was paused before the sample it stays paused; if it was recording it returns to live recording.
- [ ] After `Clear`, all three rows and their details, search, and statistics are gone, focus returns to `Clear`, and `Undo clear` appears in the status bar for 10 seconds only.
- [ ] `Undo clear` can be run exactly once by keyboard and restores the three samples, details, filters, search terms and scope, selection and highlights, sort order, the original recording state, and a predictable row focus. If live traffic arrived first the sample is not restored, and a normal Clear restores while keeping new traffic within the retention limit.
- [ ] In System / Dark / Light, the default, hover, active, focus, and disabled states of the action are all distinguishable.

## Search and detail-pane search

- [ ] In the dark theme, rows matching a search keyword are clearly distinguishable at a glance for every keyword color via their tint alone (no outline). Selecting any row — hit or not — draws a 2px accent outline around it that reads instantly as selection. The ID column shows no K-badge, while screen readers still announce "Matches search keyword N".
- [ ] During live capture with a body-scope keyword active, the top bar shows only the match count; "N bodies not searched" and "Showing matches only" appear inside the search panel's notice area and no top-bar button shifts or flickers as bodies load.
- [ ] `Matches only` in the search panel hides non-matching rows, updates the visible count and status line, and pressing it again restores all rows with highlights intact. With no active keyword the toggle changes nothing.
- [ ] With `Matches only` on, a sanitized HAR export contains exactly the displayed rows.
- [ ] `Matches only` survives `Clear` → `Undo clear` together with the search terms and scope.
- [ ] The Request/Response `Body` and `Raw` views each show their own search field as a bar pinned flush to the bottom of the pane (no gap below it, whether the content scrolls or not); typing highlights hits with a counter, Enter / Shift+Enter and the ▲▼ buttons cycle through hits (wrapping), and jumping to a hit inside a collapsed JSON-tree node expands it.
- [ ] The in-pane query is kept when switching rows or tabs and re-applies to the new content; Escape clears the field without closing the panel.
- [ ] Searching a JSON body with more than 100 array items or a preview truncated at 2,000 characters reports "(+N collapsed)" when hits are hidden, and `Expand all` opens the truncated content and includes those hits in the count and navigation.
- [ ] An HTML response with no `charset` in its `Content-Type` header but a `<meta charset=...>` declaration (e.g. Shift_JIS) renders readable text in Body, Preview, and Raw.
- [ ] Rows highlighted from the context menu (★) show the same tint treatment as search hits in both themes, and the selection outline stays visible on top of them.
- [ ] During live capture the top-bar match counter changes number without moving the trash, import, or export buttons, and the `Aa` / `\b` / `.*` segmented group sits beside `Scope` without crowding the `Matches only` switch.
- [ ] The `Aa` / `\b` / `.*` match options change the request-list matches, the cell marks, and the in-pane search identically; an invalid regular expression turns the input red with the error in its tooltip and matches nothing.
- [ ] Scope, match options, and Matches only survive closing and reopening DevTools; search keyword text does not.
- [ ] <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd> focuses the pane search field when focus is inside a Body/Raw view, and toggles the request search panel elsewhere.
- [ ] A response declaring `Content-Type: text/html; charset=Shift_JIS` (or another non-UTF-8 charset) renders readable text — not mojibake — in the Body, Preview, and Raw views, including after a SAZ import.

## Toolbar popups and the status bar

- [ ] The `Columns` menu ends with a `Preset` section: `Update` saves the current columns + filters, `Apply` restores them (or the default view before anything is saved), `Forget saved preset` removes the saved state, and `Filters (N)` reflects the applied rules.
- [ ] The `Filters` popup opens with every column section expanded; Method / Status / URL rules read as single rows without stray wrapping, and a section header click collapses and re-expands it.
- [ ] The `Filters` popup lists every filterable column as a collapsed row; clicking a row expands only that column's rule editor, editing a rule shows an `Active` chip and updates the header count live, and reopening the popup keeps active columns expanded.
- [ ] The status bar shows only `Retention <limit> · cache <n>/<max>`, the status chips, `avg <t>`, the transferred size, and `N / M requests` (plus `· K active column filter(s)` only when K > 0); hovering retention, latency, and size reveals the full details in tooltips.

## Keyboard

- [ ] <kbd>Enter</kbd> / <kbd>Space</kbd> on a header keeps `aria-sort` and the displayed order in sync, and focus returns to the same header after <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd>.
- [ ] Column, main-split, and Request/Response-split dividers can all be resized with the arrow keys and never drop below their minimum size.
- [ ] Row navigation with the arrow keys, <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>C</kbd>, multiple selection, and the `ContextMenu` / <kbd>Shift</kbd>+<kbd>F10</kbd> menu all work and restore focus correctly.
- [ ] After <kbd>Ctrl</kbd>/<kbd>⌘</kbd>-clicking exactly two rows, `Compare 2 selected requests` appears in the context menu.
- [ ] The comparison view correctly shows the URL, query parameter, method/status, request/response header, and body sections.
- [ ] In the comparison view's body section, omitted, evicted, and not-yet-fetched bodies are shown with the appropriate state label.
- [ ] Clicking the ✕ button closes the comparison view and returns to the normal detail panel.
- [ ] Single-clicking a different row while the comparison view is open closes it and switches to that row's details.
- [ ] Normal Summary / URL / Body / Raw / cURL / fetch / PowerShell copies are labeled sanitized, and a full copy reaches the clipboard only after the warning is confirmed.
- [ ] The sanitized HAR and full HAR in the export dialog use different file names, and the full HAR confirmation does not carry over to the next action.
- [ ] Filter / Columns / Scope / Color can be opened and closed by keyboard, with correct initial focus, <kbd>Esc</kbd> handling, and clamping at the viewport edge.

## High-volume capture and incremental rendering

- [ ] With no sort or an ascending ID sort and no filters or search, generate heavy traffic and confirm existing DOM rows are preserved while only new rows are appended per frame.
- [ ] With a descending ID sort, a sort on another column, a column filter, or a search keyword active, new traffic keeps the correct order, visibility, and search badges.
- [ ] Changing the sort or filter while a new-traffic frame is pending produces no duplicate rows and no stale search state.
- [ ] Normal clicks, arrow keys, and <kbd>Ctrl</kbd>/<kbd>⌘</kbd> toggles preserve DOM order, focus, details, and the selected count and size.
- [ ] Auto-scroll happens only while at the bottom; after scrolling up manually, new traffic does not move the position.
- [ ] Immediately after Clear, a HAR/SAZ import, a Columns change, or Keep/Delete Selected, the counts, transfer sizes, and row IDs all agree.
- [ ] The phase guide in the Response `Timing` tab opens and closes with <kbd>Enter</kbd> / <kbd>Space</kbd>, and Blocked / DNS / Connect (TLS excluded) / TLS / Send / Wait (TTFB) / Receive plus the observability limitation are readable at 320 / 375 / 414 / 768 px.
