# TERRA
Eco Token
# TERRA

TERRA is a project exploring tools for recording and reviewing nature observations.

## First prototype
The browser-only journal records plant, fungus, or other observations with a name (or “Unknown”), notes, a date, and a location-privacy preference. An optional photo is previewed temporarily; it is not saved. No location is collected for journal entries. A separate **Explore a photo** prototype demonstrates local, ephemeral photo selection and review of explicitly illustrative mock candidates.

## Status
Early local-first prototype — no iNaturalist, BOLD, GenBank, real AI or scientific review service is connected. See [the next-stage integration roadmap](ROADMAP.md) for review gates and deliberately deferred work.

This branch builds on the local Projects implementation in **PR #11** (`feature/local-field-summary`); it is a stacked follow-up, not a replacement for that PR. Main and open PRs/issues were inspected; the independent photo-handoff PR #7 is untouched.

## Run locally

Use Python 3.9+ and a modern browser with JavaScript and localStorage enabled. From the repository folder:

```sh
pip install -r requirements.txt
python3 server.py
```

Open **http://localhost:8080**. The Flask development server listens on `0.0.0.0`, using `PORT` if set (default `8080`). Stop it with Ctrl+C. This is a local development server, not a production hosting setup.

There is no frontend build step, framework, CDN, external service, account, or database. The frontend is plain `index.html`, `styles.css`, and `app.js`. Flask only serves files and `/api/health`; it does not receive observations. Use the server rather than opening `index.html` directly, because `file://` storage behavior varies between browsers.

### Windows (PowerShell)

From your local TERRA repository folder, review this PR branch without merging:

```powershell
git fetch origin
git switch --track origin/feature/local-discovery-project-roadmap
# If you already have that local branch: git switch feature/local-discovery-project-roadmap
py -m pip install -r requirements.txt
py server.py
```

Open **http://localhost:8080** and keep the terminal running. Use `python` instead of `py` if that is your installed launcher. Stop with Ctrl+C. Keep using the same browser profile, hostname, and port to see your existing journal; export a backup before testing.

Check that there is **one date bar**: type `2024-02-29`, choose another date with its calendar icon, then type again. Try `2025-02-29` and `1900-02-29` (must not save), and `2000-02-29` (valid). Tab to the calendar icon and open it with Enter/Space. Type `Trich`, `BRIDGESII`, and `harz`; confirm matching local suggestions and save an unlisted custom name. Reload and verify dates/names persist. Resize to a narrow window.

Optional automated checks, in a second PowerShell terminal (Node.js 18+ required; server still running):

```powershell
npm install --no-save --package-lock=false playwright
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.browser-cache"
npx playwright install chromium
node --check app.js
node --check test-browser.cjs
node test-browser.cjs
```

These Windows steps are provided for local review; automated tests here run on Linux Chromium. Firefox/Safari and a manual screen-reader review remain unverified. Nothing is merged or deployed by these commands.

## Use the journal

1. Choose **Plant**, **Fungus**, or **Other**.
2. Enter a species/common name, choose a starter suggestion, keep a custom/manual name, or leave it blank to save as **Unknown**.
3. Type the observation date as **YYYY-MM-DD**, or use the calendar icon **inside the same date bar**; both stay in sync. It defaults to today's local date. Optionally add notes.
4. Optionally select an image up to 10 MB to preview. You can remove the preview; it is also cleared after a successful save or reload.
5. Choose **Hidden**, **Approximate**, or **Exact** as a location privacy preference. All three are preferences only: none requests geolocation or saves coordinates.
6. Select **Save to local journal**. This saves only to this browser, not to iNaturalist. The saved list shows newest observation dates first, with category, name, notes, and the privacy preference.
7. Use **Delete** on an entry and confirm the browser prompt to remove it permanently. Cancel leaves it unchanged.
8. Select **Export JSON** to download all saved entries, plus an export timestamp and format version. Check your browser's downloads and keep the file somewhere safe.
9. To bring back an exported backup, use **Restore a JSON backup** as described below. Nothing is imported just by selecting a file.

## Explore a photo — local-first MOCK prototype

This is a UI/interaction prototype, **not AI identification**. It has no model, comparison database, API, image upload, or scientific verification. The browser decodes photos only to display previews. The Analyze button returns a fixed set of three examples for the chosen organism group; it does not inspect pixels. Parts, date, region, and additional views do not influence candidates or scores.

