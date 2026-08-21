---
name: store-release
description: >-
  Cut a new Network+ release and resubmit it to the Microsoft Edge Add-ons and
  Chrome Web Store listings, end to end: version bump, changelog cut, digest
  repointing, merge, GitHub release, store upload, and review submission. Use
  this whenever the user asks to release, publish, resubmit, bump the version,
  or ship accumulated changes to the stores — including Japanese phrasings such
  as リリース, 再申請, ストア申請, 公開, バージョンアップ, ストアに出す — and
  whenever store-submit runs fail and need diagnosing. Do not improvise the
  release steps from memory; this runbook encodes the order and the failure
  modes that were learned the hard way.
---

# Store release runbook

Turns the accumulated `## Unreleased` changes into a published GitHub release
and submits that exact archive to both browser stores. The digest pinned in
the dossiers is the gate everywhere: CI refuses to publish a release, and the
submission workflow refuses to upload, unless the archive it builds matches
it. That is why the order below matters — the digest is computed once, at the
cut, and everything downstream verifies against it.

Two facts shape the whole flow. First, `store-submit.yml` **never fires on the
release event**: the release is created by `release.yml` using the workflow
`GITHUB_TOKEN`, and GitHub suppresses workflow triggers from events created
with that token (recursion prevention). Every submission is started by hand
with `workflow_dispatch` on `main`. Second, **listing text and images have no
API on either store** — package submission is automated, media replacement is
a manual portal step that only exists in releases that changed the media.

## Phase 0 — before cutting

- Confirm `main` is green and every feature PR intended for the release is
  merged. The repo convention: merges happen only after the user confirms.
- Pick the semver bump (features → minor).
- The Edge API key expires ~72 days after creation. If in doubt, have the user
  run `./scripts/publish-edge.sh check` in the sibling dual-subtitles repo
  before starting; a dead key fails Phase 3, not Phase 1, and is cheaper to
  learn about now. Credential locations and sharing rules live in CLAUDE.md
  (「ストア申請の資格情報」).
- Note whether `docs/store-assets/` or the listing text changed since the last
  submission. This decides the Phase 3 path.

## Phase 1 — cut the release (one commit, plus a reopen commit)

Work on the designated working branch. `npm run version:check` is the
authority for version locations; the known set is:

| File | What |
| --- | --- |
| `package.json`, `manifest.json` | `"version"` |
| `package-lock.json` | two `"version"` entries |
| `panel.js` | `TEST_EXTENSION_VERSION_FALLBACK` |
| `tests/extension-package.test.js` | expected zip name |
| `tests/panel.test.js` | four version literals |

The READMEs (`README.md`, `README.ja.md`) are deliberately version-free —
every release link points at `releases/latest` — so the cut never touches
them, and `version:check` fails if a versioned route or version literal
sneaks back in.

1. Bump all of the above to the new version.
2. In `docs/CHANGELOG.md`, rename `## Unreleased` to `## vX.Y.Z - YYYY-MM-DD`.
3. Build twice and require identical bytes — the digest is only worth pinning
   if the build is reproducible:
   `npm run extension:package` → record size + `sha256sum`, move the zip
   aside, build again, `cmp` the two.
4. Repoint the digest pins at the new archive:
   - `scripts/check-store-readiness.js` → `EXPECTED_RELEASE_SHA256`
   - `tests/store-readiness.test.js` → the same digest appears twice
   - `docs/edge-addons-submission.md` and `docs/chrome-web-store-submission.md`
     → version, zip name, size, digest, download URL. Use the **cut-time
     phrasing**: the archive "was built from the reviewed commit … Public
     observation of the release is a post-merge step and is not claimed
     here". Never claim the release was publicly observed in the commit that
     creates it — it cannot have been. Move the previous version's evidence
     row to "Superseded as the upload source by vX.Y.Z".
5. Commit (`release: cut vX.Y.Z and repoint the store kits at it`).
6. Reopen the changelog in a second commit: add back `## Unreleased` with the
   placeholder bullet `- No changes have been recorded since vX.Y.Z.` — the
   changelog gate requires the section to always exist with a bullet, and the
   release-notes builder skips exactly this placeholder.
7. Run the gates: `npm test`, `lint`, `format:check`, `extension:check`,
   `store:check`, `integrity:check`, `contract:check`, `version:check`,
   `audit:strict`, and `text:check` / `changelog:check` with
   `--base "$(git merge-base HEAD origin/main)" --head "$(git rev-parse HEAD)"`.

## Phase 2 — merge and let CI publish the release

1. Push, open the PR, wait for CI, get the user's explicit go-ahead, merge
   with a merge commit.
2. Sync develop: `git fetch origin main && git push origin origin/main:refs/heads/develop`.
3. The push to `main` runs `release.yml`, which rebuilds the archive, checks
   it against `EXPECTED_RELEASE_SHA256`, and creates tag + release `vX.Y.Z`
   with the zip attached. Verify the release exists and its asset digest
   matches the pin. It skips (does not fail) if the tag already has a release.

## Phase 3 — submit to the stores (manual dispatch, always)

Dispatch `store-submit.yml` on ref `main` (Actions tab or API). Inputs:
`store` = `both` / `edge` / `chrome`, `upload_only`, `diagnose`.

**Media unchanged** — dispatch once with `store=both`. The run uploads the
archive to both stores and submits both for review. Done.

**Media changed** — sequence it so one review carries everything:

1. Dispatch with `upload_only=true` (per store or both). The package lands in
   each store's draft without submitting.
2. The user replaces the images by hand — Edge Partner Center → the product →
   Store listing; Chrome Web Store dev console → the item → ストア掲載情報 →
   グラフィック アセット. The files are the current contents of
   `docs/store-assets/` (four numbered screenshots uploaded in filename
   order, the 440x280 small tile, the 1400x560 marquee — which also fills
   Edge's Large promotional tile slot). Full slot-by-slot listing procedure
   lives in the two submission dossiers; follow those, do not improvise.
3. Dispatch again without `upload_only` — the publish step submits the whole
   draft, package and media edits together. (The user pressing the portal's
   own submit button is equivalent.)

Success lines to look for in the run log: `package accepted` then
`OK: vX.Y.Z submitted to <store>`. A store with no credentials configured is
skipped unless explicitly named.

If a run fails, read `references/troubleshooting.md` in this skill before
touching any credential — it maps every error seen so far to its actual
cause, and the fingerprint diagnosis settles "wrong value stored" vs "value
itself dead" without re-pasting anything.

## Phase 4 — record the published release (follow-up PR)

After the release is public, on a fresh branch:

1. Download the release asset, verify size + SHA-256 against the pin, and
   `cmp` it against a fresh local build.
2. Flip both dossiers from cut-time phrasing to observed phrasing ("were
   publicly observable and re-downloaded on YYYY-MM-DD … byte-identical to
   the local build") and add the release to the Edge dossier's evidence
   table.
3. Add a changelog bullet, run the gates, PR, merge on the user's word.

This is also the natural place to fold in any operational lesson the cycle
taught — the troubleshooting reference should grow every time a submission
fails in a new way.
