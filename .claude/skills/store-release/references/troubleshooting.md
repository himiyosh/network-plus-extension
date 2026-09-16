# Store submission troubleshooting

Every failure below was hit for real. The discipline that resolves all of
them: **settle identity by fingerprint, never by re-pasting.** A fingerprint
is `len=<n> sha=<first 8 hex of SHA-256>`; it is non-reversible, so it is safe
to compare in chat or logs, and two operators computing it over "the same"
value find out immediately whether the values actually match.

## Getting fingerprints

- **CI side**: dispatch `store-submit.yml` with `diagnose=true` (plus the
  store). The run prints one fingerprint per stored credential and stops
  without contacting any store. `absent` means the secret is not set at all —
  a different fix from "set wrongly".
- **Local side** (macOS zsh-safe; do not use `${!var}` indirection, zsh lacks
  it): from the repo that holds the `.env` file, e.g. dual-subtitles:

  ```bash
  cd /Users/himiyosh/GH_himiyosh/ghcp-worktrees/dual-subtitles && source ./.env.cws && \
    printf '%s' "$CWS_CLIENT_SECRET" | shasum -a 256 | cut -c1-8 && printf '%s' "$CWS_CLIENT_SECRET" | wc -c
  ```

Always `source` the file rather than `grep | cut` — sourcing strips the
quotes a `.env` line may carry; grepping keeps them, which once turned a
36-character GUID into a rejected 38-character value.

## Expected value shapes

Length alone often identifies a mis-paste before any comparison:

| Secret | Shape |
| --- | --- |
| `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID` | GUID, 36 chars |
| `EDGE_API_KEY` | 40 chars |
| `CHROME_ITEM_ID` | 32 lowercase letters (public; in CLAUDE.md) |
| `CHROME_CLIENT_ID` | ~72 chars, ends `.apps.googleusercontent.com` |
| `CHROME_CLIENT_SECRET` | `GOCSPX-` + total ~35 chars (legacy: 24) |
| `CHROME_REFRESH_TOKEN` | `1//` + total ~103 chars |

A 101-character "client secret" is not a client secret; that exact case
produced `invalid_client` until the right value was re-set.

## Error → cause map

| Log line | Meaning | Fix |
| --- | --- | --- |
| `<store>: was requested but is missing <names>` | Secrets absent from the `store-submission` environment | Run `npm run store:setup -- --store <store>` locally, or set one secret directly (below) |
| Chrome `invalid_client: The provided client secret is invalid.` | Client found, secret mismatched | Fingerprint-compare `CHROME_CLIENT_SECRET`; re-set the one secret |
| Chrome `invalid_grant` | Refresh token dead or for another client | Re-mint with `scripts/chrome-refresh-token.js` (loopback consent) |
| Chrome `The item cannot be updated now because it is in pending review, ready to publish, or deleted status.` | A portal-side submission is already in review (often media-only) | User cancels the pending review in the dev console — the live listing is unaffected — then re-dispatch so package + media go through one review |
| Edge `401` (empty body) | One of the three Edge values wrong, or the API key expired (~72 days) | Diagnose fingerprints; check key liveness via dual-subtitles `./scripts/publish-edge.sh check`; recreate the key in Partner Center if dead and update **both** projects' stores |

## Setting a single secret without the wizard

Pipe from the sourced `.env` straight into `gh`, one line, no clipboard:

```bash
cd /Users/himiyosh/GH_himiyosh/ghcp-worktrees/dual-subtitles && source ./.env.cws && printf '%s' "$CWS_CLIENT_SECRET" | gh secret set CHROME_CLIENT_SECRET --env store-submission --repo himiyosh/network-plus-extension
```