1. Choose **Plant**, **Fungus / mushroom**, **Insect / animal**, or **Unsure**.
2. Choose one local image, or first enable **Add multiple views of the same organism** to add up to **6** photos in one selection or across selections. For another organism, reset and start a separate review. The prototype cannot verify that the photos show the same organism. To turn multi-view mode off, remove extra views first.
3. Each preview has **Remove photo** and a required **Photographed part** selector. Plants offer leaf, flower, fruit, bark, whole organism, other; fungi cap, gills/underside, stem, whole, other; animals dorsal/top, ventral/underside, wing, leg, whole, other; Unsure offers whole, detail/close-up, other. Changing the group clears part choices so incompatible context is never silently reused.
4. Optionally choose an observation date and a **continent-level coarse region**, or keep **Prefer not to say**. No GPS permission is requested; there is no coordinates/address field, EXIF parser, or metadata-based autofill. Context stays temporary and does not affect the mock.
5. Select **Analyze — show MOCK suggestions**. Required fields and readable previews are checked first. Each candidate has a name, **Demo data** source, and arbitrary **Illustrative confidence** (72/48/26 out of 100). These numbers are **not calibrated probabilities**, similarity scores, or evidence for a match. The results include group-specific safety/review caveats; never use this demo for edibility, medical, or wildlife safety decisions.
6. Accept a demo candidate, use a corrected name (1–120 characters), or leave uncertain. A live status confirms the temporary, unverified review. No choice changes or creates a journal entry. Changing photo/context inputs hides stale results and clears the previous review; analyze again.
7. **Reset photos & review**, reload, or leave the page to discard the prototype state. Object URLs are revoked on removal, decode failure, reset, and page exit. Files, filenames, context, suggestions, and review choices are never written to localStorage/sessionStorage, exports, or a backend. The browser/OS still controls the original files; reset does not delete them or promise forensic memory erasure.

Supported preview types: non-empty JPEG, PNG, WebP, GIF, AVIF, up to **10 MB per file**. Unsupported/oversize selections are rejected as a batch without removing existing previews. Undecodable files are removed with an error; actual decoding support depends on the browser. No HEIC conversion, image resizing, camera capture integration, duplicate-photo detection, or persistent gallery is included. This is local-first behavior after the page loads, not an installed offline/PWA app.

The existing journal still uses `terra.observations.v1` and exactly `{ id, type, name, notes, date, privacy }`. Its separate photo preview remains unchanged. There are no schema migrations, new observation fields, auto-filled names, or persisted identification results.

### Manual Windows review (PowerShell / VS Code)

These steps do **not** merge or deploy. Use Python 3.9+ and current Edge or Chrome. Keep the same browser profile and `localhost:8080` origin when comparing existing journal data.

```powershell
# From this repository folder; first commit/stash unrelated work if needed.
git switch feature/local-photo-identification
py -m pip install -r requirements.txt
py server.py
```

Open **http://localhost:8080** (not the file directly). If `py` is unavailable, use `python` in both commands. If 8080 is occupied, stop the other process or set `$env:PORT = "8081"` before starting and browse that port; note that a different port has a separate journal.

- **Baseline:** export a backup if you have real entries. Note the count/names. Do not clear browser site data. Confirm the familiar journal still saves, reloads, exports, and restores with a preview/confirmation.
- **Validation:** in Explore a photo, analyze empty; expect a focused group error. Choose a group and analyze without a file; expect an image error. Select a `.txt`, an empty or corrupt image, or an image over 10 MB; expect an error without lost journal data. Select a valid JPEG/PNG, then analyze before choosing its part; expect the missing-part control to receive focus.
- **Parts/context:** check all four groups and their part choices. Changing group must clear the old part and results. Test a blank date/region and a valid optional date/continent. No location permission should appear.
- **Single/multi:** preview and remove a photo. Enable multi-view and choose 2 photos of the same organism (Ctrl+click in the Windows file picker), then add another selection. Choose a part per view. Try a seventh photo; expect the six-view limit. Try turning multi-view off while extras remain; expect a clear remove-extra-views error.
- **Mock/review:** analyze. Verify MOCK/Not real AI, Demo data, non-calibrated confidence disclaimer, and the group-specific caveat. Accept one candidate, try an empty corrected name (error), correct it, then leave uncertain. These are temporary choices, not saved IDs. Change context and confirm stale results disappear.
- **Privacy:** press F12 → **Network**, clear the log *after* the page loads, and use the entire photo flow. There should be **no HTTP/API requests** (local `blob:` preview reads are allowed). Under **Application → Local storage**, existing observation data must be unchanged. Do not delete storage. Reload: previews, context, and review should be empty; the journal must remain. Export JSON and confirm no photo, filename, region, or identification fields were added.
- **Accessibility/layout:** navigate with Tab/Shift+Tab, Space for the multi-view checkbox, and Enter for buttons; check visible focus and labels. Validate focus on errors and the result heading. At 320/390 px device emulation and 200% zoom, controls/results should wrap without horizontal scrolling. If available, check status announcements with Windows Narrator (full screen-reader certification is not claimed).
- **Reset:** use Reset photos & review; all prototype fields/previews/results clear and focus returns to the group. Stop the server with Ctrl+C when finished.

