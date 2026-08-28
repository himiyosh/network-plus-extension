# Microsoft Edge Add-ons submission dossier (en-US)

Last reviewed: 2026-08-19

## Submission status and evidence boundary

This dossier is a repository-local recommendation for a future Partner Center submission. It is not evidence that an account exists, a submission was made, certification passed, or a Microsoft Edge Add-ons listing is available.

### Observed repository facts

- `manifest.json` identifies a Manifest V3 DevTools extension named `Network+ for DevTools`, version `1.13.0`, with one permission (`storage`), packaged 16, 48, and 128 pixel icons, and the extension-page CSP `script-src 'self'; object-src 'self'`.
- The checked-in package guard allows only the eleven audited runtime files and rejects remote resources, inline scripts, unexpected privileged manifest surfaces, and permission drift. The one background service worker it admits has a single audited job: minimizing the undocked DevTools window when the pop-out tab opens, through the permissionless chrome.windows API, reading no tab URLs or page data.
- `network-plus-extension-1.13.0.zip` was built from the reviewed commit by `npm run extension:package`. It is 214781 bytes and its SHA-256 is `ec2e5d9804ed24cd9ae3231502321fe25c2b79b3e700341d6d6feb2388c4f8e2`. A second local build reproduced the same digest, and archive entries carry fixed timestamps normalized in local time as of this release, so `npm run extension:package` at tag `v1.13.0` rebuilds the same bytes from any timezone. The publishing workflow compares the archive it builds against this digest and fails the release on a mismatch. The `v1.13.0` release was publicly observable and its asset was re-downloaded on 2026-08-29; the download is 214781 bytes, matches this digest, and is byte-identical to the local build.
- The SHA-256 is safe to publish and useful for integrity checking, but it is not a publisher signature. The operator must obtain the ZIP from the trusted release route and compare the complete digest before upload.

### Checked-in discovery intent

- `package.json` is the reviewable source of intent for the repository/package description, homepage, support route, repository URL, and seven-term search vocabulary. `npm run store:check` ties those values to the reviewed manifest and submission dossier and rejects empty or drifting fields.
- Applying the checked-in intent to GitHub repository settings or a Partner Center listing remains an explicit coordinator/operator action after review.

### Unknown external state

- Partner Center account, product identity, ownership verification, availability, markets, and certification state are unknown and are not claimed.
- No verifiable Microsoft Edge Add-ons listing URL was found in repository evidence. Website and support links therefore use existing public GitHub routes rather than an unverified store route.
- The operator must confirm current Partner Center field labels and category vocabulary before submission because the portal can change independently of this repository.

## Developer account prerequisites

- Register for the Microsoft Edge program in Partner Center using a Microsoft account (MSA) as the Primary Owner. The current Microsoft guide states that Microsoft Edge extension registration has no fee.
- Choose the account country or region, `Individual` or `Company` account type, and publisher display name carefully; the current registration guide states that country/region and account type cannot be changed after enrollment.
- Complete contact details, accept the current developer agreement, and wait for account verification. Company verification can require additional evidence and may take longer.

These are external identity, agreement, and account actions. They are intentionally not performed by repository automation.

## Store properties

**Category recommendation:** `Developer Tools`

**Website URL:** https://github.com/himiyosh/network-plus-extension

**Support URL:** https://github.com/himiyosh/network-plus-extension/issues/new/choose

**Mature content:** `No`

**Availability:** Unknown and not claimed. The Partner Center operator must explicitly choose visibility and markets after reviewing the current distribution plan.

## Store listing (en-US)

**Locale:** `en-US`

**Extension name:** `Network+ for DevTools`

**Short description:** `Network analysis with sanitized HAR, retention limits, integrated search, accessible UI, and keyboard controls.`

### Detailed description

<!-- store-description:start -->
Network+ for DevTools adds a dedicated network-analysis panel to Microsoft Edge DevTools. It is designed for web developers, QA engineers, and support engineers who need to inspect HTTP evidence and share it safely without leaving the DevTools workflow. Sanitized output is the default for every copy and export action, non-UTF-8 responses are decoded with the correct character set, and any two captured requests can be compared side by side.

The request grid captures traffic reported by the Edge DevTools network API and presents method, status, domain, path, type, duration, size, initiator, URL, and optional waterfall information, with color-coded method badges and an optional Operation column that surfaces GraphQL operation names and JSON-RPC methods detected in request bodies. Users can sort and resize columns, choose visible columns, apply per-column filters, save the column-and-filter setup as a view preset, and run a multi-keyword search across URLs, headers, request bodies, and response bodies with match-case, whole-word, and regular-expression options, optionally narrowing the grid to matching rows only. Captured requests are kept across page navigations, so a redirect or reload does not wipe the evidence being examined; rows whose response bodies could not be retrieved in time are labeled rather than silently dropped.

