# PR #13: local fieldbook workspace, profile and terrarium

Current review: existing draft [PR #13](https://github.com/Serpentguts/TERRA/pull/13), branch `integration/pr7-pr11-pr12` only. No merge or deployment. This document supersedes historical temporary mock-profile, single-select filter and six-destination navigation descriptions. [LOCAL-WORKFLOWS.md](LOCAL-WORKFLOWS.md) remains authoritative for privacy, dates, project geometry and 72-hour Trash.

**Latest Feed addition:** [FEED.md](FEED.md) is authoritative for the fictional Feed, local follow preferences, typed composer, ID-linked observation sharing and iNaturalist local-only preparation. Feed is no longer an empty placeholder. Nothing is published; music remains future-only. Complete verification is now **25 JS unit tests, 4 Flask tests, 8 Chromium suites**.

## One local fieldbook, not a social account

- **Profile → Posts** reads active entries directly from the existing journal, without storing copies. Names, categories and dates link to saved journal details/provenance. Private notes and locations are not repeated on Profile. Trash entries disappear from Posts and return on Restore. Photos remain temporary; they are not saved or used as profile posts.
- **Projects** reads the existing ID-only project collections and their eligible active counts. Completion remains a local user action, not scientific validation.
- Local name, description, symbolic avatar and credentials persist in `terra.profile.v1`: `{version:1,name,bio,credentials,avatar}`. The avatar uses app emoji primitives, not an uploaded/stored photo. Credentials always say **user-entered / unverified**. No LinkedIn integration.
- Your own Profile followers / following remain **0 / 0 · not connected**. No real follows, contacts, notifications, uploads, account sync or public profile. The separate Feed now has explicitly fictional profiles with local-only follow toggles; those preferences are not real social counts. Genetics remains unconnected. No AI or external API calls.
- Profile tabs support click, Left/Right, Home/End, roving keyboard focus and correctly associated tabpanels. All user text uses textContent/value, never HTML.

## Transparent non-quality participation awards

Three badges, each with **one** randomized decorative object, at most once per local reward store:

| Badge | Evidence checked |
| --- | --- |
| First observation | At least one valid active journal entry dated today or earlier. |
| Seven-day fieldbook | At least one active entry on each of seven consecutive distinct observation dates, using UTC day arithmetic after strict local-date validation. Duplicates on a date do not extend the streak. Backfilled/imported dates count; this is **not** proof of daily uploads. |
| Project completion | A complete project with at least one referenced, active, non-future observation that still matches its date/name/boundary scope. Empty projects, missing references and out-of-scope/trashed entries do not qualify. |

There is **no verified-observation badge**: existing provenance has no genuine verification evidence. Manual names, fixed photo-demo candidates and imported claims of verification do not become evidence. There are no rewards for rare species, precise locations, transactions, collecting or disturbing wildlife. Participation badges do not imply quality, identification, expertise or conservation outcomes.

`terra.rewards.v1` stores `{version:1,grants:[{badge,token,placed}]}`. The fixed three badge IDs are the idempotency ledger: repeated render/storage events, duplicate imports, reload, delete/restore and project reopen/complete cannot mint more awards. Earned grants are retained even if their qualifying entry is later trashed or a project reopened. No event copies, observation IDs, notes, coordinates or credentials enter the reward store. Awards can first unlock when loading qualifying existing entries; they do not require new uploads.

Tokens use browser cryptographic randomness (128 bits), with bounded collision rejection against this local collection. Token-derived emoji, color, size, rotation and placement use existing CSS/app primitives, no image generation/assets service. Each collectible has its own full local serial; visual motifs can resemble one another. Placement/removal is saved without rerolling. A failed write does not display an unsaved grant or undo a successful journal save; a later successful refresh/reload retries. Damaged/unsupported stores fail closed without being silently overwritten.

**Randomized digital collectibles are unique within this local prototype only, not guaranteed unique globally. They have no cash, trade, NFT, blockchain or financial value.** Storage is user-editable and device-clock-dependent, not fraud-resistant or a verification service. Clearing/editing local storage can reset awards; parallel tabs are best-effort localStorage synchronization, not transactional account storage. No global uniqueness promise, scarcity market or transferable ownership.

## Map and Observation

The fictional Map now appears **first**, with filters beneath, then legend. The two native multi-select lists accept several organism icons and several category colors. Within a list choices use **OR**; between lists they use **AND**. All, or an empty list, means unrestricted (All overrides individual selections). Selected text is summarized, selected options are highlighted natively, results/empty state are announced, and Reset clears restrictions. Desktop: Ctrl/Command-click or Shift-arrow selection; touch uses the platform's native multi-select control. Filters stay within Map and never filter or reveal journal locations. Filter choices are temporary, not stored.

Map remains a schematic fictional grid/card layout, **not** geography, tiles, real coordinates or species distribution. Red listings are separate fictional illustrations, with no purchasing or financial actions.

“What did you find?” is one labeled native searchable **input + datalist dropdown** containing Plant, Mushroom, Insect, Mammal, Bird, Fish, Reptile and Other. Type to search, use native arrows/Enter or tap a choice. Only listed labels are accepted (case-insensitive); arbitrary text is rejected with a useful validation message. Stored values remain `plant/fungus/insect/mammal/bird/fish/reptile/other`, including legacy `fungus`. No journal schema change. Native datalist popup/announcement behavior varies by browser; manual screen-reader/Windows review remains necessary.

## Workspace without destructive navigation

Persistent destinations: **Workspace, Map, Profile, Feed, Observation, Genetics, Projects / Journal**. Map remains directly accessible rather than hidden inside a workspace menu. Seven columns on desktop, four on narrow screens (two rows), measured bottom spacing and safe-area support preserve essential navigation.

Workspace lists the nine navigable sections and their open/minimized/closed state. Its links open/expand any section; sections have named Minimize/expand and Close buttons. Minimize collapses content but leaves controls; Close hides the section. Neither writes storage, deletes data, resets forms nor revokes temporary images. The overview itself can close. Observation reopens/expands both photo review and discovery draft; Projects / Journal does the same for projects and journal. Hashes, repeated links and browser history work. Visibility is temporary and resets on reload. This is a simple section stack, not a draggable window manager. Trash remains separately visible and is not a closeable workspace pane.

## Persistence, compatibility and limits

Existing `terra.observations.v1`, `terra.projects.v1`, version-1 JSON envelope, optional location/deletedAt/endDate/groupValue/boundary and ID-only membership are unchanged. No startup rewrite/migration of journal/projects. Future dates, privacy precision ceilings, required schematic selections, full-boundary containment, 72-hour Trash and neutral saved-discovery provenance remain enforced by the existing paths.

Profile text and rewards use two independent local keys. The later [Feed addition](FEED.md) uses a third independent key, `terra.feed.v1`, without journal copies/migration. **Journal JSON backups exclude feed posts/preparations/follows, profile, rewards and projects.** CSV is a report, not a project restore. Keep the same browser profile/origin; clearing data or browser eviction can erase all local state. Local storage is not encrypted, authenticated, synced or automatically backed up. No credentials, location or photos should be treated as public-safe just because the profile is local. No global awards/validation/social backend exists.

## Update existing Windows clone (PowerShell)

Export a private journal backup; stop the server with Ctrl+C. Preserve local code edits first. If Git reports conflicts or a non-fast-forward, stop and resolve them; do not force/reset or clear site data.

```powershell
Set-Location "$HOME\TERRA-combined-test"
git status --short
git fetch origin integration/pr7-pr11-pr12:refs/remotes/origin/integration/pr7-pr11-pr12
git switch integration/pr7-pr11-pr12
git pull --ff-only origin integration/pr7-pr11-pr12
python -m pip install -r requirements.txt
python server.py
```

Open **http://localhost:8080** in the same browser/profile/hostname/port used before. Ctrl+F5 refreshes scripts without clearing local data. Use **python**, not `py`. There is no build/deployment step.

Optional separate test terminal (server still running, Node 18+):

```powershell
Set-Location "$HOME\TERRA-combined-test"
npm install --no-save --package-lock=false playwright
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.browser-cache"
npx playwright install chromium
node --test test-field-summary.cjs test-integration-plan.cjs test-local-data.cjs test-rewards.cjs test-feed-data.cjs
python -m unittest test_server.py
node test-browser.cjs
node test-projects-browser.cjs
node test-discovery-browser.cjs
node test-ui-browser.cjs
node test-view-stack-browser.cjs
node test-local-workflows-browser.cjs
node test-next-ui-browser.cjs
node test-feed-browser.cjs
```

## Verification and manual follow-up

Full relevant automated checks including [Feed coverage](FEED.md): **25 JavaScript unit tests**, **4 Flask tests**, **8 complete isolated Linux Chromium suites**. New coverage includes awards/date streak boundaries, no invented verification, missing/empty/out-of-scope projects, randomized stable primitives and collision retry, idempotent unlocks, repeat completion/trash/reload events, placement persistence/focus, same-source profile and credentials, cross-tab updates, failed writes/corrupt stores, native searchable group mapping/handoff validity, multiselect union/intersection/All/empty/reset/order, workspace/minimized/closed/grouped reopening and schema compatibility. Existing future date/privacy/project/72h/provenance/image/JSON/CSV and mobile suites remain required.

Human follow-up: Windows/Edge, Firefox/Safari, physical touch/safe areas, screen readers (especially native datalist and multi-select) and visual review of this prototype. Linux automated tests are not evidence of scientific verification, geography, production account safety or global collectible uniqueness.