Optional automated checks in a second PowerShell terminal (leave the server running):

```powershell
npm install --no-save --package-lock=false playwright
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.browser-cache"
npx playwright install chromium
node --check app.js
node --check test-browser.cjs
node test-browser.cjs
```

The automated suite uses its own fresh browser profile; it does not touch your normal journal. Windows manual steps are documented but were not executed in this Linux workspace.

## Add a discovery to a local TERRA project

The **second green action under Record a discovery is Add to TERRA project**, not an iNaturalist button. It writes only local project membership references.

1. Create an open project in **Projects / Field Summary** below. If there are none, the action is disabled with a create-project link; if all are complete, reopen one.
2. In Record a discovery, choose **Observation to add**: the current draft, or a specific saved observation (name, date and ID shown). Choose a **TERRA project**.
3. For a draft, Add validates it, saves one journal record, then adds that ID to the project. For a saved observation, Add reuses its exact ID without writing another journal record. Repeated Add is idempotent. Ordinary **Save to local journal** automatically selects the newly saved record for a subsequent Add; the project choice is retained.
4. Day projects require the exact date; species projects require an exact case-sensitive, trimmed name. Site/custom projects permit explicit membership, not inferred geographic matching. Completed projects cannot accept records until reopened. Invalid/missing targets or scope mismatches do not create new journal entries.
5. Review the saved membership/counts in Projects / Field Summary. An unsaved project-editor draft is preserved; if another view changed the project storage, use **Discard draft / refresh** and review before saving it. Never overwrite a stale draft blindly.

**Failure semantics:** localStorage has no multi-key transaction. If the journal write fails, no project write is attempted. If the journal succeeds but the project write fails, the UI explicitly says the observation is already saved and keeps the discovery draft. Retrying the unchanged draft in that page reuses the same ID. After a reload, select the saved observation instead of recreating the draft. Editing a partially saved draft creates a new observation rather than silently editing the saved one. No rollback/delete of a successfully saved journal record is attempted. Truly simultaneous tabs are not transactional; prefer one editing tab. Project membership is still excluded from journal JSON backups.

## Identification provenance (staged UI only)

Every saved observation links to a staged provenance definition, not an assigned badge. The exact labels **AI-suggested**, **community-identified**, and **expert-confirmed** describe three independent future evidence tracks, not a progression. Definitions specify model/version/uncertainty for AI, attributed reviewers/evidence and explicit consensus policy for community review, and relevant expert identity/explicit confirmation/evidence for expert review. There are no status selectors, automatic labels, community consensus, expert validation or reward claims. Fixed photo mocks are not AI evidence.

Assignment/persistence is deliberately deferred until reviewer trust and a separately versioned optional provenance store/import policy are designed. Nothing was added to the six fields (`id`, `type`, `name`, `notes`, `date`, `privacy`) or version-1 JSON export/restore. Do not append new metadata to old exports: the existing importer intentionally strips unknown fields.

## Genetic Data: unconnected local plans

Separate **BOLD lookup — future / local preview** and **GenBank lookup — future / local preview** paths show only a local plan, never fake matches. Enter an optional taxon/record identifier and/or temporary DNA. The sequence syntax checker accepts plain IUPAC DNA or one FASTA record, up to 10,000 total input characters; it rejects empty/header-only sequences, additional records, RNA U, gaps, digits and other symbols. Lowercase and whitespace are supported. Preview reports only base and ambiguity counts—not identity, biological validity, sequence quality, service compatibility or search results. FASTA headers and sequence contents are not echoed into the preview.

