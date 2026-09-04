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

## Pop-out mirror tab

- [ ] The 🪟 toolbar button appears only inside a DevTools session — never when `panel.html` is opened as a plain page — and its tooltip explains that the tab mirrors this DevTools session.
- [ ] Clicking it opens `panel.html?view=window` as a browser tab; existing rows appear via the snapshot, new requests stream in live, and the row count matches the panel within one second.
- [ ] Clicking again while the tab is open focuses the existing tab instead of opening a second one.
- [ ] In the tab, only 🪟 is hidden — every other toolbar control stays visible and drives the DevTools session remotely (see the remote-control items below) — the status line reports `Mirroring the DevTools session` (with `(recording paused)` while the panel is paused), and selecting a row loads its response body on demand from the DevTools side.
- [ ] Clear, Undo clear, an import, and retention evictions performed in the panel reach the tab within about a second (sync resync).
- [ ] Closing DevTools leaves the tab's rows in place with `The DevTools session disconnected; captured requests remain available.`, and a body that was never fetched reports its unavailability immediately instead of timing out. Reopening DevTools and the Network+ panel reconnects the same tab.
- [ ] If the browser blocks the pop-out, the status explains it and a second click after allowing pop-ups succeeds.

- [ ] With DevTools undocked into its own window, clicking 🪟 opens the mirror tab and minimizes the DevTools window automatically; capture continues (new page requests keep streaming into the tab) and the window restores normally from the taskbar.
- [ ] With DevTools docked, clicking 🪟 opens the mirror tab and the browser window does not minimize or move.
- [ ] In that docked case the mirror tab shows the "Keep DevTools open" dialog exactly once per load: it warns that closing DevTools stops capture and freezes the tab, and lists the undock steps. Plain "Got it" lets it return on the next pop-out; "Don't show this again" keeps it away for good. An undocked pop-out (window minimized) never shows it.
- [ ] In the mirror tab, pause/resume, Clear (and the Undo that then appears), the Settings dialog's Retention section (opens with the session's current values), and the Stream capture toggle all act on the DevTools session, and the tab's buttons match the session state within a second. Language and Theme in that same dialog act on the tab itself, not the DevTools session.
- [ ] Importing a HAR or SAZ from the mirror tab replaces the session's capture exactly like a DevTools-side import, and both windows show the imported rows; a file over 64 MiB is refused with a visible reason.
- [ ] `Resend unchanged` / `Edit and resend...` from the mirror tab execute in the DevTools session (status names the session) and the result row appears in both windows; while disconnected, every remote control reports a failure status instead of acting locally, and Send inside the resend dialog shows the failure in the dialog itself while keeping it open with the edited request.
- [ ] Closing DevTools and reopening it reattaches the surviving mirror tab automatically within a few seconds (DevTools status reports the reattach; the tab resyncs); clicking 🪟 while that tab is mirroring reports "already mirroring" instead of opening a duplicate, and reloading the mirror tab (F5) also reattaches on its own.
- [ ] The mirror tab's empty state never offers `Explore sample capture` (its description points at the DevTools session instead).
- [ ] Changing Theme or Language in the mirror tab applies to the DevTools panel within a moment without any reload, and vice versa.

## Quick filters, CSV export, and the pop-out shortcut

- [ ] Typing a header name (e.g. `x-request-id`) in the Columns menu's Header column field and choosing Apply reveals the column with that label showing per-row values (response headers win over request headers, case-insensitively); the column sorts and filters like any text column, the name survives a DevTools reopen, and clearing the field empties the column.

- [ ] A live-captured WebSocket conversation exports into the full HAR as `_webSocketMessages` (readable back by Network+ and Chrome DevTools); binary frames appear as opcode 2 without data and the entry declares the counts; the sanitized HAR omits the frames and carries `webSocketFramesOmitted` on the entry; SSE rows never gain the key.

- [ ] Right-clicking a row offers `Only domain <domain>` and `Exclude domain <domain>`; "Only" narrows the grid to that domain (a second "Only" on another row replaces it instead of intersecting to zero rows), "Exclude" hides it and accumulates, and both appear as editable conditions in the Filters popup, whose badge counts them and whose Clear removes them.
- [ ] The export dialog's `Export sanitized CSV` downloads a `.csv` honoring the displayed/selected scope choice with numeric duration and size columns and redacted URLs — no header or body values anywhere in the file; opening it in a spreadsheet shows one row per request.
- [ ] <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> opens (or focuses) the mirror tab inside a DevTools session, does nothing in the mirror tab itself, and the binding is listed in the `?` shortcut dialog and on the 🪟 tooltip.