Swap the variable and secret name as needed. Multi-line commands with `\`
continuations have been mangled by chat copy-paste before — hand the user a
single line, or the two-step `gh secret set` interactive prompt.

## `store:pages` — the media step

Hit for real on 2026-08-27, and repaired the same week. Both stores failed to
*delete*, and the two failures look nothing alike in the log. The repair is
covered by `tests/store-pages.test.js` on the Chrome side; the Edge
confirmation control could not be re-verified against a live console, because
both listings were in review, so the first Edge run after the fix is the real
test. Either way a failure now stops before uploading, so the listing survives
it.

**Chrome prints `uploaded` for every image and still corrupts the listing.**
The run ended with eight screenshots where four were intended: the old four
were never removed and the new four were appended. Read `cleared <slot>: N`
correctly — `clearSlot` returns the round it stopped on, so a small number
means it converged and **`8` is the loop cap, meaning it never did**. Two
defects produce that. The label regex is built as
`` `画像を削除.*${name}|remove.*${name}` `` while `name` is itself an alternation
(`スクリーンショット|Screenshot`), so the top-level `|` splits it and any element merely
containing "Screenshot" matches. And the console raises a confirmation —
`この操作は元に戻せません` with `[キャンセル] [削除]` — that `clearSlot` never answers, so each
click just reopens it.

**Edge's `N screenshots would not delete — nothing was uploaded` does not
prove a certification lock**, whatever the message says. Check the product's
real status on the Partner Center overview first: on 2026-08-27 Network+ read
`In the Store` while the sibling Dual Subtitles read `In review`, and the
actual cause was `confirmDialog`'s `v6_he-button.he-button` / `^Confirm$`
locator not matching. The abort itself is the guard working — it refuses to
upload onto slots that did not clear, which is what keeps duplicates off the
listing — so the listing is intact whenever this fires.

**Verify the listing, never the log.** Pull the preview `img` `src` values out
of the console DOM, refetch each at `=w1280-h800-rw`, normalize both sides with
`sips -Z 64 -s format bmp` and compare greyscale pixels; an exact match reads
0.00 RMS against the file in `docs/store-assets/`. Edge is cheaper to check —
Partner Center keeps the uploaded filename in each image's `alt`
(`Screenshot screenshot-1-request-detail-1280x800.png`), so new-versus-stale is
readable without downloading anything.

Two traps while repairing a Chrome listing by hand: screenshot labels **do not
renumber** after a deletion (removing `スクリーンショット 1` leaves `2..8`), so target
`[aria-label="画像を削除 スクリーンショット N"]` by exact name rather than always taking the
first; and a count read from a freshly mutated console DOM under-reports while
rendering settles, so reload before believing any number.

### v1.14.0 cycle (2026-09-14): the repaired path failed in two new ways

**Status: all three defects below are fixed in `scripts/publish-store-pages.js`.**
Each is pinned by a scenario test in `tests/store-pages.test.js`. Reload the
console afterwards and compare it with the run's final list.

Live check on 2026-09-17, against the published v1.14.0 listing:

- **Chrome:** the first run did not find "nothing to do". The small promo tile's
  preview had not loaded yet and read as `https://chrome.google.com/`, which
  resized to a 404. The run counted the tile as unreadable, replaced it with the
  identical file and saved a draft. The draft content is unchanged, but the item
  now carries an unsubmitted draft. Fixed: only a `*.googleusercontent.com`
  image counts as a preview, and the run waits up to 30s for every slot's
  preview before fingerprinting. The rerun kept all six images and printed
  `nothing to do`.
- **Edge:** still unverified live. It has no nothing-to-do path: every run
  clears and re-uploads, so running it on a correct listing only adds risk.
- **Tab pile-up:** runs and verification scripts left 33 tabs in the store
  profile (sign-in pages, blanks, duplicate consoles), and the operator could not
  tell which to use. Now `login` reuses one tab per console and closes blanks and
  duplicates, a successful `chrome` or `edge` run closes its own tab, and a
  browser a run launches works in its initial blank tab. Killing the browser
  restored every tab on the next launch. Setting the profile's
  `session.restore_on_startup` to `5` in `Default/Preferences` (browser closed)
  stops that.
- **Stale browser:** a store browser left running for days refused Playwright
  with `Browser.setDownloadBehavior: Browser context management is not
  supported`. Updating `playwright-core` alone did not help; relaunching the
  browser did.