Inputs/previews remain in page memory only: no local/session storage, files, journal, project, JSON or CSV persistence; no network APIs or service calls; no credentials. Clear explicitly with **Clear genetic inputs**; leaving/reloading the page also clears them. This is not a secure-memory erase guarantee, and browser/OS clipboard or extensions are outside app control. No sequence-saving action is provided. **GenBank submission is not search** and is not implemented. iNaturalist publishing remains a separate future authenticated, explicitly consented action, never implied by Add to TERRA project.

### Manual review of the clarified integration scope

- In a fresh profile, verify the no-project empty state. Create custom/day/name/site projects and a completed project. Add a new draft, repeat Add, then add a saved observation to another project. Confirm journal count/IDs do not duplicate, scope mismatches do not save, completion locks membership and reload preserves references/counts.
- Save normally then Add; verify the saved observation is selected. Keep an unrelated discovery draft while adding an existing record; it must stay untouched. Keep an unsaved project-editor draft while adding; it must require refresh before a stale save.
- Read all three provenance definitions. Verify no observation is labeled as AI-, community- or expert-validated and no status can be assigned.
- Preview a taxon-only BOLD plan, then a GenBank plan. Try `>example` followed by `ACGTNN`, then `ACGU`, two FASTA records and a header without bases. Inspect syntax errors/counts and the unconnected/submission warnings. Clear/reload and confirm no sequence remains; export JSON and verify only the original six fields exist. In browser devtools, verify no requests occur on either preview or project action.
- Use Tab/Shift+Tab, native select keyboard controls and Enter/Space on actions; review live statuses and error alerts with a screen reader, and test 320/390 px widths. Automated Linux Chromium checks pass; Windows, Firefox/Safari and a manual screen-reader audit remain human review items.

## Restore an exported backup

1. Keep your original backup. If the current journal is readable, **Export JSON** first for an extra safety copy.
2. Under **Restore a JSON backup**, choose an unchanged TERRA `.json` export, no larger than **5 MB**. The browser reads it locally; there is no upload or server request.
3. Review the count of valid records, additions, and duplicate IDs to skip. The preview lists the first 20 records with add/skip labels, names, dates, and categories; **all** records are validated, not just those displayed.
4. Select **Confirm merge** to add the new records, or **Cancel restore** to make no changes. Selecting a different file discards the previous preview. A file containing only duplicates (or no records) cannot be confirmed because there is nothing to add.
5. Check the success status and your observations. Export another backup if desired.

### Restore rules and caveats

- Restore accepts the app's own wrapper: `format: "terra-observations"`, numeric `version: 1`, an export timestamp (`exportedAt`), and an `observations` array. Raw arrays, other formats, missing metadata, and unsupported versions are rejected. Use the original export rather than editing its wrapper. The filename must end in `.json` (case-insensitive); JSON, unspecified, or generic binary MIME types are supported, while conflicting file types are rejected.
- **The whole file is checked before any write.** Every observation needs a nonblank string ID and name (name up to 120 characters), a `plant`/`fungus`/`other` type, a valid calendar date (`YYYY-MM-DD`, year 0001–9999), string notes up to 3,000 characters, and a `hidden`/`approximate`/`exact` privacy preference. Any invalid record—even a duplicate—rejects the entire file, without a partial import. Unknown observation fields are discarded; only the six journal fields are saved.
- **Merge only, never replace.** Matching is by exact, case-sensitive ID, not name or date. Current records always win, even if the imported copy has different text. Repeated IDs inside one file use the first valid occurrence; the rest are counted as duplicates. Similar observations with different IDs are both kept. Restore cannot edit existing records or undo a previous merge; deletion remains a separate confirmed action.
- Confirmation re-reads current browser storage. If the journal changed after preview, an updated preview requires **another confirmation**. Truly simultaneous writes in separate tabs are still not transactional; use one active editing tab during restore.
- A full/blocked storage write leaves existing records, the current form draft, and the restore preview intact. Check permissions or free space without clearing journal data, then retry confirmation. A corrupt/unreadable current journal pauses saving, deletion, and restore rather than replacing potentially recoverable data. Do not clear site data; keep the backup and seek recovery of the existing browser data first. This is not a damaged-localStorage repair tool.
- Empty files and files over 5 MB are rejected before reading. Larger exports need a separate recovery plan; there is no automatic splitting or size-limit bypass. Photos and coordinates are not in TERRA exports and cannot be restored. Names and notes remain potentially sensitive, and are rendered as literal text, not HTML.

## Starter name suggestions and dates