## Domain summary

- [ ] `Show domain summary` in the 🗂️ Columns menu reveals a strip above the grid listing each domain with its request count, transferred bytes, and an error count when 4xx/5xx responses exist, ordered by count (ties alphabetical); toggling it off hides the strip, and the choice survives a DevTools reopen.
- [ ] While recording, streamed requests update the strip's counts live without stealing focus or resetting its scroll position, and the request grid's own scrolling and keyboard navigation are unaffected.
- [ ] Clicking a domain shows only its requests (the entry highlights with a pressed state, the Filters badge counts 1, and the rule is editable in the Filters popup); clicking the pressed entry clears the filter; requests carrying an opaque scheme group under `data:` or `blob:` and filter like any other domain; only a genuinely unparseable URL falls into the non-clickable `(no host)` entry.
- [ ] The strip works identically in the pop-out mirror tab, aggregating the mirrored rows; note the domain match is a substring (like the row context menu's quick filter), so `example.com` also matches `api.example.com`.

## Settings and language

- [ ] The 🎛️ Settings button opens one dialog with Language, Theme, and Retention sections; <kbd>Esc</kbd> and Close both dismiss it and return focus to the button.
- [ ] Selecting 日本語 immediately switches explanations and guide dialogs (the language help line, the retention help and unlimited warning, the whole undock explainer) to Japanese, while toolbar button labels and column headers stay English; selecting English switches back, and System follows the browser language.
- [ ] With 日本語 selected, the **whole** row context menu is Japanese — the Filter section and its `パス: … のみ` / `… を除外` pairs, 選択 / 選択解除, ハイライト and its colour swatch tooltips, ハイライト解除, すべてのハイライトを解除, 比較, 選択した行を残す/削除, both copy disclosures and every format under them, and そのまま再送 / 編集して再送… — with no English item left among them and no wrapped or clipped entry. In English every one of those entries reads exactly as it did before.
- [ ] With 日本語 selected, the wave-2 surfaces are Japanese too: the export dialog's safety prose and full-output warning list, the resend dialog's intro and browser-managed-headers hint, the support dialog's prose, the sample guide's intro/prompts/exit help, the safe-support-summary help in the `?` dialog, and static toolbar tooltips (Search, Clear, Import, Export, 🪟, ⌨️). The pause button's tooltip stays English (it is JS-composed).
- [ ] With 日本語 selected, the surfaces the details pane grew are Japanese too: the `Body` / `Raw` toolbar (placeholder `生レスポンス内を検索`, `一致なし`, `すべて展開`, `サニタイズ済みをコピー` / `フルでコピー...` and the ↑↓ tooltips), the whole 🗂️ Columns menu (group headings, every checkbox name, `ヘッダー列` + `適用`, `ドメイン別サマリー`, and the `保存したビュー` buttons with their tooltips), the comparison title `2 件のリクエストを比較中`, and the toasts the ⧉ Copy URL and the pane's copy buttons write. In English every one of them reads exactly as it did before.
- [ ] With a screen reader in Japanese, the inspector divider announces `リクエスト インスペクター NN パーセント` (not only when a half is collapsed), the two tab strips announce `リクエストの詳細` / `レスポンスの詳細`, and the 🗑️ 📥 📤 🪟 ⌨️ toolbar buttons announce Japanese names, not only Japanese tooltips.
- [ ] With 日本語 selected, the Headers panes read Japanese around the captured data: the Request grid's `メソッド` / `オペレーション` / `URL` keys and the `リクエストヘッダー` / `レスポンスヘッダー` group headings, above header names that stay exactly as captured. The `フルでコピー...` dialog and its toast read `完全版生レスポンスをコピーしますか？` — no stray space either side of the pane name.
- [ ] Changing the language while a request is selected repaints the open details pane immediately: its toolbar, tab counts and grid keys follow, the tab that was picked stays picked, and the row stays selected. (A pane search and the panes' scroll positions restart — that is expected.) With the pane closed by ✕, changing the language leaves it closed: the row stays selected, and it is your click on the row that reopens it.
- [ ] The visible empty state re-renders in Japanese the moment the language changes (title and description, in the panel and the mirror tab), and the Timing tab's "What do the timing phases mean?" guide and evidence-limitation note render Japanese descriptions under English phase names.
- [ ] A body the page navigated away from shows its notice in Japanese in the Body tab, while a full HAR export of the same row still carries the English reason text (stored reasons stay canonical).
- [ ] The language choice survives a DevTools reopen and applies in both the panel and the mirror tab (each reads the same stored preference).
- [ ] The Theme select applies System / Dark / Light instantly and persists like before; the retention section still validates (out-of-range shows the inline error and keeps the dialog open) and Save closes the dialog.
- [ ] In the redesigned undock explainer, the red warning card, the bordered steps card with the Dock side icon row (first icon highlighted), and the ✅ summary line render correctly in Light and Dark, in both languages, with no horizontal scrolling at narrow widths.
- [ ] The undock explainer is as wide as its longest sentence — every paragraph and numbered step sits on one line in both English and Japanese — and it never exceeds the window: shrinking the mirror tab below its natural width wraps the text gracefully instead of overflowing or clipping.

## Navigation persistence

- [ ] Navigating the inspected page never clears the table; the status reports `Page navigated; kept N requests` with the pre-navigation rows intact.
- [ ] A body opened (or prefetched) before the navigation stays readable afterwards.
- [ ] A body that was not retrieved in time shows `The inspected page navigated away before this response body was retrieved.` in the Body tab immediately — no 10-second timeout — and the status counts those bodies. The same reason reaches a connected mirror tab.
- [ ] SPA route changes (history.pushState) mark nothing: bodies stay fetchable.

## Export scope, operation labels, and stream capture

- [ ] With rows selected (Ctrl/⌘-click or Shift-click), the export dialog shows `All displayed requests (N)` pre-checked and `Selected requests only (M)` with live counts; without any selection the scope chooser is absent.
- [ ] A selected-scope sanitized export downloads `network-plus-sanitized-selected.har` containing exactly the selected entries in capture order; reopening the dialog resets the default to all displayed rows. The full-HAR path honors the same captured scope after its one-time confirmation.
- [ ] Known methods render as colored badges (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS plus WS and SSE) that stay legible in System / Dark / Light; an unknown method stays plain bold text.
- [ ] The Operation column (off by default in Columns) shows GraphQL `operationName` or parsed query names (`Name (+2)` for batches) and JSON-RPC methods, sorts and filters like any column, and appears in the request Headers pane.
- [ ] `Stream capture: Off` sits in the status bar only inside a DevTools session; its tooltip states that only connections created while capture is on are seen and traffic is never altered.
- [ ] Turning it on and creating a WebSocket on the page adds a WS-badged row: sent frames appear in the request Body pane (`↑` lines), received frames and open/close events in the response Body pane (`↓` / `—` lines), and both are searchable and included, sanitized, in exports.
- [ ] With capture on, a page `EventSource` adds an SSE-badged row: default messages appear as `↓` lines, a named event (`event: foo`) appears as `↓ … foo: …` once the page has registered a listener for it, and `close()` adds a codeless `— … closed` mark.
- [ ] A WebSocket or EventSource that connects and receives within the same second keeps every frame (nothing is lost while the row is still flushing into the grid).
- [ ] Binary frames appear as `[binary N bytes]`; very long frame logs trim from the front with a visible `… earlier frames trimmed …` marker.
- [ ] Turning capture off stops recording without removing existing rows; a navigation while capture is on marks unclosed connections `Navigated` and keeps recording connections created by the new page.
- [ ] While paused or during the local sample, WebSocket and SSE events are not recorded.

## Edit and resend, and JWT decode

- [ ] Inside a DevTools session, the row menu of an http(s) request offers `Resend unchanged` and `Edit and resend...`; a WS row offers neither. (The pop-out mirror tab offers both and executes them remotely — covered in the mirror section above.)
- [ ] `Resend unchanged` on a GET immediately produces a new captured row for the same URL, and the status bar names the target; while recording is paused the status says the row will appear after resuming, and it does.
- [ ] `Edit and resend...` opens the dialog prefilled with the row's method, URL, headers (no `:authority`-style pseudo-headers), and body; editing the URL and adding a header sends exactly the edited request (verify against an echo endpoint or the new row's request pane).
- [ ] Pasting a Chrome "Copy as cURL (bash)" command into the dialog and choosing `Fill fields from cURL` populates method, URL, headers, and body; a command with `-F` or `-d @file` is refused inside the dialog naming the reason, and `-b`/`--compressed` import with a status note instead of failing.
- [ ] A header line without a colon blocks Send with a visible message and keeps the dialog open; a `Host:` or `Sec-*` line is silently not applied, as the dialog's hint states.
- [ ] Unchecking the cookies toggle re-sends without credentials (verify a logged-in endpoint returns 401/anonymous), and re-checking restores the logged-in behavior.
- [ ] A resent POST actually re-executes the server action — use a harmless endpoint when verifying, and confirm CORS- or CSP-blocked targets surface as a failed row or console error rather than a silent success.
- [ ] A request whose Authorization header carries a Bearer JWT shows a `JWT in Authorization` section in the request Headers pane: expanding it shows the decoded header and claims, `exp` with a humanized `expires in … / expired … ago` label (red when expired), and the note that the signature is not verified.
- [ ] A JWT-shaped value in any other header (request or response side) gets the same treatment; sanitized copies still redact the raw token, and the decoded claims appear nowhere in copies or exports.

## Request details pane

- [ ] Selecting a request titles the pane with a method badge, the host, a middle-ellipsised path that always keeps its last segment, a `?N` chip for the query count, and ` · <Operation>` for GraphQL rows; the tooltip always starts `METHOD https://…` and only its tail is cut, and the ⧉ button beside ✕ copies the sanitized URL with a toast.
- [ ] Drag the pane from wide to its 440px minimum on a long URL and read the title at every width: it is either the request's whole `METHOD host/path`, or it carries a visible truncation mark — a `…` in the path, or the host's own trailing ellipsis. There is no width at which it reads as a complete URL the request never made (e.g. `securepubads.example.test/final-segment.js` for a long multi-segment path).
- [ ] Narrowing the pane to its 440px minimum on a GraphQL row drops ` · <Operation>` from the title first (the summary strip still names it) so the host and the path's last segment stay readable instead of both ending in an ellipsis; widening brings it back.
- [ ] A one-line summary strip under the title states status, content type, size, duration, protocol, the operation, and one notable header chip (`Retry-After` on 429/503, `Location` on 3xx, `WWW-Authenticate` on 401); it survives every tab change, is hidden with nothing selected, and neither Headers pane repeats the facts it shows.
- [ ] Request > Headers shows the URL as an origin / path / query / fragment breakdown, with the `?N params — open Query` link beside the query text (not in place of it) and a `Show full URL` toggle; a URL with no query, fragment or credentials shows no toggle at all (the breakdown is already the whole string). Drag-select the whole row and copy: what lands on the clipboard is the complete URL, query and fragment included, and none of the button labels. A value over 240 characters clamps to four faded lines with `Show all (N chars)` / `Show less`, and the sanitized copy is identical either way.
- [ ] Query and Cookies tabs carry their count, and a tab whose pane is empty reads `… 0` at full contrast rather than dimming (it stays clickable, so its label must stay legible in both themes); the `Body` and `Raw` tabs count nothing, so an empty one takes an en dash instead — on the response side too, once the body has landed (a 204 leaves `Body` marked and `Raw` unmarked). A sticky tab that is empty for the next selected row falls back to `Headers` for that half, and an empty pane explains itself ("No query parameters — this POST carries its data in Body").
- [ ] A JSON body renders as a tree with sibling keys aligned, nodes deeper than two collapsed, and `Expand all` / `Collapse all` at the top of the tree opening and closing every node — `Expand all` also clicks through `... Show all N items` and unfolds long strings, and the pane toolbar shows no second `Expand all` beside it. Dragging a text selection across a summary line selects instead of toggling.
- [ ] A folded long string shows the same escaping as a short one (`\"`, `\\`, `\n` visible, never a raw quote between the quotes), so copying it out still parses as JSON.
- [ ] `Raw` splits the request line into method / path / protocol, divides headers from the body with a hairline, and highlights a JSON body in place; a body-less GET ends on its last header with no trailing hairline.
- [ ] Clicking the `Request` or `Response` label collapses that half to its label and tab bar and hands the space to the other; clicking a tab inside a collapsed half reopens it, double-clicking the divider restores 50/50, and the split percent and the collapsed half survive closing and reopening DevTools.
- [ ] With nothing selected the pane shows one guidance line instead of two empty tab strips; ✕ closes it with `Request details closed. Select a request to reopen.`, and selecting a row reopens it and replaces that notice with `Selected METHOD · host · status.` — a message written while the pane was closed is left alone. Selecting a different row updates that line to the new request instead of leaving it naming the old one.
- [ ] In Japanese, the ✕ and ⧉ buttons announce Japanese names to a screen reader (not only in their tooltips), and the collapse tooltips, divider value, and status lines read `リクエスト` / `レスポンス` rather than `Request` / `Response`, with no space between that noun and `インスペクター`. The collapse buttons announce `リクエストインスペクター (Request)` / `レスポンスインスペクター (Response)` — the same noun as their tooltip, still ending on the English caption they paint so "click Request" keeps working in voice control. The Timing pane's heading reads `タイミング内訳`, and a response body still loading shows `（読み込み中...）`.

## Search and detail-pane search

- [ ] In the dark theme, rows matching a search keyword are clearly distinguishable at a glance for every keyword color via their tint alone (no outline). Selecting any row — hit or not — draws a 2px accent outline around it that reads instantly as selection. The ID column shows no K-badge, while screen readers still announce "Matches search keyword N".
- [ ] During live capture with a body-scope keyword active, the top bar shows only the match count; "N bodies not searched" and "Showing matches only" appear inside the search panel's notice area and no top-bar button shifts or flickers as bodies load.
- [ ] `Matches only` in the search panel hides non-matching rows, updates the visible count and status line, and pressing it again restores all rows with highlights intact. With no active keyword the toggle changes nothing.
- [ ] With `Matches only` on, a sanitized HAR export contains exactly the displayed rows.
- [ ] `Matches only` survives `Clear` → `Undo clear` together with the search terms and scope.
- [ ] The Request/Response `Body` and `Raw` views each show one toolbar at the top of the pane: the search field on the left, `Copy sanitized` / `Copy full...` on the right; it stays stuck to the top while long content scrolls and the content starts directly under it. Typing highlights hits with a counter, Enter / Shift+Enter and the ▲▼ buttons cycle through hits (wrapping), and jumping to a hit inside a collapsed JSON-tree node or a folded long string expands it.
- [ ] The in-pane query is kept when switching rows or tabs and re-applies to the new content; Escape clears the field without closing the panel. A stored query that matches inside a folded node of a pane you are NOT looking at leaves that pane untouched — nothing unfolds behind your back — and unfolds only once you are on it and step to the hit.
- [ ] Narrow the details pane to its 440px minimum with a search term and `Expand all` showing: the copy buttons give up their labels for their ⧉ icons first, and only where the row still cannot hold everything does the copy pair — never the query field — take a second row. The match count and its ↑▼ buttons are one control and never split across rows, the term you typed stays readable at every width, and jumping to a hit still parks it below the taller sticky bar. Widening the pane never costs a toolbar row, and wherever the copy labels are painted the bar is a single row.
- [ ] Searching a JSON body with more than 100 array items or a preview truncated at 2,000 characters reports "(+N collapsed)" when hits are hidden; `Expand all` opens the truncated content and includes those hits in the count and navigation — the tree's own `Expand all` where the body is a JSON tree, the toolbar's where it is plain text.
- [ ] Visiting the wrapped two-row Body toolbar and then switching that half to `Headers` leaves no scroll gap at the top of Headers (jump to a hit or press Home there and the first line sits flush).
- [ ] An HTML response with no `charset` in its `Content-Type` header but a `<meta charset=...>` declaration (e.g. Shift_JIS) renders readable text in Body, Preview, and Raw.
- [ ] Rows highlighted from the context menu (★) show the same tint treatment as search hits in both themes, and the selection outline stays visible on top of them.
- [ ] During live capture the top-bar match counter changes number without moving the trash, import, or export buttons, and the `Aa` / `\b` / `.*` segmented group sits beside `Scope` without crowding the `Matches only` switch.
- [ ] The `Aa` / `\b` / `.*` match options change the request-list matches, the cell marks, and the in-pane search identically; an invalid regular expression turns the input red with the error in its tooltip and matches nothing.
- [ ] Scope, match options, and Matches only survive closing and reopening DevTools; search keyword text does not.
- [ ] <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd> focuses the pane search field when focus is inside a Body/Raw view, and toggles the request search panel elsewhere.
- [ ] A response declaring `Content-Type: text/html; charset=Shift_JIS` (or another non-UTF-8 charset) renders readable text — not mojibake — in the Body, Preview, and Raw views, including after a SAZ import.
- [ ] A binary response (a tracking-pixel GIF, a font, a `.wasm`) shows an offset/hex/printable dump in the Body and Raw views under a line naming the type and byte count — no replacement characters anywhere — while a JSON or HTML response is unaffected and still gets its collapsible tree.
- [ ] A 1x1 transparent GIF's `Preview` shows a visible checkerboard tile with a caption reading its type, `1 × 1 px`, its byte size, and the enlargement factor; a row whose `Type` column reads `x-unknown` but whose `Content-Type` header says `image/...` previews the same way.

## Toolbar popups and the status bar

- [ ] The `Columns` menu opens anchored under its button with a `Select all · Deselect all · Reset` header row and its checkboxes grouped under `Identity` / `Timing` / `Payload`; `Reset` restores the default visibility and widths and says so in the status bar, and the menu scrolls rather than running past the bottom of the viewport.
- [ ] The `Columns` menu ends with a `Preset` section: `Update` saves the current columns + filters, `Apply` restores them (or the default view before anything is saved), `Forget saved preset` removes the saved state, and `Filters (N)` reflects the applied rules.
- [ ] The `Filters` popup opens with every column section expanded; Method / Status / URL rules read as single rows without stray wrapping, and a section header click collapses and re-expands it.
- [ ] The `Filters` popup lists every filterable column as a collapsed row; clicking a row expands only that column's rule editor, editing a rule shows an `Active` chip and updates the header count live, and reopening the popup keeps active columns expanded.
- [ ] The status bar shows only `cache <n>/<max>`, the status chips, `avg <t>`, and the transferred size — no retention limit, which lives in the 🎛️ Settings dialog and the cache tooltip; hovering cache, latency, and size reveals the full details in tooltips.
- [ ] Between 801 and 900px the status bar folds its details behind the disclosure toggle and stays a single row; from 901px the details are inline again with the spacer between message and counter, and the workbench itself stacks only at 800px and below.
- [ ] The request counter matches the grid in every state: `N requests` with nothing narrowing it, `N / M requests` when column filters narrow it (plus `· K column filter(s)`), `· N matching` while a search highlights without hiding rows, and `· matches only` when `Matches only` is on.

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
- [ ] The row menu opens with `▸ Copy full (unsanitized)` collapsed; clicking it expands eight formats in place (request summary, URL, cURL, fetch, PowerShell, Markdown, raw request, request body), the menu stays inside the viewport, and picking one copies immediately with no dialog. Arrow keys skip the formats while the group is collapsed.
- [ ] Right-clicking a `Path` or `URL` cell offers `Only`/`Exclude` for the path without its query string, and a very long value shortens in the label with the whole value in the tooltip — the menu never widens past ~420px or wraps an entry onto a second line.
- [ ] Filter / Columns / Scope / Color can be opened and closed by keyboard, with correct initial focus, <kbd>Esc</kbd> handling, and clamping at the viewport edge.

## High-volume capture and incremental rendering

- [ ] With no sort or an ascending ID sort and no filters or search, generate heavy traffic and confirm existing DOM rows are preserved while only new rows are appended per frame.
- [ ] With a descending ID sort, a sort on another column, a column filter, or a search keyword active, new traffic keeps the correct order, visibility, and search badges.
- [ ] Changing the sort or filter while a new-traffic frame is pending produces no duplicate rows and no stale search state.
- [ ] Normal clicks, arrow keys, and <kbd>Ctrl</kbd>/<kbd>⌘</kbd> toggles preserve DOM order, focus, details, and the selected count and size.
- [ ] Auto-scroll happens only while at the bottom; after scrolling up manually, new traffic does not move the position.
- [ ] Immediately after Clear, a HAR/SAZ import, a Columns change, or Keep/Delete Selected, the counts, transfer sizes, and row IDs all agree.
- [ ] The phase guide in the Response `Timing` tab opens and closes with <kbd>Enter</kbd> / <kbd>Space</kbd>, and Blocked / DNS / Connect (TLS excluded) / TLS / Send / Wait (TTFB) / Receive plus the observability limitation are readable at 320 / 375 / 414 / 768 px.
