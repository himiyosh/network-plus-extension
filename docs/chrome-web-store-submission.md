# Chrome Web Store submission dossier (en-US)

Last reviewed: 2026-08-19

## Submission status and evidence boundary

This dossier is a repository-local recommendation for a future Chrome Web Store submission. It is not evidence that a Chrome Web Store developer account exists, a registration fee was paid, a submission was made, review passed, or a public listing is available.

### Upload artifact

- **Release:** `v1.11.0`
- **ZIP:** `network-plus-extension-1.11.0.zip`
- **Size:** `152202 bytes`
- **SHA-256:** `85ea3db4faf0f4a0445420f6e40408a50e9b004a720213bbdb7b2610d36ef91b`
- **Download:** https://github.com/himiyosh/network-plus-extension/releases/download/v1.11.0/network-plus-extension-1.11.0.zip

The ZIP was downloaded from the public GitHub release on 2026-08-21 and its size and SHA-256 were re-verified; the downloaded file is byte-identical to the local build. Archive entries carry fixed timestamps, so `npm run extension:package` at tag `v1.11.0` reproduces the same bytes, and the publishing workflow refuses to create a release whose archive does not match this digest. The digest is safe to publish and is useful for integrity checking, but it is not a publisher signature: an operator must still obtain the ZIP from the trusted release route and compare the complete 64-character value before upload.

### Observed repository facts

- `manifest.json` identifies a Manifest V3 DevTools extension named `Network+ for DevTools`, version `1.11.0`, with one permission (`storage`), packaged 16, 48, and 128 pixel PNG icons, and the extension-page CSP `script-src 'self'; object-src 'self'`.
- The package guard allows only the eleven audited runtime files and rejects remote resources, inline scripts, unexpected privileged manifest surfaces, and permission drift. The one background service worker it admits has a single audited job: minimizing the undocked DevTools window when the pop-out tab opens, through the permissionless chrome.windows API, reading no tab URLs or page data.
- The same runtime uses Chromium extension APIs without an Edge-only code path. Chrome 151 loaded the manifest without extension errors, all 98 real-browser regression scenarios passed, and the Network+ DevTools panel was confirmed manually.
- The public `v1.11.0` GitHub release is the current repository-backed upload source. Repository evidence does not establish any Chrome Web Store account, item ID, listing URL, review result, or publication state.

## Developer account prerequisites

- Register the long-term owner email in the Chrome Web Store Developer Dashboard. The email cannot be changed after account creation; transferring an item requires a separate process.
- Accept the current Chrome Web Store developer agreement and policies.
- Pay the one-time developer registration fee shown by the live dashboard. Google's public registration guide confirms that a fee is required but does not state a universal amount, so the operator must verify the amount and currency before payment.
- Complete the developer-account contact and publisher information and verify the developer email before submitting an item.

These are external account, payment, identity, and agreement actions. They are intentionally not performed by repository automation.

## Store listing (en-US)

**Primary language:** `English (United States)`

**Extension name:** `Network+ for DevTools`

**Summary:** `Network analysis with sanitized HAR, retention limits, integrated search, accessible UI, and keyboard controls.`

**Category recommendation:** `Developer Tools`

**Homepage URL:** https://github.com/himiyosh/network-plus-extension

**Support URL:** https://github.com/himiyosh/network-plus-extension/issues/new/choose

### Detailed description

<!-- chrome-store-description:start -->
Network+ for DevTools adds a dedicated network-analysis panel to Google Chrome DevTools. It is designed for web developers, QA engineers, and support engineers who need to inspect HTTP evidence and share it safely without leaving the DevTools workflow. Sanitized output is the default for every copy and export action, non-UTF-8 responses are decoded with the correct character set, and any two captured requests can be compared side by side.

The request grid captures traffic reported by the Chrome DevTools network API and presents method, status, domain, path, type, duration, size, initiator, URL, and optional waterfall information, with color-coded method badges and an optional Operation column that surfaces GraphQL operation names and JSON-RPC methods detected in request bodies. Users can sort and resize columns, choose visible columns, apply per-column filters, save the column-and-filter setup as a view preset, and run a multi-keyword search across URLs, headers, request bodies, and response bodies with match-case, whole-word, and regular-expression options, optionally narrowing the grid to matching rows only. Captured requests are kept across page navigations, so a redirect or reload does not wipe the evidence being examined; rows whose response bodies could not be retrieved in time are labeled rather than silently dropped.