No curated taxonomy dataset exists in the current repository. `STARTER_SPECIES` in `app.js` is a transparent, hand-written two-name starter list: **Trichocereus bridgesii** and **Trichoderma harzianum**. These are examples, not verified identifications, an authoritative taxonomy, or a complete species catalog. Matching trims the search text and shows **every local name that starts with or contains it**, case-insensitively, without filtering by Plant/Fungus/Other. Nothing is queried or downloaded.

Type `Trich` to see both; `Trichoc`, `bridgesii`, or `harz` narrows the list. Arrow Up/Down moves through suggestions and an explicit **Keep … as my manual name** option; Enter chooses the active option without submitting. Click/tap also selects. Escape closes, and Tab leaves without changing the text. Merely typing or blurring never forces a suggestion. Custom names are always allowed and saved as text (trimmed as before); a blank saves as Unknown. To extend the examples, edit `STARTER_SPECIES`, update the visible two-example description, and extend the tests. Any larger curated dataset needs separate provenance, licensing, and maintenance review.

One integrated date bar accepts keyboard input in strict `YYYY-MM-DD` format and includes a calendar icon backed by the browser's native date picker. There is no second visible date field. Tab from the text to the icon, then press Enter or Space to open the calendar; click/tap also works. Invalid text clears the internal picker value but remains editable in the bar; calendar selections immediately update that same text. Impossible dates, year 0000, and malformed formats are rejected; leap days, years 0001–9999, and future dates retain the existing validation rules. Storage/export still use the same ISO date string and version-1 schema. Native calendar presentation varies by browser/OS; there is no custom calendar widget.

## Projects / Field Summary — local descriptive reporting

This small prototype is a step toward Trevor's reporting idea, **not an AI summary, ecological inference, mapping tool, trend analysis, or species verification**. It does not call an API or add a reporting backend. Existing journal saving, starter suggestions, dates, JSON export/restore, and the explicitly mock photo-review flow remain unchanged. No mock review rewards or camera-roll permissions have been added.

1. Scroll to **Projects / Field Summary** and choose **New project**.
2. Enter a title (required, 1–120 characters), group type, optional date/site/species and notes (up to 3,000 characters).
   - **Project date / day:** requires a valid `YYYY-MM-DD` date, year 0001–9999; only records on that exact day are eligible.
   - **Species / name:** requires a recorded name, up to 120 characters; exact, case-sensitive matching after trimming. This is not a taxonomy lookup.
   - **Site / name:** requires a site label, up to 120 characters. Sites are manually assigned at the **project** level, not inferred from observations. The existing journal has no site/coordinate fields, so any journal record can be selected.
   - **Custom collection:** requires only the project title; any journal record can be selected. An optional date must still be valid.
3. Check existing observations and **Create project**. No matches are automatically selected; later journal additions are never silently included. An empty project is allowed and explains that there is nothing to summarize; no data is invented.
4. Select a saved project to edit its metadata or check/uncheck records, then **Save project changes**. Changing a day/species scope removes nonmatching selections **on save**, with a visible warning first. Unsaved edits never affect the saved report or CSV.
5. **Mark complete** locks editing of the saved project; **Reopen project** enables it. Completion is a workflow label, not scientific validation or a frozen snapshot. Switching projects or using **Discard draft / refresh** discards unsaved project edits.
6. Review scope, reference/included/missing counts, date/name tables, and the included-record ledger. Each group lists the contributing observation IDs. Tables support horizontal scrolling with keyboard focus on narrow screens.
7. **Export summary CSV** downloads saved scope, notes, state, counts, and one row per included record, plus missing-ID rows (not counted) or an empty-report row. Counts repeat as project metadata, not extra observations. Treat site labels/notes as sensitive. CSV quotes commas/newlines/quotes and prefixes formula-like text with an apostrophe for spreadsheet safety. It is a readable report, **not a restore format**.

### Metric definitions and compatibility

