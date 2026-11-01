# PR #13: local observation and project workflows

Review only, on `integration/pr7-pr11-pr12`. No merge, deployment, external map service, or real identification. This document supersedes earlier integration-history descriptions where they differ.

## Observation changes

- Removed the redundant first **Discover TERRA** section. Home still opens the existing introduction; other views and drafts remain intact.
- Observation dates are today or earlier, using the device's **local calendar date**. Both native pickers, manual text, Save/Add validation, photo analysis/confirmed handoff and JSON import reject future dates. Strict calendar/leap-day validation remains. Already stored legacy future dates are **readable without rewriting or erasing them**; new imports cannot introduce them.
- Removed the temporary natural habitat input from both Observation forms. Cultivated/garden context and temporary locality review remain independent of saved map location.
- Choose Hidden / Approximate / Exact, then make a required local-map selection. Changing privacy clears the previous selection. Photo handoff clears any old map selection; it cannot silently reuse a precise point from a prior discovery.

### Honest maps and privacy

The drawing surface is a **local/demo 0–100 grid**, shared by observation locations and project sites. It is not a world map; these are **not latitude/longitude, distances, or surveyed boundaries**. No GPS (including background GPS), external geocoding, map tiles, photo metadata, or network services. Numeric controls and Apply provide a keyboard alternative to clicking.

- **Exact:** click a schematic pin, or enter x1/y1 and Apply. Only integer local-grid x/y are saved.
- **Approximate:** click two opposite corners or enter x1/y1/x2/y2 and Apply. The rectangle expands outward to 10-unit cells, at least 20×20. Only the resulting coarse rectangle is saved; never the original clicked points or a centroid. A saved project's boundary can be selected instead; the same coarsening applies, so it may expand beyond that site and fail containment.
- **Hidden:** select a broad region (at least 40×40) to complete the UI workflow, then discard it on save. Only a `withheld` marker is retained, **no region or exact coordinates**. This deliberately cannot prove inclusion in a boundary-constrained project.
- Stored/imported location shapes are strictly validated against their privacy tier, version and grid. Hidden/Approximate cannot carry point coordinates or additional location properties. Names/notes remain free text: do not type sensitive locations there. Browser storage/backups are private local files, **not encryption**.
- The separate Map tab's fictional organism markers remain a demo, not a plot of private journal records.

## Trash and recovery

**🗑 Delete** asks for confirmation and atomically adds a deletion timestamp to the journal record. It does not remove that record. The visible **🗑 Trash** section shows the recovery deadline and Restore action; active journal counts, summaries, selection lists and Add exclude Trash. Project references are retained so restoring within the window can reconnect an eligible record.

Recovery lasts **3 days = 72 hours** after deletion, based on the device clock. Restore re-reads storage and checks expiry before writing. Failed deletion/restore writes leave the prior record intact and allow retry. Cancelling Delete changes nothing.

At/after the deadline Restore is disabled. **Permanent cleanup occurs only with the next successful journal write** (Save, Delete, Restore or JSON merge), not merely on reading/reloading and not in a background service. Closing the app pauses cleanup, not the clock. Expired entries may therefore remain visibly marked as expired until a write. Changing the device clock affects local retention; this is not server-enforced retention. Existing external backups remain the user's responsibility.

## Project timeframe and group-specific choices

- Start + optional inclusive end filter previous journal observations for **all** groups. Blank end with a start means one day. End before start, end without start, impossible dates, and out-of-window manual day values fail validation. Future project planning dates are allowed; future observation records are not newly created.
- **Project date/day:** requires a start. The selector lists journal days within the timeframe, All dates, and Other/manual day within the timeframe. Candidate checkboxes let you explicitly include eligible prior journal records. No automatic membership or invented records.
- **Species:** choose a recorded name from prior observations, or Other and enter a new name in Species/name. Matching remains exact, trimmed and case-sensitive; no taxonomy lookup or inference.
- **Site:** choose a saved site/boundary or Other/manual label, and draw a rectangular project boundary. New sites and conversions to Site require a boundary. Legacy label-only site projects remain readable/editable until a boundary is added; they are explicitly label-only, not geographic validation.
- **Custom collection:** title/notes and optional timeframe attach manual text safely. Site/species text fields remain independently stored. All custom values render as text, not HTML; CSV formula neutralization remains.

### Boundary enforcement and edits