Selecting a request opens request and response inspectors for headers, bodies, query parameters, cookies, raw data, timing phases, and supported previews. Two selected requests can be compared side by side to isolate what changed between a working call and a failing one. The Body and Raw inspector views carry their own keyword search with hit counting, next/previous navigation, and an expand-all action that reveals matches hidden inside collapsed JSON nodes or truncated previews. Response bodies are decoded with the charset declared by the Content-Type header, falling back to a scan of the HTML meta charset, so non-UTF-8 payloads read correctly in both live capture and imported HAR or SAZ files. Scope and match options persist between sessions; search keywords themselves are never stored.

The panel is not confined to the DevTools window. A pop-out action opens Network+ in a full browser tab that mirrors the live capture session, keeping rows, details, and the paused state in sync, which helps on small screens or a second monitor; an undocked DevTools window is minimized automatically at that moment, since capture continues inside it, and a docked DevTools stays as it is. The tab is a full remote control, not just a view: pause and resume, clear with undo, retention changes, HAR or SAZ import, stream capture, and re-sending all execute in the DevTools session over the same extension-internal port, and the tab reflects the session state within a second. An opt-in stream-capture mode records the WebSocket messages the inspected page sends and receives, and the Server-Sent Events it receives, on connections opened while the mode is on, listing them as directional frames in the inspectors; capture is observation only and never alters traffic. HAR files that include WebSocket messages recorded by Chromium-based DevTools are restored the same way on import, and captured conversations round-trip: full HAR exports write the frames back out in the same Chromium shape, while sanitized exports omit them with an explicit per-entry marker.

A captured request can also be re-sent, either unchanged or after editing the method, URL, headers, and body in a dialog. The composed request is issued by the inspected page itself through the DevTools evaluation API, so cookies, CORS, and the page's security policies apply exactly as if the page had made the call, browser-managed headers remain browser-managed, and the reply arrives as a new captured row. A cURL command can also be pasted to prefill the same dialog; unsupported flags are refused by name rather than guessed. JWT-shaped header values such as Bearer tokens decode inline in the header panes with humanized expiry times, locally and for display only; signatures are not verified, and decoded claims never join copies or exports.

Network+ applies local retention the reader controls. Request rows are retained without a count limit by default, and a limit from 100 to 100,000 can be configured in the Settings dialog, which states the memory cost of the unlimited default. Response bodies remain subject to a 1 MiB per-body limit and a 32 MiB shared cache limit. The status bar reports retention and body-cache conditions so omitted or evicted content is not presented as complete evidence. Clear removes the current working set and offers a bounded 10-second Undo action while retained data remains available.

Clipboard copy and HAR export are user-initiated. Sanitized output is the default and redacts or omits sensitive fields according to the documented policy: a request can be copied as a sanitized one-line summary, a Markdown report ready for a bug tracker or chat, or a cURL, fetch, or PowerShell command, and exports can cover the rows currently displayed or only the selected rows. Full output is never the default. Full HAR export and the full body copies in the Request and Response panes require a warning and one-time confirmation for that action; the row menu's full copy formats are reached through a collapsed group labelled `Copy full (unsanitized)`, which names what it hands out at the point of choosing. Network+ does not save a full-output preference. Users should still review any exported or copied data before sharing it.

An empty panel offers three deterministic, local-only sample requests under reserved `.test` domains. The sample sends no network traffic, pauses live capture to avoid mixing evidence, and includes a prompt-first guide for identifying a 503 request, its dominant Wait (TTFB) phase, a Retry-After header, and the limits of browser-observed timing. No account or test credentials are required.

Network+ supports System, Dark, and Light themes, keyboard navigation, visible focus, screen-reader status announcements, responsive panel layouts, and reduced-motion preferences. A Settings dialog gathers language, theme, and capture retention; explanations and every dialog, including the item names in them, are available in Japanese, while toolbar buttons and column headers stay in English so written instructions still match the UI. It runs from packaged extension code without remote code, telemetry, analytics, advertising, or an external service. Network+ reports browser-observed HTTP timing; it does not prove packet loss, cabling or radio-frequency faults, or a definitive server root cause.
<!-- store-description:end -->

### Search terms

The current Microsoft Learn publication guide allows at most seven terms and 21 total words. This recommendation uses seven terms and 14 words.

<!-- search-terms:start -->
- network debugging
- developer tools
- HTTP inspector
- HAR export
- request filtering
- response timing
- Edge DevTools
<!-- search-terms:end -->