- **Total observations:** number of currently resolvable, explicitly included IDs. Each ID counts once, regardless of repeated species/date. Other journal records do not count.
- **Unique taxa labels:** distinct exact trimmed recorded names, excluding `Unknown` in any letter case. Case variants and common/scientific synonyms remain separate; unverified/custom names are labels, **not verified biological richness**. Unknown records still count in totals and tables.
- **Records by date/species:** deterministic grouping of those same included records, with exact name labels and ISO dates. Both grouped counts sum to the total. No abundance, sampling effort, ecological condition, presence prediction, or trend is inferred.
- Projects use a separate localStorage key, `terra.projects.v1`, with `{format: "terra-projects", version: 1, projects: [...]}`. Each stores `id`, `title`, `type`, `date`, `site`, `species`, `notes`, `complete`, and `observationIds`. Existing journal IDs already support references; **no duplicate observations are stored and the observation schema/key are unchanged**.
- Existing browsers with no project key are treated as an empty project list without writing or migrating their journal. The version-1 project reader validates the whole payload, rejects duplicate project/reference IDs and malformed/unsupported versions, and selects only known fields, just like the existing journal's JSON compatibility style. No destructive auto-migration is attempted.
- Journal deletion leaves a visible **missing ID reference**, excluded from all metrics. Restoring that exact ID through journal JSON restore reconnects it; a different ID with the same name does not. Reopen an affected project and uncheck the missing reference to remove it permanently. Completed reports also reflect current journal deletions/restorations.
- Damaged/blocked journal or project reads pause project writes/exports rather than overwrite data. Project write failures retain the draft and saved bytes. Invalid project data does not block the independent journal. Tabs refresh saved reports without replacing drafts; stale project writes require an explicit refresh/review. localStorage is not transactional: use one active editing tab.
- **Journal JSON exports/restores do not include projects.** There is no project JSON backup/restore UI in this small step; keep CSV reports and do not clear browser data. Both projects and journal are local to the exact browser profile/origin. Project deletion, shared/synced projects, frozen reports, charts, richer taxonomic normalization, and geographic matching are outside this prototype.

### Windows manual review (PowerShell / VS Code)

Review the branch without merging or deploying. Start from a clean working tree in your existing repository; stop if Git reports local changes/conflicts (do not force-reset them):

```powershell
git status -sb
git fetch origin
git switch --track origin/feature/local-field-summary
# If this local branch already exists: git switch feature/local-field-summary
python -m pip install -r requirements.txt
python server.py
```

Open **http://localhost:8080** using the same browser/profile/address as your existing journal to check compatibility; export a journal JSON backup first. A different port, profile, `127.0.0.1`, or private window has separate storage. Do not clear an existing journal to test the empty state—use a separate browser profile instead. Stop the server with Ctrl+C when finished.

- In a fresh profile, confirm the project empty state explains how to add/restore journal observations. Create an empty project; expect zero counts and an empty CSV row.
- In your normal test journal, add two `Oak` records on `2024-02-29`, one blank-name `Unknown` record on `2025-01-01`, and one `Birch` record not selected. Include only the first three in a custom project: expect **3 observations, 1 unique taxa label**, date counts **2 + 1**, name counts **Oak 2 / Unknown 1**. Compare IDs with the source table and CSV. Existing observations must survive reload unchanged.
- Try all four grouping types, missing title/site/species/day, impossible `2025-02-29`, valid `2024-02-29`, a species name with different case, and a day with no matches. Confirm no records are auto-selected and scope-change exclusions are disclosed. Uncheck a record, save and verify all counts update.
- Mark complete, reload, reselect the project, verify editing is locked, then reopen/edit/save. Delete an included journal record and confirm its missing ID is visible and excluded, even when complete; restore the original journal JSON and confirm that ID reconnects.
- Enter punctuation/newlines and text such as `=1+1` in a project title or notes; inspect the CSV with Notepad and Excel. Confirm literal text, correct rows, and apostrophe-prefixed formula-like cells (nothing executes).
- Open a second tab, edit the same project there, and verify the first tab's unsaved draft survives but cannot overwrite the newer project until **Discard draft / refresh**. Prefer one editing tab thereafter.
- Use Tab/Shift+Tab, Space to toggle checkboxes, and Enter on buttons. Review alerts/statuses and table headers with your screen reader. Resize to 320/390 px; scroll tables without whole-page overflow. In browser DevTools Network, after the page assets load, project editing/export should make **no network requests**. No GPS/camera-roll/account permissions should appear.
- Regression-check the two starter suggestions (`Trich`), manual/calendar dates, photo preview/save/reload, JSON export/restore preview/cancel/confirm and duplicates, and the existing clearly labeled MOCK photo-review flow. Windows/Excel, Firefox/Safari, and a manual screen-reader audit still need human verification; automated checks run in Chromium on Linux.

## Roadmap — not current connections

- **iNaturalist:** local journal first. A future, optional flow would let the user review a saved observation and privacy details, connect an account, and explicitly approve publishing. Saving locally is never publishing consent. No authentication, upload, publishing button, or external API calls are implemented. Persistent photos, location handling, consent, and current API requirements need separate design before this is possible.
- **BOLD Systems:** a potential future source of **DNA barcode reference data** for biodiversity work; not integrated, queried, or used by these suggestions.
- **GenBank:** a potential future **nucleotide sequence database** reference integration; not integrated, queried, or used by these suggestions. It is not the same resource as BOLD's barcode reference data.