Selecting a request opens request and response inspectors for headers, bodies, query parameters, cookies, raw data, timing phases, and supported previews. Two selected requests can be compared side by side to isolate what changed between a working call and a failing one. The Body and Raw inspector views carry their own keyword search with hit counting, next/previous navigation, and an expand-all action that reveals matches hidden inside collapsed JSON nodes or truncated previews. Response bodies are decoded with the charset declared by the Content-Type header, falling back to a scan of the HTML meta charset, so non-UTF-8 payloads read correctly in both live capture and imported HAR or SAZ files. Scope and match options persist between sessions; search keywords themselves are never stored.

The panel is not confined to the DevTools window. A pop-out action opens Network+ in a full browser tab that mirrors the live capture session, keeping rows, details, and the paused state in sync, which helps on small screens or a second monitor; an undocked DevTools window is minimized automatically at that moment, since capture continues inside it, and a docked DevTools stays as it is. The tab is a full remote control, not just a view: pause and resume, clear with undo, retention changes, HAR or SAZ import, stream capture, and re-sending all execute in the DevTools session over the same extension-internal port, and the tab reflects the session state within a second. An opt-in stream-capture mode records the WebSocket messages the inspected page sends and receives, and the Server-Sent Events it receives, on connections opened while the mode is on, listing them as directional frames in the inspectors; capture is observation only and never alters traffic. HAR files that include WebSocket messages recorded by Chromium-based DevTools are restored the same way on import, and captured conversations round-trip: full HAR exports write the frames back out in the same Chromium shape, while sanitized exports omit them with an explicit per-entry marker.

A captured request can also be re-sent, either unchanged or after editing the method, URL, headers, and body in a dialog. The composed request is issued by the inspected page itself through the DevTools evaluation API, so cookies, CORS, and the page's security policies apply exactly as if the page had made the call, browser-managed headers remain browser-managed, and the reply arrives as a new captured row. A cURL command can also be pasted to prefill the same dialog; unsupported flags are refused by name rather than guessed. JWT-shaped header values such as Bearer tokens decode inline in the header panes with humanized expiry times, locally and for display only; signatures are not verified, and decoded claims never join copies or exports.

Network+ applies local retention the reader controls. Request rows are retained without a count limit by default, and a limit from 100 to 100,000 can be configured in the Settings dialog, which states the memory cost of the unlimited default. Response bodies remain subject to a 1 MiB per-body limit and a 32 MiB shared cache limit. The status bar reports retention and body-cache conditions so omitted or evicted content is not presented as complete evidence. Clear removes the current working set and offers a bounded 10-second Undo action while retained data remains available.

Clipboard copy and HAR export are user-initiated. Sanitized output is the default and redacts or omits sensitive fields according to the documented policy: a request can be copied as a sanitized one-line summary, a Markdown report ready for a bug tracker or chat, or a cURL, fetch, or PowerShell command, and exports can cover the rows currently displayed or only the selected rows. Full output requires a warning and one-time confirmation for that action, and Network+ does not save a full-output preference. Users should still review any exported or copied data before sharing it.

An empty panel offers three deterministic, local-only sample requests under reserved `.test` domains. The sample sends no network traffic, pauses live capture to avoid mixing evidence, and includes a prompt-first guide for identifying a 503 request, its dominant Wait (TTFB) phase, a Retry-After header, and the limits of browser-observed timing. No account or test credentials are required.

Network+ supports System, Dark, and Light themes, keyboard navigation, visible focus, screen-reader status announcements, responsive panel layouts, and reduced-motion preferences. A Settings dialog gathers language, theme, and capture retention; explanations and every dialog, including the item names in them, are available in Japanese, while toolbar buttons and column headers stay in English so written instructions still match the UI. It runs from packaged extension code without remote code, telemetry, analytics, advertising, or an external service. Network+ reports browser-observed HTTP timing; it does not prove packet loss, cabling or radio-frequency faults, or a definitive server root cause. Every feature is free. Optional GitHub Sponsors and Ko-fi links open in ordinary browser tabs; the extension embeds no checkout and receives no payment or account data.
<!-- chrome-store-description:end -->

Do not add unrelated search phrases to the description. Chrome Web Store metadata must describe the extension naturally and comply with the keyword-spam policy.

## Graphic assets