## Privacy declarations

**Single-purpose statement:** Network+ provides a local Microsoft Edge DevTools workbench for capturing, filtering, searching, comparing, inspecting, user-initiated exporting, and user-initiated re-sending of HTTP request and response evidence from the inspected page.

**Permission justification (`storage`):** Stores the user-selected System, Dark, or Light theme, the language for explanatory text (System, English, or Japanese), and boolean search preferences (scope checkboxes, case / whole-word / regular-expression options, and the Matches only state) in `chrome.storage.local` so these settings persist between DevTools sessions. This permission is not used to store search keyword text, captured URLs, headers, request bodies, response bodies, cookies, or request records.

**Remote code answer:** `No, I am not using remote code.`

All executable JavaScript and CSS are included in the uploaded package. The Manifest V3 CSP allows scripts only from the extension package and objects only from the extension package.

### Data access, processing, and use

| Question | Recommended disclosure |
|---|---|
| Does the extension handle potentially personal information? | `Yes`. Network traffic can contain personal or sensitive information, and Network+ accesses and processes that traffic locally to provide its user-facing DevTools features. Do not answer `No` merely because processing stays on the device. |
| Data categories | Disclose the current Partner Center categories that cover web browsing activity, website content, URLs, headers, cookies, request bodies, response bodies, and related DevTools metadata. Portal category names must be confirmed at submission time. |
| Purpose | Display, filter, search, compare, retain within documented limits, and export or copy network evidence only as directed by the user. |
| Collection by the developer | None. Captured traffic is not sent to or stored in developer-controlled systems. |
| Transmission to third parties | None by the extension. There is no telemetry, analytics, advertising, account service, or external SDK. |
| Outbound links | The optional support entry — the Network+ brand button in the toolbar (the mark with the pixel otter and coffee cup) — opens a Support dialog listing https://github.com/sponsors/himiyosh and https://ko-fi.com/studio344. The dialog issues no network request, embeds no payment form, checkout, or third-party script, gates no functionality, and stores no state. Each link opens a normal browser tab where that site's own practices apply and where any payment is completed; no payment or account data is entered into or handled by the extension. |
| Sale, lending, advertising, or unrelated use | None. |
| Human access by the developer | None through the extension. A user independently choosing to post information to the public GitHub support route is outside the extension's automatic data flow and should avoid sensitive traffic. |
| Persistent local data | UI preferences only: theme, explanatory-text language, retention setting, column order/visibility/widths, and one saved view preset (column visibility + filter rules). Filter-rule values can include text entered by the user, but Network+ does not persist captured traffic records, headers, or bodies as presets. |
| User-created output | Clipboard payloads and HAR files are created only after a user action. Sanitized output is the default; full output is never the default, is always labelled as unsanitized, requires one-time confirmation for HAR export and for full body copies, and can contain sensitive information. |

**Privacy policy URL:** https://github.com/himiyosh/network-plus-extension/blob/main/docs/privacy.md

The policy URL must be checked from a signed-out browser after this document is merged and before it is entered in Partner Center.

## Updating an already-listed extension

The sections above describe a first submission. When a Partner Center product already exists for this extension, the work is a package update against that product: the account prerequisites are already satisfied and no new product is created.

- The `manifest.json` version must be strictly higher than the version the store currently carries. v1.13.0 satisfies this against v1.12.0, and the release workflow refuses to publish a version that already has a GitHub release, so a version cannot be silently reused.
- Upload `network-plus-extension-1.13.0.zip` obtained from the trusted release route into the existing product's package section, and compare the complete 64-character SHA-256 recorded above against the downloaded file before submitting.
- Re-check the listing text, screenshots, and privacy answers against this dossier. The listing is not versioned in the portal, so a stale screenshot or description stays live until it is replaced; the four 1280 x 800 screenshots in `docs/store-assets/` were re-captured for this version because the toolbar mark and status bar changed. The image swap itself is scripted: `npm run store:pages -- edge` clears the slots it is replacing and uploads the current contents of `docs/store-assets/` as a draft, submitting nothing. It runs on the operator's machine, not in CI. The slot-by-slot procedure below remains the fallback when a console changes shape under it.
- Certification notes for an update should say what changed. The `## v1.13.0` section of `docs/CHANGELOG.md` is the reviewed source for that text.
- An update is a fresh certification pass. Availability, markets, and visibility carry over from the existing product unless the operator changes them, and the previously certified package stays live until the new one passes.
- Field labels and the navigation path for package updates must be confirmed in the live portal, which can change independently of this repository.

## Automated submission

