# Microsoft Edge Add-ons submission dossier (en-US)

Last reviewed: 2026-07-28

## Submission status and evidence boundary

This dossier is a repository-local recommendation for a future Partner Center submission. It is not evidence that an account exists, a submission was made, certification passed, or a Microsoft Edge Add-ons listing is available.

### Observed repository facts

- `manifest.json` identifies a Manifest V3 DevTools extension named `Network+ for DevTools`, version `1.6.0`, with one permission (`storage`), packaged 16, 48, and 128 pixel icons, and the extension-page CSP `script-src 'self'; object-src 'self'`.
- The checked-in package guard allows only the ten audited runtime files and rejects remote resources, inline scripts, unexpected privileged manifest surfaces, and permission drift.
- GitHub release `v1.6.0` and `network-plus-extension-1.6.0.zip` were publicly observable on 2026-07-27. The asset download count was 0 at that observation time; this point-in-time repository statistic is not an adoption or store-distribution claim.
- A read-only GitHub query still returned an empty live repository description, homepage, and topic list on 2026-07-28. This point-in-time observation describes external state; the repository-local kit does not change those settings.

### Checked-in discovery intent

- `package.json` is the reviewable source of intent for the repository/package description, homepage, support route, repository URL, and seven-term search vocabulary. `npm run store:check` ties those values to the reviewed manifest and submission dossier and rejects empty or drifting fields.
- Applying the checked-in intent to GitHub repository settings or a Partner Center listing remains an explicit coordinator/operator action after review.

### Unknown external state

- Partner Center account, product identity, ownership verification, availability, markets, and certification state are unknown and are not claimed.
- No verifiable Microsoft Edge Add-ons listing URL was found in repository evidence. Website and support links therefore use existing public GitHub routes rather than an unverified store route.
- The operator must confirm current Partner Center field labels and category vocabulary before submission because the portal can change independently of this repository.

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
Network+ for DevTools adds a dedicated network-analysis panel to Microsoft Edge DevTools. It is designed for web developers, QA engineers, and support engineers who need to inspect HTTP evidence without leaving the DevTools workflow.

The request grid captures traffic reported by the Edge DevTools network API and presents method, status, domain, path, type, duration, size, initiator, URL, and optional waterfall information. Users can sort and resize columns, choose visible columns, apply per-column filters, save filter presets, and search across URLs, headers, request bodies, and response bodies. Selecting a request opens request and response inspectors for headers, bodies, query parameters, cookies, raw data, timing phases, and supported previews. Two selected requests can be compared side by side.

Network+ applies bounded local retention. The default request limit is 5,000, configurable from 100 to 100,000; an explicitly confirmed unlimited request mode is also available. Response bodies remain subject to a 1 MiB per-body limit and a 32 MiB shared cache limit. The status bar reports retention and body-cache conditions so omitted or evicted content is not presented as complete evidence. Clear removes the current working set and offers a bounded 10-second Undo action while retained data remains available.

Clipboard copy and HAR export are user-initiated. Sanitized output is the default and redacts or omits sensitive fields according to the documented policy. Full output requires a warning and one-time confirmation for that action, and Network+ does not save a full-output preference. Users should still review any exported or copied data before sharing it.

An empty panel offers three deterministic, local-only sample requests under reserved `.test` domains. The sample sends no network traffic, pauses live capture to avoid mixing evidence, and includes a prompt-first guide for identifying a 503 request, its dominant Wait (TTFB) phase, a Retry-After header, and the limits of browser-observed timing. No account or test credentials are required.

Network+ supports System, Dark, and Light themes, keyboard navigation, visible focus, screen-reader status announcements, responsive panel layouts, and reduced-motion preferences. It runs from packaged extension code without remote code, telemetry, analytics, advertising, or an external service. Network+ reports browser-observed HTTP timing; it does not prove packet loss, cabling or radio-frequency faults, or a definitive server root cause.
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

**Single-purpose statement:** Network+ provides a local Microsoft Edge DevTools workbench for capturing, filtering, searching, comparing, inspecting, and user-initiated exporting of HTTP request and response evidence from the inspected page.

**Permission justification (`storage`):** Stores the user-selected System, Dark, or Light theme in `chrome.storage.local` so the visual preference persists between DevTools sessions. This permission is not used to store captured URLs, headers, request bodies, response bodies, cookies, or request records.

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
| Sale, lending, advertising, or unrelated use | None. |
| Human access by the developer | None through the extension. A user independently choosing to post information to the public GitHub support route is outside the extension's automatic data flow and should avoid sensitive traffic. |
| Persistent local data | UI preferences only: theme, retention setting, column order/visibility/widths, and named filter preset configuration. Filter preset values can include text entered by the user, but Network+ does not persist captured traffic records, headers, or bodies as presets. |
| User-created output | Clipboard payloads and HAR files are created only after a user action. Sanitized output is the default; full output requires one-time confirmation and can contain sensitive information. |