| Dashboard field | File | Status and notes |
|---|---|---|
| Store icon | `icons/icon128.png` | Required 128 x 128 PNG packaged in the ZIP. The current artwork is usable; Google's transparent-padding guidance should be treated as a visual-quality recommendation and rechecked in the dashboard preview. |
| Small promo tile | `docs/store-assets/chrome-small-promo-440x280.png` | Required 440 x 280 PNG. Text-free full-bleed tile: the otter investigator illustration beside the extension icon — the original illustrated mascot the listing shipped with. |
| Marquee promo | `docs/store-assets/chrome-marquee-1400x560.png` | Optional 1400 x 560 PNG for featured placements: the same brand scene with the wordmark and the feature tagline. The identical file fills the Microsoft Edge Large promotional tile slot, which uses the same dimensions. |
| Screenshot 1 | `docs/store-assets/screenshot-1-request-detail-1280x800.png` | Required screenshot set; headline band over an unscaled synthetic capture: 503 request and response headers. |
| Screenshot 2 | `docs/store-assets/screenshot-2-timing-guidance-1280x800.png` | Synthetic timing evidence and observability guidance. |
| Screenshot 3 | `docs/store-assets/screenshot-3-sample-guide-1280x800.png` | Prompt-first sample guide before evidence reveal. |
| Screenshot 4 | `docs/store-assets/screenshot-4-sanitized-export-1280x800.png` | Sanitized HAR export shown as the safe default. |
| Marquee promo tile | Not prepared | Optional 1400 x 560 asset; not needed for the first submission. |
| YouTube video | Not supplied | Optional; the screenshots and deterministic test path are sufficient for the first review. |

The four screenshots use only deterministic `.test` sample data and contain no real browsing history, credentials, customer traffic, private account UI, store UI, or review state. Machine-readable provenance and dimensions are recorded in `docs/store-assets/inventory.json` and enforced by `npm run store:check`.

## Privacy practices

**Single-purpose description:** Network+ provides a local Google Chrome DevTools workbench for capturing, filtering, searching, comparing, inspecting, user-initiated exporting, and user-initiated re-sending of HTTP request and response evidence from the inspected page.

**Permission justification (`storage`):** Stores the user-selected System, Dark, or Light theme, the language for explanatory text (System, English, or Japanese), and boolean search preferences (scope checkboxes, case / whole-word / regular-expression options, and the Matches only state) in `chrome.storage.local` so these settings persist between DevTools sessions. This permission is not used to store search keyword text, captured URLs, headers, request bodies, response bodies, cookies, or request records.

**Remote code answer:** `No, I am not using remote code.`

All executable JavaScript and CSS are included in the uploaded package. The Manifest V3 CSP allows scripts and objects only from the extension package.

### Data-use disclosure

Do not select a no-data answer merely because processing remains on the device. Chrome's User Data FAQ explicitly requires disclosure for local-only processing and identifies domains, URLs, HTTP requests and responses, and cookies as user data.

The user deliberately opens the Network+ DevTools panel to inspect traffic; Network+ has no content script, background worker, or hidden browsing-history collector. If the live dashboard or reviewer determines that a separate prominent in-product disclosure and consent step is required, pause the submission and add that behavior in a newly versioned extension package. A store description or privacy-policy link alone does not satisfy a required in-product disclosure.

Use the current dashboard labels and apply this conservative mapping:

| Dashboard decision | Recommended answer |
|---|---|
| Data types | Select at least the categories corresponding to `Web history` and `Website content`. Because inspected request and response values can also contain authentication, personal, communication, user-generated, financial, health, or location information, select each current dashboard category whose definition covers values visible in arbitrary HTTP traffic; do not claim that Network+ can technically exclude those values before local inspection. |
| Purpose | Provide the extension's visible network-inspection, search, comparison, retention, clipboard, and export features at the user's direction. |
| Developer collection | None. Captured traffic is not sent to or stored in developer-controlled systems. |
| Third-party transfer | None by Network+. There is no telemetry, analytics, advertising, account service, or external SDK. |
| Persistent storage | UI preferences and named filter configuration only. Captured request and response records, headers, bodies, cookies, and search results are not persisted by Network+. |
| User-created output | Clipboard payloads and HAR files are created only after a user action. Sanitized output is the default; full output requires a warning and one-time confirmation. |
| Human access | None through the extension. A user independently posting information to a public GitHub issue is outside the automatic extension data flow. |
| Sale or advertising use | None. Data is not sold, used for creditworthiness, or used for personalized, retargeted, or interest-based advertising. |
| Limited-use certification | Certify only after confirming that the live statements match the submitted version. The repository behavior is designed to satisfy allowed-use, allowed-transfer, prohibited-advertising, and prohibited-human-access limits. |

**Privacy policy URL:** https://github.com/himiyosh/network-plus-extension/blob/main/docs/privacy.md

The policy URL must be opened in a signed-out browser after these changes are merged and before it is entered in the dashboard.

### Optional support links and payments