These are planning notes only, not claims of access, connections, identification, or scientific validation. Any integration needs a separate scope and review of terms, provenance, privacy, and network behavior.

## Data, privacy, and limitations

- Observations stay in **this browser profile on this device**, in localStorage under `terra.observations.v1`. They are not synced, automatically backed up, uploaded, or submitted to iNaturalist or a scientific review service.
- Browser storage belongs to an origin (protocol, hostname, and port). Different browsers/profiles, `localhost` versus `127.0.0.1`, or a changed port/domain have separate journals. Clearing site data, uninstalling the browser, private browsing, or browser eviction may remove entries. Export regularly.
- **Photos are preview-only.** Neither image data nor filenames are saved or exported. A saved observation has no persistent photo. The app never reads photo location metadata.
- **Privacy selection is not location storage or a protection mechanism.** Even “Exact” stores only the preference word, never coordinates. Avoid putting sensitive locations or personal information in names or notes; text is saved as entered and included in exports.
- Local storage is not encrypted or password protected. People with access to this browser profile, and scripts on the same origin, may access it. Treat downloaded JSON as potentially sensitive.
- JSON backups can be restored through the validated, previewed merge above. There is no editing, real identification, mapping, or offline app installation; the separate mock photo-review prototype is not an identification service. Keep original exported files. The page must first be loaded from the local server; offline-first/PWA support is not implemented.
- Names are limited to 120 characters and notes to 3,000. Empty names become Unknown. Any valid calendar date is allowed, including future dates; no species identification is performed.
- Read errors or malformed stored data pause saving/deletion/restore rather than silently replacing existing records. Failed writes preserve the form, restore preview, and existing entries. Check storage permissions and reload; do not clear potentially recoverable data. There is no built-in damaged-data recovery tool.
- Tabs on the same origin refresh when storage changes; truly simultaneous writes are not transactional. Prefer one active editing tab.
- All user text is rendered through DOM nodes and `textContent`, not interpreted as HTML. This does not make the journal a secure vault.

## Checks

Coordination note: a concurrent task opened PR #4 while the focused autocomplete task was testing. Its startup/matching fixes overlapped, so additional visible/live no-match feedback, pointer-focus handling, and dynamic/keyboard/mouse/touch/accessibility regressions were consolidated into PR #4. Duplicate PR #5 is superseded; no merge/deployment. The combined full Chromium suite passed, including the integrated date bar and JSON restore. Syntax, manifest, Flask routes, and whitespace checks also pass. Workspace-only Chromium libraries/fonts were extracted into ignored `.browser-cache`, with local `LD_LIBRARY_PATH`/`FONTCONFIG_FILE`; no application dependencies were added.

Basic checks (no browser-test tools needed):

```sh
node --check app.js
node --check test-browser.cjs
node --check test-projects-browser.cjs
node --check test-discovery-browser.cjs
node --test test-field-summary.cjs test-integration-plan.cjs
python3 -m unittest test_server.py
node -e "const fs=require('fs'),vm=require('vm'); for (const m of fs.readFileSync('index.html','utf8').matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);"
python3 -c "from server import app; c = app.test_client(); assert all(c.get(p).status_code == 200 for p in ['/', '/app.js', '/styles.css', '/api/health'])"
```

An optional development-only Chromium regression check is included. With Node.js 18+ installed, run the following from the repository folder while the Flask server is running on port 8080:

```sh
npm install --no-save --package-lock=false playwright
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-cache" npx playwright install chromium
# On Linux, if browser libraries are missing (may require admin permissions):
# npx playwright install-deps chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-cache" node test-browser.cjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-cache" node test-projects-browser.cjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-cache" node test-discovery-browser.cjs
```

PowerShell equivalents for the automated browser checks (server running in another terminal):

```powershell
npm install --no-save --package-lock=false playwright
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.browser-cache"
npx playwright install chromium
node --test test-field-summary.cjs test-integration-plan.cjs
python -m unittest test_server.py
node test-browser.cjs
node test-projects-browser.cjs
node test-discovery-browser.cjs
```