Only an Exact local pin inside/on the rectangle, or an **entire** Approximate region inside/on it, is eligible. Partial overlap, outside points, wrong-grid data, Hidden and legacy records with no location fail closed. The same rule is used by candidate lists, project Save, discovery Save+Add, saved-record Add, and summaries/CSV. Unknown location is not assumed to be inside.

Choose an existing site project, edit its rectangle, then **Save project changes** (reopen first if complete). The candidate message previews how many selected records are now outside the scope. Save removes known invalid memberships, lists removed IDs, and explicitly says **journal records were NOT deleted**. Narrowing/expanding the rectangle does not automatically select new records. Missing references are retained but not counted; restoring them only counts them if they satisfy the current scope. Restoring Trash does not undo earlier membership removals made during a boundary edit.

**Limit:** rectangles only, no arbitrary polygons, basemap alignment, real geographic containment, addresses, or real coordinate conversion. Use this only for local workflow testing; real geographic boundaries require a separately designed offline map/coordinate system.

## Compatibility and retention

No startup migration rewrites data. Existing keys/envelopes stay `terra.observations.v1` and `terra.projects.v1` (version 1); six-field legacy journal records and ID-only project memberships remain readable. Validated optional additions:

| Store | Optional fields |
| --- | --- |
| Observation | `location`: `{version:1, space:"terra-local-grid-v1", kind:"point", x,y}` for Exact; `kind:"region", x1,y1,x2,y2` for Approximate; `kind:"withheld"` without coordinates for Hidden. `deletedAt`: ISO UTC deletion timestamp. |
| Project | `endDate`: inclusive ISO date; `groupValue`: selected day; `boundary`: `{version:1, space:"terra-local-grid-v1", x1,y1,x2,y2}`. |

Import validates **all** records before writing, preserves recognized optional fields, strips unrelated unknown metadata as before, and rejects invalid privacy shapes/future observation dates. Exports include active and unexpired Trash records and preserve deletion times; expired Trash is omitted without a read-time storage deletion. Duplicate IDs never overwrite existing records or reset Trash clocks. Use Trash Restore to recover an existing trashed ID, not backup merge. Importing an already expired trashed record does not resurrect it. An old external backup without a deletion timestamp can recover a missing ID; local retention cannot erase copies outside the app.

**Do not downgrade after saving these fields:** older builds may strip optional location/trash fields or treat Trash as active. Export a private backup before testing. Journal JSON still does **not** back up projects/boundaries; CSV is a report, not a project restore format. Keep the browser profile/origin and site data intact. No actual user's storage is accessed by automated tests; they use fresh isolated browser contexts and synthetic expiry fixtures.

## PowerShell update and run

Export a journal backup and stop the running server first. Use your existing clone path (change the first line if needed). Resolve/stash any local edits before pulling; do not reset or clear data.

```powershell
Set-Location "$HOME\TERRA-combined-test"
git fetch origin integration/pr7-pr11-pr12:refs/remotes/origin/integration/pr7-pr11-pr12
git switch integration/pr7-pr11-pr12
git pull --ff-only origin integration/pr7-pr11-pr12
python -m pip install -r requirements.txt
python server.py
```

Open **http://localhost:8080** in the **same browser/profile/hostname/port** as your journal. Ctrl+F5 to refresh scripts; do not clear site data. Stop with Ctrl+C. No build or deployment.

Optional test terminal, with server still running (Node.js 18+):

```powershell
npm install --no-save --package-lock=false playwright
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.browser-cache"
npx playwright install chromium
node --test test-field-summary.cjs test-integration-plan.cjs test-local-data.cjs
python -m unittest test_server.py
node test-browser.cjs
node test-projects-browser.cjs
node test-discovery-browser.cjs
node test-ui-browser.cjs
node test-view-stack-browser.cjs
node test-local-workflows-browser.cjs
```

## Verification

15 JS unit tests and 4 Flask tests; six isolated Linux Chromium browser suites, including the new local-workflows suite. The latter covers future date text/picker/photo/handoff rejection, required location, exact/coarse/withheld privacy, clearing precision, ranges and group-specific/Other choices, site selection, outside Add rejection, boundary edits with journal retention, Trash quota failures/restore/reload/72-hour expiry, backup optional-field preservation and privacy/future import rejection, responsive widths 320/390/768/1280, and no outbound requests/GPS. Existing discovery retry identity, cross-tab changes, autocomplete, image URL ownership, CSV, navigation and closable-view regressions remain required.

Windows/Edge, Firefox/Safari, touch device ergonomics, real geography and manual screen-reader review are **not verified** by these Linux Chromium tests.