`npm run store:submit -- --store edge` uploads the packaged archive to the existing Partner Center product and publishes the draft submission through the Update API v1.1. The `Submit to Stores` workflow runs it automatically when a GitHub release is published, and can also be run on demand from the Actions tab.

Before uploading anything, the script rebuilds the archive and compares its SHA-256 against the digest recorded in this dossier. A mismatch aborts the run, so the store can only receive bytes that passed review here.

### Credentials

The workflow reads three repository secrets and never writes their values to the log. Partner Center shows both values when an API key is created; the API key is displayed once.

| Secret | Where it comes from |
|---|---|
| `EDGE_PRODUCT_ID` | The product ID of the existing Partner Center product |
| `EDGE_CLIENT_ID` | The client ID shown with the Partner Center API key |
| `EDGE_API_KEY` | The API key created in Partner Center |

The secrets belong to the `store-submission` GitHub Actions environment. Adding a required reviewer to that environment makes every submission wait for a human approval; leaving it without rules lets the workflow submit unattended.

### Failure modes the operator must expect

- A version that is not strictly higher than the published one is rejected at upload. The release workflow already refuses to republish a version, so this can only happen if the store carries a newer version than the repository.
- Certification runs after the submission is accepted. A `Succeeded` publish operation means the submission was accepted for certification, not that it is live.
- The API key is displayed once at creation and expires; when it does, the upload fails with an authorization error and the key must be replaced in the repository secret.

## Certification testing notes

No account, credentials, subscription, remote service, or live customer traffic is required.

1. Use the exact ZIP uploaded for certification. For repository-side reproduction, run `npm run extension:package`, extract `dist/network-plus-extension-1.13.0.zip` into a new folder, open `edge://extensions/`, enable Developer mode, choose `Load unpacked`, and select the extracted folder. A ZIP file itself is not selected by `Load unpacked`.
2. Open a local blank page such as `data:text/html,<title>Network%2B%20certification</title>`, open Microsoft Edge DevTools, and select the `Network+` panel.
3. With no captured requests, select `Explore sample capture`. Verify that exactly three synthetic requests appear: a 200 GET to `api.network-plus.test`, a 503 POST to `checkout.network-plus.test`, and a 304 GET to `static.network-plus.test`. The status must state `No network traffic was sent.` and that live recording is paused.
4. Select the 503 `POST /v1/orders/preview` request. Open the Response `Timing` tab and verify a total duration of 2,450 ms, with `Wait (TTFB)` at 2,200 ms as the dominant phase. Open `What do the timing phases mean?` and verify that the guidance says browser timing does not prove packet loss, cabling or RF faults, or a definitive server root cause.
5. Select `Sample guide`. Before selecting `Reveal evidence`, verify that only four investigation questions are shown. Select `Reveal evidence` and verify the failed request, HTTP 503, 2,450 ms total, `Wait (TTFB) · 2,200 ms`, `Retry-After: 30 seconds`, and the browser-evidence limitation.
6. Select the export action, then select `Export sanitized HAR`. Verify that `network-plus-sanitized.har` is downloaded only after the user action and that the HAR records the sanitization policy. Do not select full output for routine certification evidence.
7. Select `Clear`. Verify that the sample rows and details disappear, recording returns to its prior state, and `Undo clear` is offered for 10 seconds. Select `Undo clear` once to restore the bounded snapshot, then select `Clear` again to exit sample mode.
8. Select the Network+ brand button in the toolbar (the mark with the pixel otter and coffee cup). Verify that the Support dialog opens, lists the GitHub Sponsors and Ko-fi links, states that Network+ sends them no data, contains no payment form, and issues no network request when opened. Verify that each option exposes one action that opens its page in a browser tab, that no clipboard write occurs, and that `Esc` or `Close` returns focus to the brand button.

## Asset inventory

Each screenshot is a 1280 x 800 composition: a one-line headline band above an unscaled, natively captured panel view. The panel content depicts only deterministic data produced by `createSampleCaptureRequests()` in `panel.js`. The `.test` domains are reserved for examples. The captures contain no real browsing history, credentials, customer traffic, account UI, private data, store UI, or certification status.

