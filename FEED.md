# PR #13: local-only mock Feed and post creation

Review only on `integration/pr7-pr11-pr12`, in existing draft [PR #13](https://github.com/Serpentguts/TERRA/pull/13). No merge, deployment or main changes. This guide supersedes earlier descriptions of Feed as an empty placeholder; [NEXT-UI.md](NEXT-UI.md) and [LOCAL-WORKFLOWS.md](LOCAL-WORKFLOWS.md) still describe the other local tools and safeguards.

## What to try

- Open **Feed** from the persistent navigation. Five clearly fictional sample posts cover observation/discovery, offering/sale, cultivated plant and field update, from three explicitly mock profiles. Profile-name links navigate to the corresponding mock profile and its fictional posts. Back links/history/deep links reopen Feed, even after closing/minimizing it. These are separate from your own local Profile fieldbook.
- **Follow locally / Unfollow locally** toggles a pressed button, persists a local preference and updates a clearly mock count. It does not notify anyone, create real followers or filter the sample feed. Your own Profile's real follower/following counts remain zero/not connected. No likes, comments, messaging, payment, checkout or availability claims are implemented.
- Choose a **post type**, enter a title and optional caption. Offerings are always demo/unavailable; cultivated plants and field updates are local demo posts, not journal records. Saving does not create an observation or earn observation badges.
- For observation/discovery posts, save a journal record first. Choose it explicitly in the Feed composer, or use **Share / prepare · local demo** on its journal card. This opens/focuses the composer and selects the source without discarding a caption draft. Select **TERRA demo feed**, **Prepare for iNaturalist**, or **both**, then save explicitly. No destination means a validation error, not a silent publish.
- TERRA-only creates a card under **Your local demo posts**. Preparation-only creates a card under **iNaturalist preparations · not submitted**, not the TERRA feed. Both displays two presentations of one local post entry, not two observations. Every card states **NOT PUBLISHED** or **NOT SUBMITTED**. Removing the local entry removes both presentations without changing the journal.
- Close/minimize/reopen Feed without losing the current draft. Follow controls and storage events do not erase the draft. Unsaved captions clear on reload or **Clear post draft**; saved entries/follows survive reload in the same browser/origin.

## Observation ≠ discovery ≠ post

An **observation** is the underlying what/when/where record. A **discovery / identification** is the organism or finding associated with that record; it is not inherently a verified species identification. A **post** is a separate presentation/caption, optionally linked to the saved record.

Existing version-1 observations still use the name/group on that record for the finding; this change does not invent a new identification-evidence schema, migrate the journal, or turn mock photo suggestions/manual names into scientific evidence. Provenance remains **No identification history yet**. The Feed explanation and linked-record review show this distinction explicitly.

## Privacy and iNaturalist limits

There is **no real iNaturalist integration** in this code. Preparation is a local reference and review checklist, not an upload, downloadable export, valid submission payload or claim that iNaturalist accepted anything. No authentication, API call, external link, GPS, geocoding, metadata reading, media uploading or publishing action runs. Schematic map locations are not real geography and cannot be submitted as real coordinates. Actual integration requires a separate reviewed design and explicit consent.

A post stores only its caption/title, local destinations and source ID. It does **not** automatically copy journal notes, photos, name/date snapshots or location values. Source name/group/date/privacy are resolved at display time from active journal records; precise/coarse map values are never displayed in Feed. Missing/trashed/unreadable sources show **Source observation unavailable**, not stale identification snapshots. Restore reconnects the reference; removing a post does not delete its source. Future-dated legacy sources cannot be shared.

User-written captions/titles can still contain private information: review them yourself. Trashing an observation does not delete text you independently wrote in a post. Remove that post separately if needed. Everything stays in browser localStorage, which is not encrypted or authenticated. No account/sync/server social store exists. Concurrent tabs re-read before writes and listen for storage events, but localStorage is not transactional; exactly simultaneous writes can race.

**Music is a future idea only.** No music UI, audio playback/upload, license workflow or external music service is included.

## Independent storage, no journal migration

New key `terra.feed.v1`:

```text
{ version: 1,
  following: [mockProfileId, ...],
  posts: [{ id, type, title, body, observationId, terra, inaturalist, createdAt }, ...]
}
```

Types: `observation`, `offering`, `cultivated`, `update`. `observationId` is required for observation posts and null otherwise. At least one destination is required; `inaturalist` is allowed only for observations. `terra`/`inaturalist` mean **local presentation destinations**, never remote publication status. Creation timestamps are ISO strings. Version/field types/lengths/unique IDs/fixed profile IDs are validated; unknown fields are discarded, never used as publishing claims. Corrupt/unsupported/blocked stores fail closed without rewriting data. Quota failures retain the form and prior state. Feed problems do not block independent journal writes. No empty-store startup write.

Existing journal/project/profile/reward schemas and backups are unchanged. **Journal JSON exports do not include feed posts, preparations, follows, projects, profile or rewards. There is no Feed export/import UI yet.** Saved local captions/follows can be lost to clearing/eviction; do not treat this demo as durable publication or backup.

## Safe Windows PowerShell update/run

1. Export a private journal JSON backup in the current browser. Stop the server with **Ctrl+C**. Preserve local code edits; never force/reset through them.
2. In the existing combined-test clone, run these commands. They stop before updating a dirty worktree or after a Git failure. They never switch to main, merge a PR, or deploy.

```powershell
Set-Location "$HOME\TERRA-combined-test"
if (git status --porcelain) { throw "Local edits found. Preserve them before updating." }
if ($LASTEXITCODE -ne 0) { throw "Git status failed; stop." }
git fetch origin integration/pr7-pr11-pr12:refs/remotes/origin/integration/pr7-pr11-pr12
if ($LASTEXITCODE -ne 0) { throw "Fetch failed; stop." }
git switch integration/pr7-pr11-pr12
if ($LASTEXITCODE -ne 0) { throw "Branch switch failed; stop." }
git pull --ff-only origin integration/pr7-pr11-pr12
if ($LASTEXITCODE -ne 0) { throw "Fast-forward failed; stop. Do not force/reset." }
git log -1 --format="%H %s"
python server.py
```

Use **python**, not `py`. If Flask is missing, use the existing virtual environment or install `python -m pip install -r requirements.txt`, then retry. No npm/build step is needed to run the app. Keep the **same browser profile and origin**, normally **http://localhost:8080**, then Ctrl+F5. `localhost` and `127.0.0.1` have separate browser data; changing hostname/port can make an existing journal appear absent. **Do not clear site data.** Ctrl+C stops the server.

## Automated tests

25 JS unit tests, 4 Flask tests and all 8 complete Chromium browser suites pass in the Linux workspace. No application dependency was added. Browser libraries/fonts are test-only ignored artifacts. New Feed coverage includes all destination combinations, fictional profiles/follows, persistence/deep links/focus, safe text, unchanged journal bytes, no copied private fields, missing/trashed sources, stale-source revalidation, storage quota/corruption, cross-tab updates/draft retention, narrow widths and no outbound requests/GPS. Existing date/privacy/72-hour Trash/boundary/photo/provenance/JSON/CSV/profile/reward suites remain required.

Optional tests in a second PowerShell terminal while the server is running (Node 18+; skip installing if Playwright is already present):

```powershell
Set-Location "$HOME\TERRA-combined-test"
npm install --no-save --package-lock=false playwright
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.browser-cache"
npx playwright install chromium
node --test test-field-summary.cjs test-integration-plan.cjs test-local-data.cjs test-rewards.cjs test-feed-data.cjs
python -m unittest test_server.py
node test-feed-browser.cjs
node test-browser.cjs
node test-projects-browser.cjs
node test-discovery-browser.cjs
node test-ui-browser.cjs
node test-view-stack-browser.cjs
node test-local-workflows-browser.cjs
node test-next-ui-browser.cjs
```

Manual follow-up: Windows/Edge, Firefox/Safari, physical touch/safe areas, screen-reader announcements, keyboard/native controls, and human visual review. Use Tab/Enter/Space on profile links, follow toggles, the native type/source selectors and destination checkboxes. Automated Linux tests do not replace these reviews or establish scientific identification/production social safety.