The Network+ brand button in the toolbar (the mark with the pixel otter and coffee cup) opens a local Support dialog with user-activated links to https://github.com/sponsors/himiyosh and https://ko-fi.com/studio344. It does not embed a payment form, add affiliate codes, gate functionality, transmit captured traffic, or receive payment, card, or account data. Every feature remains free. Record these facts in reviewer notes so the optional donation routes are not mistaken for paid extension functionality. Final policy acceptance is determined by Chrome Web Store review.

## Distribution recommendation

- **Visibility:** `Public`
- **Regions:** `All regions`, unless the owner has a legal, support, or policy reason to exclude a market.
- **Pricing:** Free; no feature requires payment.
- **Publishing:** Prefer deferred publishing for the first submission. After approval, verify the listing, privacy text, screenshots, and install flow before manually publishing within the dashboard's allowed staging window.

The owner must make the final external distribution decision. Private, unlisted, and public items are all subject to Chrome Web Store review and policy requirements.

## Test instructions

No account, credentials, subscription, remote service, or live customer traffic is required.

1. Use the exact ZIP identified under Upload artifact. For local reproduction, extract it into a new folder, open `chrome://extensions/`, enable Developer mode, choose `Load unpacked`, and select the extracted folder. A ZIP file itself is not selected by `Load unpacked`.
2. Open a local blank page such as `data:text/html,<title>Network%2B%20certification</title>`, open Google Chrome DevTools, and select the `Network+` panel.
3. With no captured requests, select `Explore sample capture`. Verify that exactly three synthetic requests appear: a 200 GET to `api.network-plus.test`, a 503 POST to `checkout.network-plus.test`, and a 304 GET to `static.network-plus.test`. The status must state `No network traffic was sent.` and that live recording is paused.
4. Select the 503 `POST /v1/orders/preview` request. Open the Response `Timing` tab and verify a total duration of 2,450 ms, with `Wait (TTFB)` at 2,200 ms as the dominant phase. Open `What do the timing phases mean?` and verify that the guidance says browser timing does not prove packet loss, cabling or RF faults, or a definitive server root cause.
5. Select `Sample guide`. Before selecting `Reveal evidence`, verify that only four investigation questions are shown. Select `Reveal evidence` and verify the failed request, HTTP 503, 2,450 ms total, `Wait (TTFB) · 2,200 ms`, `Retry-After: 30 seconds`, and the browser-evidence limitation.
6. Select the export action, then select `Export sanitized HAR`. Verify that `network-plus-sanitized.har` is downloaded only after the user action and that the HAR records the sanitization policy. Do not select full output for routine review evidence.
7. Select `Clear`. Verify that the sample rows and details disappear, recording returns to its prior state, and `Undo clear` is offered for 10 seconds. Select `Undo clear` once to restore the bounded snapshot, then select `Clear` again to exit sample mode.
8. Select the Network+ brand button in the toolbar (the mark with the pixel otter and coffee cup). Verify that the Support dialog opens, lists the GitHub Sponsors and Ko-fi links, states that Network+ sends them no data, contains no payment form, and issues no network request when opened. Verify that each option exposes one user-activated action that opens its page in a browser tab, that no clipboard write occurs, and that `Esc` or `Close` returns focus to the brand button.

## Updating an already-listed item

The sections above describe a first submission. When a Chrome Web Store item already exists for this extension, the work is a package update against that item: the account prerequisites are already satisfied and no new item is created.

- The `manifest.json` version must be strictly higher than the version the store currently carries. v1.11.0 satisfies this against v1.10.0, and the release workflow refuses to publish a version that already has a GitHub release, so a version cannot be silently reused.
- Upload `network-plus-extension-1.11.0.zip` obtained from the trusted release route as a new package on the existing item, and compare the complete 64-character SHA-256 recorded above against the downloaded file before submitting.
- Re-check the listing text, screenshots, and privacy answers against this dossier. The listing is not versioned in the dashboard, so a stale screenshot or description stays live until it is replaced; the four 1280 x 800 screenshots in `docs/store-assets/` were re-captured for this version because the toolbar mark and status bar changed.
- An update is a fresh review. Distribution and visibility settings carry over from the existing item unless the operator changes them, and the previously reviewed package stays live until the new one is approved.
- Field labels and the navigation path for package updates must be confirmed in the live dashboard, which can change independently of this repository.

## Automated submission

`npm run store:submit -- --store chrome` uploads the packaged archive as a new package on the existing item and submits it for review through the Chrome Web Store API. The `Submit to Stores` workflow runs it automatically when a GitHub release is published, and can also be run on demand from the Actions tab.