| File | Depicted state | Synthetic evidence |
|---|---|---|
| `docs/store-assets/logo-300.png` | 300 x 300 Network+ logo derived from the checked-in extension mark | No traffic data |
| `docs/store-assets/chrome-small-promo-440x280.png` | 440 x 280 text-free brand tile: the otter investigator illustration beside the extension icon | No traffic data; fills the Edge Small promotional tile slot and the Chrome required small-promo slot |
| `docs/store-assets/chrome-marquee-1400x560.png` | 1400 x 560 brand marquee: the same scene with the wordmark and feature tagline | No traffic data; fills the Edge Large promotional tile slot (1400 x 560 per the Partner Center listing guide) and the Chrome marquee slot |
| `docs/store-assets/screenshot-1-request-detail-1280x800.png` | Request grid with the synthetic 503 row selected and response headers visible | `checkout.network-plus.test`, `Retry-After: 30`, local sample status |
| `docs/store-assets/screenshot-2-timing-guidance-1280x800.png` | Response Timing view and timing interpretation guidance | 2,450 ms total, 2,200 ms Wait (TTFB), browser-evidence limitation |
| `docs/store-assets/screenshot-3-sample-guide-1280x800.png` | Prompt-first Sample evidence guide before reveal | Four questions only; no answer is revealed in this capture |
| `docs/store-assets/screenshot-4-sanitized-export-1280x800.png` | User-initiated export dialog with the sanitized HAR action as the safe default | No real captured values; full-output boundary is stated |

Machine-readable provenance and expected dimensions are recorded in `docs/store-assets/inventory.json` and enforced by `npm run store:check`.

## Source record

| Source | Observed document metadata | Accessed | Use in this dossier |
|---|---|---|---|
| [Register as a Microsoft Edge extension developer](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account) | Current Microsoft Edge program registration guide | 2026-08-14 | No-fee registration, account type, publisher identity, agreement, and verification prerequisites |
| [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) | Current Microsoft Edge publication guide | 2026-08-14 | Required listing fields, 250-10,000 character description, 300 x 300 recommended logo, optional 440 x 280 small tile, allowed screenshot dimensions, privacy declarations, search-term limits, and certification notes |
| [Developer policies for the Microsoft Edge Add-ons store](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) | Microsoft Edge Add-ons developer policies | 2026-08-14 | Accurate representation, single purpose, testability, permission minimization, screenshot clarity, and personal-information disclosure |
| [Public repository](https://github.com/himiyosh/network-plus-extension) | Public GitHub repository | 2026-08-14 | Website route and repository evidence |
| [Public support route](https://github.com/himiyosh/network-plus-extension/issues/new/choose) | Existing GitHub Issues chooser route | 2026-08-14 | Support contact route |
| [Public v1.7.0 release](https://github.com/himiyosh/network-plus-extension/releases/tag/v1.7.0) | Release published 2026-08-14 with one 140249-byte ZIP asset; SHA-256 re-verified from a fresh download | 2026-08-14 | Last publicly observed release; superseded as the upload source by v1.8.0 |
| [Public v1.8.0 release](https://github.com/himiyosh/network-plus-extension/releases/tag/v1.8.0) | Released 2026-08-18 by the tag-triggered publishing workflow with one 150672-byte ZIP asset; SHA-256 re-verified from a fresh download | 2026-08-18 | Superseded as the upload source by v1.9.0 |
| [Public v1.9.0 release](https://github.com/himiyosh/network-plus-extension/releases/tag/v1.9.0) | Released 2026-08-19 by the main-push publishing workflow with one 151681-byte ZIP asset; SHA-256 re-verified from a fresh download and byte-compared against the local build | 2026-08-19 | Superseded as the upload source by v1.10.0 |
| [Public v1.10.0 release](https://github.com/himiyosh/network-plus-extension/releases/tag/v1.10.0) | Released 2026-08-20 by the main-push publishing workflow with one 152096-byte ZIP asset; SHA-256 re-verified from a fresh download and byte-compared against the local build | 2026-08-21 | Superseded as the upload source by v1.11.0 |
| [Public v1.11.0 release](https://github.com/himiyosh/network-plus-extension/releases/tag/v1.11.0) | Released 2026-08-21 by the main-push publishing workflow with one 152202-byte ZIP asset; SHA-256 re-verified from a fresh download and byte-compared against the local build | 2026-08-21 | Superseded as the upload source by v1.12.0 |
| [Public v1.12.0 release](https://github.com/himiyosh/network-plus-extension/releases/tag/v1.12.0) | Released 2026-08-26 by the main-push publishing workflow with one 206937-byte ZIP asset; SHA-256 re-verified from a fresh download and byte-compared against a `TZ=UTC` local build | 2026-08-27 | Superseded as the upload source by v1.13.0 |
| [Public v1.13.0 release](https://github.com/himiyosh/network-plus-extension/releases/tag/v1.13.0) | Released 2026-08-28 by the main-push publishing workflow with one 214781-byte ZIP asset; SHA-256 re-verified from a fresh download and byte-compared against local builds from two timezones | 2026-08-29 | Current upload source |
