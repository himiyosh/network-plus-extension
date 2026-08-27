# Changelog

All notable changes to Network+ for DevTools. Versions follow [Semantic Versioning](https://semver.org/); `version` is bumped once per release rather than per commit. Published builds are listed under [GitHub Releases](https://github.com/himiyosh/network-plus-extension/releases).

## Unreleased

- ✨ **Changelog format** — entries are one emoji-tagged line again, with an optional `Why:` line under them.
  - Why: entries had drifted to 688 characters on average by v1.12.0; `changelog:check` now caps and tags them.
- 🐛 **Edge listing link** — both READMEs linked the storefront by Partner Center product GUID and returned 404.
  - Why: only Chrome's API item id doubles as its storefront id; Edge's two ids are separate. `version:check` guards both now.
- 🐛 **store:pages deletion** — cleared nothing on either store, so uploads were appended and screenshots duplicated.
  - Why: the slot label alternation was unparenthesized, and the console's delete confirmation was never answered.
- 🐛 **Edge abort message** — no longer blames a certification lock it has not checked.
  - Why: the listing read "In the Store"; the real fault was its own confirmation selector.
- 🐛 **Archive reproducibility** — the release ZIP rebuilds to the same digest in any timezone, not only UTC.
  - Why: fflate writes DOS timestamps from a Date's local fields, so JST wrote 09:00 where CI wrote 00:00.
- 🐛 **store:pages identifiers** — finds this repository's store ids without an `.env`, so a fresh checkout runs.
- 📝 **Store dossiers** — record v1.12.0 as observed, with the asset re-downloaded and byte-compared.

## v1.12.0 - 2026-08-26

- ✨ **store:pages** — swaps the listing images on both store consoles from the operator's machine; nothing is submitted.
  - Why: the Chrome Items API and the Edge Update API take packages only, so images were the last manual release step.
- 🐛 **Path/URL quick filters** — built the rule from the query string too, so it matched one request instead of a class.
  - Why: query strings are per-request state. Menu labels also shorten at 48 characters instead of wrapping the viewport.
- 🔧 **Copy full (unsanitized)** — the eight formats moved from a modal into the row menu; one click, no dialog round trip.
- 🐛 **Export-safety dialog** — showed its three export buttons in every mode, including per-action copy confirmations.
  - Why: `.data-safety-choices{display:grid}` had no `[hidden]` companion, and `display` outranks the UA hidden rule.
- 🐛 **Binary responses** — arrived as mojibake with an empty Preview; they now render as a hexdump with type and size.
  - Why: every cached body went through `TextDecoder`, which substitutes U+FFFD for bytes it cannot interpret.
- 🐛 **Response Preview** — a 1x1 tracking pixel drew one invisible dot; small images are now enlarged on a checkerboard.
- ✨ **Match column** — one chip per matched search keyword, in that keyword's own colour, beside ID.
  - Why: a row matching several keywords could only ever wear the first one's tint. Past three, chips collapse into "+N".
- 🔧 **Row isolate/exclude** — follows the column you right-clicked instead of always filtering by domain.
- 🐛 **Three placement defects** — the details header prefixed the status, Auto-scroll moved nothing, and scrolled-to rows sat under sticky headers.
- 🐛 **Japanese line breaking** — dialog prose broke mid-word; it now breaks by phrase and the document declares its language.
- 🔧 **Support illustration** — the otter's eye read as a dash at 6x and is now two solid squares.
- 🔧 **Support dialog art** — redrawn as pixel art composited from the toolbar mark rather than a freehand otter.
  - Why: every freehand attempt drifted into a bear-cub silhouette; the shipped mark already solves the proportions.
- 🔧 **Support dialog copy** — a four-line paragraph became one line plus three chips; the pinned commitments stay in full.
- 🐛 **data: and blob: URLs** — rendered a blank Domain and a Path naming an origin the browser never contacted.
  - Why: they carry no host and their payload lands in `pathname`. Domain now names the scheme, so they filter like any other.
- 🔧 **Request retention** — unlimited out of the box, so a long session no longer drops the request you were looking for.
  - Why: the 1 MiB per-body and 32 MiB shared-cache limits are unchanged, so the growth is row metadata, not payloads.
- ✨ **Japanese dialog labels** — 52 item names now switch with the language, not just the explanatory prose.
  - Why: toolbar buttons and column headers stay English so a written instruction still names the control you click.
- 📝 **READMEs** — link the published Edge and Chrome listings, replacing the stale "not yet published" claim.
- 🐛 **Undock explainer** — pinned at 440px while its text needed ~800px, wrapping five of seven Japanese lines mid-sentence.
- ✨ **Domain summary** — an optional strip above the grid with each domain's request count, bytes, and 4xx/5xx count.
  - Why: clicking a domain writes the same multiText rules the Filters popup and row menu share, so it clears there too.
- ✨ **Japanese coverage** — every explanatory surface translates now, tooltips included via `data-i18n-title`.
- ✨ **Header column** — bind a hidden column to any header name; response headers win, request headers are the fallback.
- ✨ **WebSocket HAR export** — frames export as Chrome-shaped `_webSocketMessages`, with every fidelity loss declared.
  - Why: sanitized exports omit frames as body-class data and mark the omission; SSE rows never gain the key.
- ✨ **Paste cURL** — the resend dialog prefills from a pasted command, so Chrome's "Copy as cURL" imports as-is.
  - Why: unsupported flags are refused by name rather than guessed at.
- ✨ **Three small additions** — domain quick filters in the row menu, sanitized CSV export, and Ctrl/⌘+Shift+M for the mirror tab.
- ⚡ **Responsiveness pass** — clicking away from a large selection no longer freezes the panel; HAR export uses four workers.
  - Why: the row-replacement path ran a full-table DOM query per selected row, which was quadratic.
- 🔧 **Verification toolchain** — the mirror's real-browser suite moved into the repository, and `vendor/fflate.js` is sha256-pinned.
- 🐛 **Mirror link** — closed five robustness gaps, including reattach after DevTools reopens and command timeouts.
- ✨ **Settings dialog** — one opener gathering Language, Theme, and retention; the undock explainer became visual cards.
- ✨ **"Keep DevTools open" dialog** — the mirror tab now explains the docked case, where there is no window to minimize.
- 📝 **Store dossiers** — record the published v1.11.0 release, re-downloaded and byte-compared against a local build.
- 📝 **Dossier defects** — the Chrome upload step still named the v1.10.0 archive, and an evidence sentence was duplicated.
- ✨ **Pop-out mirror tab** — 🪟 opens the panel as a browser tab that live-mirrors the DevTools session; no new permissions.
- 🐛 **Hidden toolbar buttons** — `.topbar button` silently overrode the `hidden` attribute, so scripted hiding did nothing.
- 🔧 **Navigation** — capture explicitly survives it, and discarded bodies say "navigated away" instead of timing out later.
- 📝 **READMEs** — document opening the panel in its own browser tab.
- ✨ **Sanitized Markdown copy** — an issue-ready block per row, or one compact table for a multi-row selection.
- ✨ **HAR WebSocket import** — imported conversations thread into the same Body panes as live capture, sorted by time.
- 📝 **Store descriptions** — rewritten around safe-by-default sharing, charset decoding, diffing, and the mirror tab.
- 📝 **Store media** — the four screenshots and the README tour GIF re-captured against the current panel.
- ✨ **Edit and resend** — re-send a captured request unchanged, or edit method, URL, headers, and body first.
  - Why: the inspected page issues it over the DevTools eval API, so cookies, CORS, and page policies apply as usual.
- ✨ **JWT decoding** — header and claims expand inline with humanized `exp`/`nbf`/`iat`; the signature is not verified.
  - Why: display only — sanitized copies still redact the raw token, and decoded claims never join copies or exports.
- 🐛 **Pop-out auto-minimize** — did nothing for an undocked DevTools window, and now states its outcome either way.
  - Why: `getLastFocused` ignores the `windowTypes` filter (deprecated since Chrome 46) and the new tab had stolen focus.
- ✨ **Mirror remote control** — pause, clear, retention, import, stream toggle, and resend execute in the DevTools session.
- ✨ **Auto-minimize** — opening the mirror tab minimizes an undocked DevTools window; the package's first service worker.
  - Why: single-job and audited, through the permissionless `chrome.windows` API; permissions remain `storage` only.
- 🐛 **Mirror error pile-up** — the viewer ran the automatic body prefetcher, queuing a pull for every streamed row.
- 📝 **Pop-out guidance** — the disconnect status and both READMEs explain the undock-and-minimize setup.
- ✨ **SSE capture** — the opt-in toggle, renamed "Stream capture", records Server-Sent Events beside WebSocket frames.
  - Why: also fixed frames arriving in the same drain batch as their connection being dropped for good.
- 📝 **Manual test checklist** — three sections for this cycle's features, which automation here cannot reach.
- ✨ **Operation column** — reads GraphQL `operationName` and JSON-RPC `method` out of POST bodies; off by default.
- ✨ **WebSocket capture** — opt-in and permission-free; frames thread into the Body panes and survive navigation.
- ✨ **Method badges** — known HTTP methods render as tinted pills, every pair pinned at WCAG AA in all four themes.
- ✨ **Selected-rows export** — the dialog offers "Selected requests only" with a live count, for sanitized and full alike.

## v1.11.0 - 2026-08-21

- 📝 **Store media** — the screenshots and README tour GIF re-captured for the working-otter toolbar.
- 📝 **Japanese README** — a full `README.ja.md`, cross-linked, with emoji section markers; both are version-free now.
  - Why: release links point at `releases/latest`, so cutting a release no longer edits either README. `version:check` pins it.
- 🔧 **Toolbar otter** — works by default and relaxes when petted; it blinks, and the ambient snoring "z" is retired.
- 📝 **store-release skill** — the release and resubmission runbook, with a reference mapping every store failure seen to its cause.
- 📝 **Submission trigger** — documented that store-submit never fires on the release event, so it is dispatched by hand.
  - Why: releases are created with the workflow `GITHUB_TOKEN`, whose events GitHub suppresses to prevent recursion.
- 📝 **Store dossiers** — record the published v1.10.0 release, re-downloaded and byte-compared against a local build.

## v1.10.0 - 2026-08-20

- 🔧 **Otter mascot** — the toolbar mark is a hand-placed 22x15 pixel sprite, with a woken investigator frame on hover.
  - Why: at its real 15-pixel height, smooth vector shapes rasterized into mush.
- 🐛 **"for DevTools" sub-label** — hidden below 1367px, far above where it stops fitting, so most panels never showed it.
- 📝 **Store screenshots** — remade as dark numbered compositions, with the display order now part of the file names.
  - Why: the stores show screenshots in upload order, and the old names carried no ordering at all.
- 📝 **Promotional art** — the tile is the original otter illustration again, and a new 1400x560 marquee reuses that otter.
- 📝 **Listing media** — redesigned: a marquee for featured placements, composed screenshots, and a captioned tour GIF.
- ✨ **store:setup** — a guided runner for the one-time credential setup, piping each value in over stdin.
  - Why: no credential reaches a file, the terminal scrollback, or the process table.
- ✨ **Store submission** — publishing a release uploads that archive to both stores and submits it for review.
  - Why: the archive is rebuilt and digest-compared before upload, so a store can only ever receive reviewed bytes.
- 📝 **Store dossiers** — record the published v1.9.0 release, re-downloaded and byte-compared against a local build.
- 📝 **Update path** — both dossiers document updating an already-listed extension, which differs from a first submission.

## v1.9.0 - 2026-08-19

- 📝 **Release media** — screenshots and the tour GIF re-captured for the redrawn panel; brand animation is frozen for captures.
- 📝 **Store dossiers** — repointed at v1.9.0, stating plainly that CI publishes the release rather than claiming it was observed.
- 📝 **Store dossiers** — record the published v1.8.0 release, re-downloaded and digest-verified.
- 🔧 **Brand mark** — the cat dozes on the sub-label, breathing and flicking its tail, and wakes on hover or focus.
- 🐛 **Request counter** — a search left it reading "1967 / 1967"; it now describes what the grid is actually showing.
- 🔧 **Status bar** — dropped the retention limit, which already has its own toolbar button.
- ✨ **Release publishing** — a version bump reaching `main` rebuilds, verifies version/tag/digest, and publishes the release.

## v1.8.0 - 2026-08-18

- 📝 **Release media** — screenshots and the tour GIF re-captured; the brand mark's cup outline strengthened for 1x.
- 🔧 **Presets** — the separate Presets button is retired and one view preset now lives in the Columns menu.
  - Why: it had shipped broken — its popup closed in the same click that opened it.
- 🔧 **Column Filters popup** — sections start expanded, active columns show a chip, and the header keeps a live rule count.
- 🔧 **Status bar** — decluttered: retention and cache on one line, average latency only, with the detail moved to tooltips.
- 🔧 **Toolbar mark** — the brand and support button merged into one living mark perched over the \"for DevTools\" label.
- ✨ **Search match options** — `Aa`, `\b` and `.*` as one segmented control; an invalid regex marks the input and matches nothing.
- ✨ **Search preferences** — scope, match options and Matches only persist; keyword text never does.
- 🔧 **Ctrl/⌘+F** — context-aware: inside a Body or Raw view it focuses that pane's own search bar.
- ✨ **Collapsed matches** — in-pane search counts hits inside collapsed JSON nodes as \"(+N collapsed)\", with Expand all.
- 🐛 **Meta charset** — HTML declaring its charset only in a `<meta>` tag decoded as mojibake; the first 1 KB is scanned now.
- 🔧 **Highlighted rows** — manual ★ rows share the search-hit tint, so they stay legible without outlines.
- 🐛 **Dark-theme legibility** — search hits were too faint; row and mark mixes were raised and selection gained a 2px outline.
- ✨ **Matches only** — a toggle beside \"+ Add keyword\" narrowing the list to matching rows; it drives HAR export too.
- ✨ **In-pane search** — a pinned search bar in the Body and Raw views, with a match counter and ▲▼ navigation.
- 🐛 **Non-UTF-8 bodies** — decoded as mojibake; they now honour the `Content-Type` charset, and SAZ splits at byte level.
- 📝 **Store submission materials** — checksum, privacy wording, promotional tile, reviewer instructions, and consistency checks.

## v1.7.0 - 2026-08-14

- 🔧 **Changelog policy** — CI requires a new Unreleased bullet for user-facing runtime, UI, icon, privacy, asset, or README changes.
- ✨ **Support routes** — GitHub Sponsors and Ko-fi, with an optional animated in-panel support dialog.
- 🔧 **Retention default** — raised from 5,000 to 20,000 requests.
- 📝 **Chrome support** — documented as verified alongside Microsoft Edge.
- 🔧 **Extension icon** — refreshed for legibility at small sizes.
- 🔧 **Independent-review gate** — retired under explicit repository-owner authorization; Node 22/24 CI stays required.
- 📝 **README** — rewritten in English with a hero tour, a screenshot gallery, and a task-oriented structure.
  - Why: long-form internal material moved to `docs/architecture.md`, the manual test checklist, and this changelog.
- 🔒 **Review trust boundary** — a dedicated workflow verifies the exact-head marker without ever checking out or running PR code.
- 🔒 **Gate red-teaming** — two passes closed bypasses that neutralized the gate without changing a single byte of a step body.
- 🔒 **Boundary limits** — documented from measurement: the commit-status namespace is shared, so a PR workflow can post the same context.
- 🔒 **Dependency audit** — the brace-expansion and js-yaml advisories resolved; the audit is clean.
- 🔒 **Reviewer binding** — the gate binds to the configured reviewer UUID and fails closed on missing or malformed configuration.
- 🔒 **Commit-count check** — the gate fails closed when PR metadata disagrees with the collected set; over 250 commits must be split.
- 🔒 **Exact-head marker gate** — added as the final step of required Node 22/24 CI.
- 📝 **package.json metadata** — description, homepage, support route, and seven search terms, with `store:check` rejecting drift.
- ✨ **Sample exit** — "Exit · restore prior recording state" validates all three sample requests and restores the prior state.
- ✨ **Safe support summary** — copies only an allowlisted version, browser major, coarse OS family, and settings; never traffic.
- ✨ **Sample guide** — four investigation prompts first, revealing the failing request and dominant timing only after an explicit reveal.
- ✨ **Timing phase guide** — in the Response Timing tab and the README, stating what browser-observed values cannot prove.
- ✨ **Filter presets** — save, restore and delete up to 20 named column-filter configurations; no captured data is stored.
- ✨ **Shortcut reference** — opened with `?` or the toolbar button, returning focus on Esc or Close.
- 🔧 **Testable filter state** — serialize, deserialize and normalize exported as pure functions, with Jest coverage.
- 🔧 **Contract tests** — static regression tests keep the filter preset and shortcut features from silently disappearing.

## v1.6.0

- 🔧 Responsive and accessibility hardening: vertical stacking at 700 px and below, popups clamped inside the viewport, and WCAG 2.2 AA contrast in every theme.
- 🔧 Strengthened keyboard sorting, column reordering, row/menu/tab navigation, divider resizing, and focus restoration.
- 🔧 Data-integrity hardening: epoch-based time sorting, timing deduplication, protection against late-arriving body races, and consistent selection and statistics under retention pressure.
- ⚡ Switched naturally ordered live capture to per-frame `DocumentFragment` appends, stabilizing batch rendering and search updates.
- ✨ Added request retention limits, per-body and total response-body limits, eviction and omission states, and a retention policy for HAR/SAZ import.
- 🔒 Made HAR, clipboard, cURL, fetch, and PowerShell output sanitized by default, restricting full output to a per-action warning confirmation.
- 🔧 Established CI gates running Jest, ESLint, format, version, text/lock/package integrity, and audit on Node.js 22 and 24.
- 🔒 Removed the unused `downloads` permission and pinned the actually used `storage` permission with an automated regression check.
- 🔧 Added reproducible release ZIP creation containing only the 10 explicitly allowlisted runtime files.

## v1.5.0

- ✨ Merged the global filter and deep search into one integrated multi-keyword search.
- ✨ Gave each keyword its own input, color selection, match count, and ▲▼ navigation.
- ✨ Search targets: URL / Domain / Path / Method / Status / Type plus request and response bodies and headers, with a scope switch.
- ✨ Six per-keyword highlight colors (yellow, red, green, blue, purple, orange) applied to the row background and the text.
- 🐛 Fixed sticky column headers not staying in place.
- 🐛 Fixed the filter operator dropdown showing nothing other than `contains`.
- ⚡ Improved rendering performance under heavy traffic with `requestAnimationFrame` throttling.
- 🔧 Changed the clear-all button icon (🗑️) and design so it is clearly distinct from the stop-capture button.
- 🔧 Moved the record stop/resume button to the far left of the top bar.
- 🔧 Displayed the brand logo (📡 Network+ for DevTools) on a gradient background.
- 🐛 Fixed the caret disappearing while typing in the search input by saving and restoring focus and caret position.
- 🐛 Fixed search results not updating in real time as new requests arrived.

## v1.4.0

- ✨ Stronger per-column filters (Time: time picker; Method: multi-select; Domain/Path: multiple conditions; URL: compound conditions).
- ✨ Fiddler-style tabbed detail inspector with Request and Response sub-tabs.
- ✨ Column resizing.
- ✨ Auto-scroll toggle.
- ✨ Initiator links that open the source file in DevTools.

## v1.3.0

- ✨ HAR export with full HAR 1.2 support.
- ✨ Keyboard navigation with the arrow keys.

## v1.2.0

- ✨ Global filter with debounce.
- ✨ Column sorting (ascending / descending / off).

## v1.1.0

- ✨ Theme switching (System / Dark / Light).
- ✨ Recording control (Pause / Resume).

## v1.0.0

- ✨ Initial release: live capture, custom columns, and column visibility toggles.