`test-integration-plan.cjs` adds pure membership idempotency/immutability/scope/completion and single-record IUPAC DNA validation tests. `test-discovery-browser.cjs` adds new/saved/ordinary-save project handoff, failed journal/project writes and retry identity, stale drafts and cross-tab completion, six-field version-1 export/restore, unassignable provenance definitions, distinct local genetic plans, literal-text safety, no sequence persistence, keyboard/mobile checks and zero outbound/network API calls. All three browser suites, nine JS unit tests, Flask unittests, syntax/manifest/whitespace checks were run successfully on Linux Chromium for this follow-up. Test-only missing Chromium libraries/fonts were extracted under ignored `.browser-cache`; they are not runtime dependencies.

`test-field-summary.cjs` covers versioned JSON compatibility/validation, exact scopes, metric reconciliation, deterministic ordering, missing/unknown records, and CSV quoting/formula safety. `test-projects-browser.cjs` covers all group types, membership editing, complete/reopen/reload, source tables, CSV downloads, missing/restored IDs, unchanged journal bytes/schema, quota/read/version failures, concurrent drafts, labels/keyboard/mobile widths, and no remote or network API calls. The original full `test-browser.cjs` remains a required regression check; the Flask unittest checks routes, manifest, and HTML IDs/labels.

### Manual review: JSON export and restore

The same suite now also exercises the mock photo flow: all four organism groups/part resets and caveats, required fields, unsupported/empty/oversize/undecodable photos, single/multi-image limits, preview removal and object-URL cleanup, mock labels/source/confidence, accept/correct/uncertain controls, literal text safety, context invalidation, reset/reload, unchanged local/session storage and journal schema, populated mobile widths, and no HTTP requests during the flow. `test-browser.cjs` is the current regression entry point. There is no configured linter/build system; checks are JavaScript parse checks, Flask route smoke checks, and browser regressions.

For a manual review, use Tab/Shift+Tab and the skip link, submit an empty name, reload to verify persistence, preview an image then save/reload to verify it is not retained, cancel and confirm deletion, and inspect the exported JSON. Restore it once to preview duplicates (no additions), cancel, then delete one entry and restore again to preview and confirm its recovery. Try an invalid JSON file and verify that nothing changes. Resize to a narrow mobile viewport. No merge or deployment is required to review this feature branch.
Playwright and Chromium are test tools only; the app itself needs no npm dependencies or external network requests. The check uses a fresh, isolated browser profile and tests both starter names, prefix/substring/case matching, custom names, keyboard selection/dismissal, safe suggestion rendering, one-bar layout, Enter/Space native-picker activation, typed invalid dates and leap days (including century rules), calendar/text input and change synchronization, unchanged date storage, local-only messaging, saving/reloading, Unknown names, safe text rendering, image preview/non-persistence, JSON export/restore round-trips, preview/cancel/confirm, duplicate IDs, invalid files/schema/records, restore write-failure preservation/retry and changed-journal reconfirmation, confirm/cancel deletion, cross-tab updates, corrupt/blocked/full storage, labels, and overflow at 320, 390, 768, and 1280 pixels. Remote requests are blocked and asserted absent; fetch, XMLHttpRequest, WebSocket, EventSource, and sendBeacon calls are trapped and asserted absent across page loads. These checks do not establish behavior for a future integration. The suite has passed in Chromium, including touch selection and open-dropdown mobile overflow checks. Firefox/Safari and a **manual screen-reader audit remain necessary**, especially combobox announcements and native calendar operation.

### Manual review: Species suggestions and typed dates

Type `Trich` (both starter names), `Trichoc` (one), `RICH` (both substring matches), `harz` (one), and an unlisted name (visible no-match feedback with a manual-name option). Results update with each keystroke, replacement/paste, and deletion. Select by arrows/Enter, mouse, and touch; the field fills but the journal count stays unchanged until Save. Check Escape/Tab retain custom text and clearing closes the list. This searches every matching entry in the **two-name starter dataset, not all real species or biodiversity**.

For a manual review, use Tab/Shift+Tab and the skip link. Type `Trich`, navigate with arrows and Enter, reopen with an arrow, dismiss with Escape, and keep an unlisted name. Check that Enter on an active suggestion does not save. Type `2024-02-29` (valid) and `2025-02-29` (invalid), then choose a calendar date and verify the text updates. Confirm local-only save/publishing notices. Submit an empty name, reload to verify persistence, preview an image then save/reload to verify it is not retained, cancel and confirm deletion, and inspect the exported JSON. Resize to a narrow mobile viewport. Review with a screen reader (not yet audited). No merge or deployment is required to review this feature branch.