**Privacy policy URL:** https://github.com/himiyosh/network-plus-extension/blob/main/docs/privacy.md

The policy URL must be checked from a signed-out browser after this document is merged and before it is entered in Partner Center.

## Certification testing notes

No account, credentials, subscription, remote service, or live customer traffic is required.

1. Use the exact ZIP uploaded for certification. For repository-side reproduction, run `npm run extension:package`, extract `dist/network-plus-extension-1.6.0.zip` into a new folder, open `edge://extensions/`, enable Developer mode, choose `Load unpacked`, and select the extracted folder. A ZIP file itself is not selected by `Load unpacked`.
2. Open a local blank page such as `data:text/html,<title>Network%2B%20certification</title>`, open Microsoft Edge DevTools, and select the `Network+` panel.
3. With no captured requests, select `Explore sample capture`. Verify that exactly three synthetic requests appear: a 200 GET to `api.network-plus.test`, a 503 POST to `checkout.network-plus.test`, and a 304 GET to `static.network-plus.test`. The status must state `No network traffic was sent.` and that live recording is paused.
4. Select the 503 `POST /v1/orders/preview` request. Open the Response `Timing` tab and verify a total duration of 2,450 ms, with `Wait (TTFB)` at 2,200 ms as the dominant phase. Open `What do the timing phases mean?` and verify that the guidance says browser timing does not prove packet loss, cabling or RF faults, or a definitive server root cause.
5. Select `Sample guide`. Before selecting `Reveal evidence`, verify that only four investigation questions are shown. Select `Reveal evidence` and verify the failed request, HTTP 503, 2,450 ms total, `Wait (TTFB) · 2,200 ms`, `Retry-After: 30 seconds`, and the browser-evidence limitation.
6. Select the export action, then select `Export sanitized HAR`. Verify that `network-plus-sanitized.har` is downloaded only after the user action and that the HAR records the sanitization policy. Do not select full output for routine certification evidence.
7. Select `Clear`. Verify that the sample rows and details disappear, recording returns to its prior state, and `Undo clear` is offered for 10 seconds. Select `Undo clear` once to restore the bounded snapshot, then select `Clear` again to exit sample mode.

## Asset inventory

All screenshots are 1280 x 800 PNG files and depict only deterministic data produced by `createSampleCaptureRequests()` in `panel.js`. The `.test` domains are reserved for examples. The captures contain no real browsing history, credentials, customer traffic, account UI, private data, store UI, or certification status.

| File | Depicted state | Synthetic evidence |
|---|---|---|
| `docs/store-assets/logo-300.png` | 300 x 300 Network+ logo derived from the checked-in extension mark | No traffic data |
| `docs/store-assets/screenshot-request-detail-1280x800.png` | Request grid with the synthetic 503 row selected and response headers visible | `checkout.network-plus.test`, `Retry-After: 30`, local sample status |
| `docs/store-assets/screenshot-timing-guidance-1280x800.png` | Response Timing view and timing interpretation guidance | 2,450 ms total, 2,200 ms Wait (TTFB), browser-evidence limitation |
| `docs/store-assets/screenshot-sample-guide-1280x800.png` | Prompt-first Sample evidence guide before reveal | Four questions only; no answer is revealed in this capture |
| `docs/store-assets/screenshot-sanitized-export-1280x800.png` | User-initiated export dialog with the sanitized HAR action as the safe default | No real captured values; full-output boundary is stated |

Machine-readable provenance and expected dimensions are recorded in `docs/store-assets/inventory.json` and enforced by `npm run store:check`.

## Source record

| Source | Observed document metadata | Accessed | Use in this dossier |
|---|---|---|---|
| [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) | Microsoft Learn page updated 2026-06-12; page metadata date 2026-05-05 | 2026-07-27 | Required listing fields, 250-10,000 character description, 300 x 300 recommended logo, allowed screenshot dimensions, privacy declarations, search-term limits, and certification notes |
| [Developer policies for the Microsoft Edge Add-ons store](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) | Microsoft Learn page updated 2026-07-24 | 2026-07-27 | Accurate representation, single purpose, testability, permission minimization, screenshot clarity, and personal-information disclosure |
| [Public repository](https://github.com/himiyosh/network-plus-extension) | Public GitHub repository; live description, homepage, and topics empty when queried read-only | 2026-07-28 | External-state observation, website route, and repository evidence |
| [Public support route](https://github.com/himiyosh/network-plus-extension/issues/new/choose) | Existing GitHub Issues chooser route | 2026-07-27 | Support contact route |
| [Public v1.6.0 release](https://github.com/himiyosh/network-plus-extension/releases/tag/v1.6.0) | Release published 2026-07-24 with one 87,775-byte ZIP asset | 2026-07-27 | Existing release-ZIP onboarding evidence only; not store-listing evidence |