Before uploading anything, the script rebuilds the archive and compares its SHA-256 against the digest recorded in this dossier. A mismatch aborts the run, so the store can only receive bytes that passed review here.

### Credentials

The workflow reads four repository secrets and never writes their values to the log. The OAuth client is created in Google Cloud with the Chrome Web Store API enabled, and the refresh token is obtained once for the account that owns the item.

| Secret | Where it comes from |
|---|---|
| `CHROME_ITEM_ID` | The item ID of the existing Chrome Web Store item |
| `CHROME_CLIENT_ID` | OAuth client ID |
| `CHROME_CLIENT_SECRET` | OAuth client secret |
| `CHROME_REFRESH_TOKEN` | Refresh token issued for the `https://www.googleapis.com/auth/chromewebstore` scope |

The secrets belong to the `store-submission` GitHub Actions environment. Adding a required reviewer to that environment makes every submission wait for a human approval; leaving it without rules lets the workflow submit unattended.

### Obtaining the refresh token

The published guide's "Testing your OAuth application" section still walks through the out-of-band redirect (`redirect_uri=urn:ietf:wg:oauth:2.0:oob`). Google retired that flow, so an OAuth client created today is refused by it. A Desktop App client accepts a loopback redirect instead, which is what `scripts/chrome-refresh-token.js` uses.

Run it on an operator machine, never in CI:

```
CHROME_CLIENT_ID=... CHROME_CLIENT_SECRET=... node scripts/chrome-refresh-token.js
```

It listens on a free loopback port, prints the consent URL, waits for the redirect, exchanges the code, and prints only the refresh token. Sign in as the account that owns the Chrome Web Store item; that can be a different account from the one that owns the Google Cloud project. The account also needs 2-Step Verification enabled, which the Chrome Web Store requires of any developer publishing through the API.

Google returns a refresh token only when offline access is requested and the consent is fresh, so the helper forces both. If it still reports no refresh token, revoke the app under `https://myaccount.google.com/permissions` and run it again.

### Failure modes the operator must expect

- `ITEM_PENDING_REVIEW` means the upload landed but an earlier submission still occupies the review queue. The run reports it and does not treat it as a failure, but nothing was submitted and the publish has to be repeated once the queue clears.
- `NOT_FOUND` on upload means the item ID is wrong; retrying cannot fix it.
- A refresh token stops working if the OAuth client is deleted, its secret is rotated, or the grant is revoked. The run then fails at token exchange, before anything is uploaded.
- A successful publish submits the item for review. It does not mean the new version is live.

## Final operator checklist

- Confirm the developer account owner, publisher name, verified email, and one-time registration fee in the live dashboard.
- Download the release ZIP from the trusted route and match its exact size and SHA-256 before upload.
- Upload the ZIP, 128 x 128 icon, required 440 x 280 promo tile, optional 1400 x 560 marquee, and four 1280 x 800 screenshots.
- Paste the reviewed listing, single-purpose statement, permission justification, remote-code answer, data-use declarations, privacy URL, distribution choice, and test instructions.
- Open the privacy URL signed out and verify that it describes both Chrome and Edge accurately.
- Preview the listing at desktop and reduced image sizes. Confirm that no image looks like a browser control or contains illegible text.
- Save the draft and perform a final consistency review before selecting `Submit for Review`.
- Do not claim publication, certification, review success, or a store URL until the dashboard provides verifiable evidence.

## Source record

| Official source | Accessed | Use in this dossier |
|---|---|---|
| [Register your developer account](https://developer.chrome.com/docs/webstore/register/) | 2026-08-14 | One-time fee, long-term owner email, agreement, and account prerequisites |
| [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/) | 2026-08-14 | ZIP upload, listing/privacy/distribution/test tabs, review submission, and deferred publishing |
| [Supplying Images](https://developer.chrome.com/docs/webstore/images/) | 2026-08-14 | Required 128 x 128 icon, 440 x 280 small promo tile, screenshot dimensions, and image-design guidance |
| [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/) | 2026-08-14 | Single purpose, minimum-permission justification, remote-code declaration, data-use certification, and privacy URL |
| [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/) | 2026-08-14 | Local-only processing disclosure and web-browsing/content examples |
| [User Data Policy](https://developer.chrome.com/docs/webstore/user_data/) | 2026-08-14 | Limited-use, transfer, advertising, and human-access restrictions |
| [Accepting Payment From Users](https://developer.chrome.com/docs/webstore/program-policies/accepting-payment/) | 2026-08-14 | Payment transparency and user-action boundaries for optional support links |
