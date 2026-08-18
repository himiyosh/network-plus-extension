# Changelog

All notable changes to Network+ for DevTools. Versions follow [Semantic Versioning](https://semver.org/); `version` is bumped once per release rather than per commit. Published builds are listed under [GitHub Releases](https://github.com/himiyosh/network-plus-extension/releases).

## Unreleased

- Merged the Network+ brand and the support (donation) button into one living toolbar mark: a small round cat with sparkly eyes and blushing cheeks rests its paws on top of the “Network+” wordmark itself (no extra toolbar width), blinking and flicking an ear, beside a warm orange coffee cup with a visible coffee surface and faint always-on steam. Roughly every half minute the cat ducks behind the letters and pops back, and now and then it releases a tiny floating heart. Hovering or focusing the mark wakes the cat, strengthens the steam, and slides in a "Support ♥" hint; clicking opens the existing Support dialog. The separate ☕ button is gone, the toolbar is slightly narrower, and all motion stops under `prefers-reduced-motion`.
- Added match options to the search panel — **Aa** (match case), **\b** (whole word), **.\*** (regular expression), grouped as one segmented control beside the Scope button — applying to the request-list keywords, the table cell marks, and the in-pane Body/Raw search. Invalid regular expressions mark the input red and match nothing instead of erroring.
- Search preferences (scope, match options, and the Matches only state — never keyword text) now persist through `chrome.storage.local`, the same mechanism as the theme.
- <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd> is now context-aware: with focus inside a detail Body/Raw view it focuses that pane's own search bar; elsewhere it toggles the request search panel as before.
- The in-pane search now counts matches hiding inside collapsed JSON-tree nodes and truncated body previews, shows them as "(+N collapsed)", and offers an **Expand all** action that opens every truncation control and re-highlights.
- HTML responses that declare their charset only in a `<meta>` tag (with no `charset` in the `Content-Type` header) are now decoded correctly: the first 1 KB is scanned for a meta charset before decoding, in both the live-capture and SAZ-import paths.
- Manually highlighted rows (context menu ★) share the same tint treatment as search hits, so they stay legible in the dark theme without adding outlines that could be mistaken for selection.
- Made search-hit rows legible in the dark theme and kept selection unambiguous: row mix percentages raised from 8% to 22%/18% and matched-text marks from 25%/20% to 35%/28%, hit rows stay tint-only (no outline), and the selected row now carries a clear 2px accent outline all the way around. The `K1`/`K2` match badges moved out of the ID column into the accessibility tree (screen readers still announce them; the tint and mark colors identify the keyword visually).
- Added a **Matches only** toggle switch directly next to “+ Add keyword” in the search panel: when on, the request list shows only rows that match a search keyword (off keeps every row visible with highlights). The displayed set also drives HAR export, and the setting survives Clear undo. Capture-time notes (“N bodies not searched”, “Showing matches only”) render in a reserved notice area inside the search panel instead of the top bar, and the top-bar match counter is fixed-width, so the trash/import/export buttons never shift during live capture.
- Added an in-pane keyword search to the Request/Response **Body** and **Raw** inspector views, rendered as a flush bottom bar pinned to each pane's lower edge, with hit highlighting, a match counter, Enter / Shift+Enter and ▲▼ navigation, and automatic expansion of collapsed JSON-tree nodes when jumping to a hit.
- Fixed garbled text (mojibake) for non-UTF-8 bodies: base64 response bodies and imported SAZ request/response bodies are now decoded with the charset declared by their `Content-Type` header (falling back to UTF-8), and SAZ header/body splitting now happens at byte level so multi-byte bodies no longer shift the boundary.
- Prepared Microsoft Edge Add-ons and Chrome Web Store submission materials: an exact v1.7.0 upload checksum, browser-neutral privacy wording, a Chrome-required 440 x 280 promotional tile, reviewer test instructions, and automated cross-store consistency checks.

## v1.7.0 - 2026-08-14

- Added a CI-enforced changelog policy: user-facing runtime, UI, icon, funding, privacy, store-asset, or README changes must include a new bullet in this `Unreleased` section.
- Added GitHub Sponsors and Ko-fi support routes, including an animated in-panel support dialog with an optional coffee CTA.
- Raised the default request retention limit from 5,000 to 20,000 requests.
- Documented verified Google Chrome support alongside Microsoft Edge.
- Refreshed the extension icon artwork with a brighter, more legible color treatment at small sizes.
- Retired the mandatory independent-review and exact-head marker mechanism under explicit repository-owner authorization. The trusted workflow, checker, marker fixtures/tests, reviewer/merger repository variables, status context, and current operating instructions were removed while Node.js 22/24 CI, dependency audit, release packaging, security checks, and ordinary optional reviews remain.
- Rewrote the README in English for an international audience, with a hero tour animation, a screenshot gallery, and a task-oriented structure. Long-form internal material moved to `docs/architecture.md`, `docs/manual-test-checklist.md`, and this changelog; the release-route landmarks checked by `npm run version:check` were renamed to match.
- Added a code-trust boundary for independent-review verification (issue #95). Because `pull_request_target` and `issue_comment` resolve the workflow definition from the base repository's default branch, a dedicated workflow that never checks out or executes PR code verifies the exact-head marker using only the checker on the default branch, and publishes the `independent-review` commit status fail-closed. A pull request that rewrites the checker, its tests, or the workflow still cannot change what its own run verifies. Least privilege (`permissions: {}` plus status write), no dependency installation, a pre-verification failure seed, and follow-through on marker posting and deletion are pinned by mutation tests over a step allowlist and step-body digest.
- Red-teamed that pin twice and closed the bypasses found in practice. The first pass found routes that neutralized the gate without changing a single byte of a step body (job-level `container:`, `defaults.run.shell`, job-level `env:` shadowing, a second job, `on:` `paths-ignore`, and top-level `env:` `GH_HOST` / `NODE_OPTIONS`). The second pass found that the region above `on:` entered no digest and that top-level key enumeration was a line regex, so Prettier's canonical `'defaults':` form could swap `run.shell`. Enumeration of top-level keys, job IDs, and job keys plus a job-header digest were added, with a final catch-all digest over the **entire workflow file** so correctness no longer depends on slicing regions with regexes. Both routes are pinned by mutation tests.
- Documented, from measurement, what that boundary does not cover (PR #120). The commit-status namespace is shared across the Actions app, so a workflow inside a PR that declares `permissions: statuses: write` can post the same context, and branch protection cannot distinguish the poster. Unwitting weakening is now mechanically impossible, but deliberate forgery is not prevented. The permanent fix — a check owned by an independently owned GitHub App — remains open under issue #95.
- Resolved high-priority audit recommendations through dependency updates (brace-expansion GHSA-rgw5-rvv9-x895 to 1.1.18/2.1.4/5.0.9; js-yaml GHSA-5p4m-2wfm-xmqj to the 3.15.1 backport, which is inside the `^3.13.1` range declared by `@istanbuljs/load-nyc-config`). With audit clean, the time-boxed exception script `scripts/check-audit-policy.js` was removed as its own policy required, and `audit:strict` is now plain `npm audit --audit-level=high`.
- Bound the independent-review gate to the reviewer UUID configured in repository Actions variables, failing closed before marker evaluation on missing, malformed, or equal reviewer/merger configuration, a mismatched marker, empty implementation-session attribution, or a PR metadata total that changed during collection. Network+-specific markers, a deterministic variable rotation and recovery runbook, and the external trusted-check boundary of issue #95 are now written down.
- Made the independent-review gate read the total commit count from pull request metadata and fail closed before marker evaluation when it disagrees with the collected set of at most 250 commits. Pull requests above 250 commits must be split into several of 250 or fewer and re-run through the review gate.
- Added the exact-head `independent-review` marker gate as the final step of required Node 22/24 CI, requiring agreement between the marker on the first non-empty unfenced line of a GitHub `OWNER` comment, the full reviewer UUID, and the `Copilot-Session` trailer of physical and escaped PR commits.
- Recorded a verified description, homepage, support route, and seven search vocabulary terms in `package.json`, with `store:check` rejecting drift against the manifest and the Edge Add-ons dossier. Added direct routes from the top of the README to the release ZIP and to support.
- Added `Exit · restore prior recording state` to the status bar and the `Sample guide`, available only during a complete local sample. It validates the provenance, method, domain, path, and status of all three requests, exits fail-closed, and restores the recording state and column filters from before the sample.
- Added an optional `Copy safe support summary` to the Keyboard Shortcuts dialog. It reads no captured traffic and copies only an allowlisted version, Edge major, coarse OS family, and settings, and only on direct activation.
- Added a `Sample guide` available only during the local sample. It presents four investigation prompts first and reveals the failing request, dominant timing phase, retry header, and observability limit from a deterministic sample source only after an explicit reveal.
- Added an inspectable guide to the timing phases, plus the limitation that browser-observed values do not prove packet loss, cabling or RF faults, or a definitive root cause, to both the Response `Timing` tab and the README.
- Added filter presets: save, restore, and delete up to 20 named column-filter configurations from the `Presets` button. Captured request information is never stored; only `localStorage` is used.
- Added a keyboard shortcut reference, opened with the <kbd>?</kbd> key or the `⌨️ ?` toolbar button, returning focus on `Esc` or `Close`.
- Exported `serializeFilterState`, `deserializeFilterState`, and `normalizePresetName` as pure functions and `loadFilterPresets` / `saveFilterPresets` as testable storage functions, with Jest coverage.
- Added static regression tests in `tests/ui-contract.test.js` that prevent the filter preset and shortcut features from silently disappearing.

## v1.6.0

- Responsive and accessibility hardening: vertical stacking at 700 px and below, popups clamped inside the viewport, and WCAG 2.2 AA contrast in every theme.
- Strengthened keyboard sorting, column reordering, row/menu/tab navigation, divider resizing, and focus restoration.
- Data-integrity hardening: epoch-based time sorting, timing deduplication, protection against late-arriving body races, and consistent selection and statistics under retention pressure.
- Switched naturally ordered live capture to per-frame `DocumentFragment` appends, stabilizing batch rendering and search updates.
- Added request retention limits, per-body and total response-body limits, eviction and omission states, and a retention policy for HAR/SAZ import.
- Made HAR, clipboard, cURL, fetch, and PowerShell output sanitized by default, restricting full output to a per-action warning confirmation.
- Established CI gates running Jest, ESLint, format, version, text/lock/package integrity, and audit on Node.js 22 and 24.
- Removed the unused `downloads` permission and pinned the actually used `storage` permission with an automated regression check.
- Added reproducible release ZIP creation containing only the 10 explicitly allowlisted runtime files.

## v1.5.0

- Merged the global filter and deep search into one integrated multi-keyword search.
- Gave each keyword its own input, color selection, match count, and ▲▼ navigation.
- Search targets: URL / Domain / Path / Method / Status / Type plus request and response bodies and headers, with a scope switch.
- Six per-keyword highlight colors (yellow, red, green, blue, purple, orange) applied to the row background and the text.
- Fixed sticky column headers not staying in place.
- Fixed the filter operator dropdown showing nothing other than `contains`.
- Improved rendering performance under heavy traffic with `requestAnimationFrame` throttling.
- Changed the clear-all button icon (🗑️) and design so it is clearly distinct from the stop-capture button.
- Moved the record stop/resume button to the far left of the top bar.
- Displayed the brand logo (📡 Network+ for DevTools) on a gradient background.
- Fixed the caret disappearing while typing in the search input by saving and restoring focus and caret position.
- Fixed search results not updating in real time as new requests arrived.

## v1.4.0

- Stronger per-column filters (Time: time picker; Method: multi-select; Domain/Path: multiple conditions; URL: compound conditions).
- Fiddler-style tabbed detail inspector with Request and Response sub-tabs.
- Column resizing.
- Auto-scroll toggle.
- Initiator links that open the source file in DevTools.

## v1.3.0

- HAR export with full HAR 1.2 support.
- Keyboard navigation with the arrow keys.

## v1.2.0

- Global filter with debounce.
- Column sorting (ascending / descending / off).

## v1.1.0

- Theme switching (System / Dark / Light).
- Recording control (Pause / Resume).

## v1.0.0

- Initial release: live capture, custom columns, and column visibility toggles.