| Defect | Fixed behaviour |
| --- | --- |
| Chrome cleared everything, then stopped on the required promo tile | Reads and fingerprints every slot, then plans. Any problem refuses the run before the first removal. Tiles are never cleared: a matching one is kept, a changed one is replaced through its input, and the run refuses if there is none. Screenshots that already match stay. A failure lists what was removed, replaced and uploaded. |
| Edge: 4 × `uploaded`, 2 landed | One upload at a time, each waiting for `img[alt="Screenshot <file>"]` to appear. A cleared listing is saved and reloaded before re-uploading. The run ends by reloading and printing the files actually there, in order, and exits 1 on a mismatch. |
| `status` killed the `login` window | A command that finds port 9334 already answering attaches to that browser and never stops it. `status` closes only its own tab. Only a headless browser that `status` launched itself is stopped, by its own process id. |

The history below is kept for the symptoms.

**Chrome: `"画像を削除 プロモーション タイル（小）" would not clear (confirmed)` is not
"nothing changed".** The screenshots slot is cleared first, and that deletion
is saved to the draft at once, so the run stopped with **zero** screenshots on
the draft while the message said the listing was unchanged. The small promo
tile answers the confirmation and stays. It is a required slot, so it cannot be
emptied, only replaced. The public listing is not affected until a submission.
To recover, upload only the four screenshots (the tiles had not changed), one at
a time. After each upload, confirm the `画像を削除 スクリーンショット N` count went up,
then save the draft. Chrome serves the stored original: refetching each preview
`src` with its size suffix swapped for `=w1280-h800` returns bytes identical to
the PNGs in `docs/store-assets/`, so `cmp` settles it without any image
normalization.

**Edge: four `uploaded` lines, two screenshots landed.** `fillSlot` feeds the
single screenshot input and waits a fixed four seconds, and uploads issued that
fast were dropped. Only `screenshot-1` and `screenshot-4` reached the draft. The
closing `N screenshots now on the listing` line (it said 1) is the one to
believe. What repaired it:

- Upload one file at a time and wait until its `img[alt="Screenshot <file>"]`
  appears before the next.
- To restore order, delete the out-of-place image, then save the draft and
  reload before uploading a file with the same name again. In the same editor
  session, re-uploading `screenshot-4` right after deleting it never appeared
  (observed, not proven causal).

Edge stores re-encoded 350×218 thumbnails, so bytes never match. Decode each and
score it against the new and old PNGs scaled to that size. Correct slots scored a
mean absolute difference of 5–6 against the new image and 11–14 against the
previous release's.

**`status` closes the `login` window.** It launched on the same profile and
`closeBrowser()` killed every process on it, including a sign-in in progress.
Before the fix, the workaround was to poll `http://localhost:9334/json/list` for
tab URLs while the operator signed in. That still works, but `status` is safe to
run against an open `login` window now.

**Listing text had silently drifted.** Through v1.13.0 both stores still showed
the 2026-08-14 first-submission description (about 2,600 characters, including
the retired 20,000-request default), because the text was only ever retyped
"when the dossier changed". Read the live description from the console
`textarea`. Compare it with the dossier block on every release, write the block
with Playwright `fill()`, save the draft, and require an exact read-back.

## Facts that keep being rediscovered

- `store-submit.yml` never fires from the release event (the release is
  created with `GITHUB_TOKEN`, whose events do not trigger workflows).
  Dispatch it manually every time.
- The wizard (`store:setup`) strips matched surrounding quotes and flags a
  value that repeats an earlier answer (stale clipboard), but it cannot know
  a pasted value is the wrong *kind* — check shapes when a store refuses.
- Chrome credentials are account-level and shared with dual-subtitles; only
  `CHROME_ITEM_ID` is per-extension. Edge shares `EDGE_CLIENT_ID` +
  `EDGE_API_KEY`; only `EDGE_PRODUCT_ID` is per-extension.
- Credential values never enter chat, the repo, or logs. Fingerprints do.
- The archive reproduces byte-for-byte only under `TZ=UTC`. Entry timestamps
  normalize to the ZIP epoch in local time, so a JST build writes
  `01-01-1980 09:00` where CI writes `00:00`: identical entry CRCs, identical
  206937 bytes, different SHA-256. Phase 4's `cmp` against a fresh local build
  must run `TZ=UTC npm run extension:package`, or it reports a mismatch that
  is not one.
