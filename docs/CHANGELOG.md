# Changelog

All notable changes to Network+ for DevTools. Versions follow [Semantic Versioning](https://semver.org/); `version` is bumped once per release rather than per commit. Published builds are listed under [GitHub Releases](https://github.com/himiyosh/network-plus-extension/releases).

## Unreleased

- The mascot is now an otter, in the toolbar brand mark and the support dialog alike — and the toolbar mark is now pixel art. At its real 15-pixel height, smooth vector shapes rasterized into mush, so the mark is a hand-placed 22x15 sprite drawn at exactly one device pixel per cell with `crispEdges`. Two full sprites ship in the markup: asleep (shut eyes, blush, a drifting z), and a woken frame that hover or focus cuts to instantly, ears perked and a magnifying glass raised — the investigator motif this network inspector deserves. The idle breathing tween became a two-frame `steps()` bob, so every frame stays on the pixel grid. The support dialog keeps its larger smooth vector otter, where there is room for curves, and all motion still stops under `prefers-reduced-motion`.
- Remade the four store screenshots as dark, numbered compositions: the panel is captured in its real dark theme at final pixel size and set unscaled inside a gradient-ring frame on a deep-indigo glowing canvas, each with a step eyebrow (01-04) and a white headline. The intended display order is now part of the file names (`screenshot-1-…` through `screenshot-4-…`), since the stores show screenshots in upload order and the old names carried no ordering at all.
- Rebuilt the promotional tile and marquee around the composition the retired otter tile got right: the actual extension icon is the centerpiece, the sleeping otter and steaming cup sit beside it with gradient shading, blush, whiskers, and ground shadows, and glowing status-colored waterfall bars give the background depth. The tile is text-free again. The 1400x560 marquee doubles as the Microsoft Edge Large promotional tile, which uses the same dimensions per the Partner Center listing guide.
- Redesigned the store listing media around the shipped brand. The promotional tile shows the mascot-and-cup scene rendered from the project's own brand art; a 1400x560 marquee promo is new, so the listing qualifies for featured placements; the four screenshots are now compositions — a one-line headline over an unscaled, natively captured panel view, so the pixels stay sharp — and the README tour GIF opens with a brand title card and captions each of its four steps. Every asset remains synthetic-only and is size- and provenance-checked by `store:check`.
- Added `npm run store:setup`, a guided runner for the one-time credential setup the store automation needs. It opens each portal page at the point it is needed, stops for the parts only a signed-in operator can do, checks the shape of the two identifiers whose format is documented, and pipes each value into the `store-submission` environment over stdin rather than as a command-line argument, so no credential reaches a file, the terminal scrollback, or the process table. The stored names are read back afterwards to prove the workflow will find them.
- Store submission is now automated. Publishing a GitHub release also uploads that release's archive to the existing Microsoft Edge Add-ons product and Chrome Web Store item and submits it for review; the same run can be started by hand from the Actions tab, for one store or both, and can stop after the upload instead of submitting. The archive is rebuilt and its SHA-256 compared against the digest the submission dossiers pin before anything is uploaded, so a store can only receive reviewed bytes. Credentials are read from repository secrets held by a dedicated `store-submission` environment, are redacted out of every message the run prints, and a store with no credentials configured is skipped rather than failing the other one. A helper, `scripts/chrome-refresh-token.js`, obtains the Chrome refresh token through a loopback consent flow, because the published guide still documents the out-of-band redirect that Google retired and a client created today is refused by it.
- Recorded the published v1.9.0 release in the Microsoft Edge and Chrome submission dossiers: the ZIP was re-downloaded from the public release, its 151681-byte size and SHA-256 digest were verified against the value the store kits pin, and the downloaded file was byte-compared against the local build.
- Both store submission dossiers now document the update path for an extension that is already listed, which differs from the first submission they described: a package update against the existing product, a version that must be strictly higher than the one in the store, a listing that is not versioned and so keeps stale screenshots live until they are replaced, and a fresh review in which the previously approved package stays live until the new one passes.

## v1.9.0 - 2026-08-19

- Refreshed the release media for the redrawn panel: the four 1280x800 store screenshots and the README tour GIF were re-captured from the local synthetic sample, so the toolbar mark and the status bar in the listing match what v1.9.0 ships. Brand animation is now frozen outright for captures rather than paused on a chosen frame, so repeat captures are identical.
- Repointed the Microsoft Edge and Chrome submission dossiers at `v1.9.0`: they now carry the 151681-byte archive and its SHA-256, reproduced by a second local build, and state plainly that the release is published by the release workflow rather than claiming it was already observed publicly.
- Recorded the published v1.8.0 release in the Microsoft Edge and Chrome submission dossiers: the ZIP was re-downloaded from the public release and its 150672-byte size and SHA-256 digest were verified against the value the store kits pin.
- Redrew the brand cat as a sleeping loaf and gave the mark more life: the cat now dozes on the “for DevTools” label with closed-eye arcs, breathing gently, its tail flicking now and then, and a small “z” drifting up beside it. Hovering or focusing the mark wakes it — the closed lids open into two small dot pupils set wide apart, so most of the face stays fur (eyes big enough to fill the muzzle read as a stare rather than a greeting, and a catchlight only bleaches a pupil that is under two pixels wide), breathing stops, the steam strengthens and the “Support ♥” hint slides in. The coffee cup is larger with three always-on steam wisps, so it reads as hot without hovering. The floating z and heart moved out of the cat's clipped window, so neither is cut off any more. All of it still stops under `prefers-reduced-motion`.
- Reworked the status bar's request counter so it always describes what the grid is showing: it reads “1,967 requests” when nothing narrows the list, “120 / 1,967 requests” when it does, and it now reports search results too — “· 12 matching” while every row stays visible, or “· matches only” when the search is doing the narrowing. Previously a search left the counter reading “1967 / 1967”, and a few code paths reported the pre-search count. Counts are thousands-separated.
- Dropped the retention limit from the status bar; it already has its own toolbar button. The body-cache figure, the retention warnings and the full bookkeeping tooltip stay where they were.
- Release publishing is now automated: when a version bump reaches `main` (or a `vX.Y.Z` tag is pushed), CI rebuilds the extension package, verifies that the version, the tag, and the archive digest recorded in the store submission dossiers all agree, and publishes the GitHub release with the ZIP attached and notes generated from that version's changelog section. A version that is already published is skipped rather than republished.

## v1.8.0 - 2026-08-18

- Refreshed the release media for the current panel: the four 1280x800 store screenshots and the README tour GIF were re-captured from the local synthetic sample, so the toolbar, Filters and Columns menus, and status bar in the listing match what ships. The coffee cup in the brand mark also gained a stronger outline so it stays legible at 1x.
- Retired the separate Presets toolbar button (it had also shipped broken — its popup closed in the same click that opened it) and folded presets into the **Columns** menu as a single view preset: **Update** saves the current column visibility + filter rules, **Apply** restores them — or the factory default view before anything was saved — and **Forget saved preset** returns Apply to the default. The first entry of the old multi-preset store is migrated automatically. Preset data stays in `localStorage` and never contains captured traffic.
- Redesigned the Column Filters popup: every column is a collapsible section that now starts **expanded** (collapsing is optional, not a hurdle), columns with active rules show an “Active” chip, and the header keeps a live active-rule count. Controls were compacted onto single rows — Method's All/None sits inline with its checkboxes, each Status class shares a row with its codes, URL fields are label-beside-input, and time ranges keep From/To on one line — with smaller checkboxes and a slightly wider popup so nothing wraps mid-rule.
- Decluttered the status bar: retention now reads “Retention 20,000 · cache 21 MB / 32 MB” with the full bookkeeping (evicted/omitted/truncated counts) in its tooltip, latency shows only the average (min/max in the tooltip), the transferred size drops the word “transferred” (tooltip explains it), and “0 active column filters” is no longer shown when no filter is active.
- Merged the Network+ brand and the support (donation) button into one living toolbar mark: a small orange cat drawn as one bold organic silhouette — tall pointed ears, big glossy eyes with catchlights, perched over the “for DevTools” label where the pill has the most headroom (hovering a clear 2px above those letters instead of crowding the tall wordmark) — sized to stay recognizable at its real 15px height (finer details like stripes and whiskers were deliberately dropped as unreadable at that scale), beside a white porcelain coffee cup with a dark brew surface, a brew-toned edge so it reads on both theme fills, and faint always-on steam. The idle motion is deliberately sparse: blinking, an occasional duck behind the letters, and a rare tiny floating heart. Hovering or focusing the mark wakes the cat, strengthens the steam, and slides in a "Support ♥" hint; clicking opens the existing Support dialog. The separate ☕ button is gone, the toolbar is slightly narrower, and all motion stops under `prefers-reduced-motion`.
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
