# TERRA

TERRA is a project exploring tools for recording and reviewing nature observations.

## Current local prototype
The browser-only journal records observations with a name (or “Unknown”), notes, a today/past date, privacy-constrained local schematic location, and recoverable 3-day Trash. Photos are temporary only. Projects support inclusive date windows, prior-observation choices, and editable rectangular local site boundaries. No real geographic mapping or external service is connected.

**Latest PR #13 update:** [workspace, same-source local profile, non-monetary terrarium awards, multiselect Map and searchable Observation dropdown](NEXT-UI.md). **21 JS tests, 4 Flask tests and 7 full Chromium suites pass.** See that guide for current limitations, schema, tests and PowerShell update/run steps. Earlier mock-profile/six-destination test-history descriptions below are superseded.

Existing [location/privacy, Trash, project scopes, compatibility and verification](LOCAL-WORKFLOWS.md) safeguards remain. That document supersedes older test-history descriptions below of six-field-only saves, future dates, permanent Delete, and label-only sites. Legacy six-field records still load without being rewritten. Export before updating; do not downgrade after saving optional fields.

## Status
Early local-first prototype — no iNaturalist, BOLD, GenBank, real AI or scientific review service is connected. See [the next-stage integration roadmap](ROADMAP.md) for review gates and deliberately deferred work.

`integration/pr7-pr11-pr12` combines PR #11, its stacked follow-up #12, and independent PR #7 on main `d82d733`, preserving all three histories. Photo review transfers each of the seven organism groups to the matching discovery category (Unsure maps to Other), and explicitly targets the current draft for project add rather than a previously selected saved record. All groups retain the top three mock examples and three additional ranked examples; added mammal/bird/fish/reptile rows are explicitly unresolved demo placeholders, not a vetted look-alike dataset. Existing PRs are not merged or modified; this is local review only.

See [the combined integration verification record](INTEGRATION.md) for exact input commits, conflict decisions, test results, and complete PowerShell checkout/startup/test commands.

## Navigation: persistent destinations and closable opened views

Every openable view has a **Close view** button: Home, Map, Profile, Feed, Explore a photo, Record a discovery, Your observations, Projects / Field Summary, and Genetic Data. Open views coexist in the main screen stack. Closing hides only that view; it does **not** delete saved observations/projects, clear drafts, discard temporary images, or submit a form. Focus returns to a visible reopen control and a polite message confirms no data was deleted. Reopen from the menu or bottom bar. Each also has Minimize/expand; the Workspace overview reports open/minimized/closed states. The seven persistent navigation links cannot be closed. View visibility is temporary and resets on reload; temporary photos clear on leaving, but local profile text/rewards persist.

**Observation** reopens both photo review and the discovery draft; **Projects / Journal** reopens both projects and saved observations. Menu links can reopen those sections individually. A confirmed photo handoff also reopens a closed discovery draft. **Delete observation** is separate: it moves the record to the visible 🗑 Trash for 72-hour recovery, not immediate permanent deletion.

- **One location context dropdown per draft:** both Explore a photo and Record a discovery start with **Prefer not to say**. Choose **Natural / wild location** (no habitat field), **Cultivated / garden** for optional cultivation details, or **Broad region / locality only** when the setting is unspecified. Each reveals optional broad region and manual locality controls. Changing context clears the previous location; changing region clears administrative detail; reducing precision clears hidden fields. Hidden fields are also disabled. None of these values is saved or exported, regardless of the privacy preference.
- **Top-right navigation:** the existing hamburger keeps its **Profile · local demo** entry, plus Home, Map and links to existing journal/app areas. The redundant standalone header Profile link is removed. Enter/Space toggles the disclosure; Tab follows links; Escape closes it and restores button focus. Selecting a destination closes it and focuses the destination.
- **Persistent bottom navigation:** seven native links with visible labels: **Workspace** (tree), **Map** (map), **Profile** (person), **Feed** (list), **Observation** (camera, not microscope), **Genetics** (DNA), **Projects / Journal** (book). Tab/Shift+Tab and Enter work without custom tab keyboard rules. The current destination has `aria-current`, a border and bold label. Hash links and browser Back/Forward keep the selection synchronized. Observation opens photo review above the discovery form; Projects / Journal opens existing local project tools and saved observations (the menu also links directly to each). The bar uses seven columns on larger screens and two rows of four at 600px and below, with 44px-minimum targets, phone safe-area padding and dynamically measured content/scroll spacing, including enlarged labels.
- **Simpler Home:** the redundant first **Discover TERRA** section is removed; Home targets the existing introduction. No duplicated navigation or Profile tab/content. Map and Profile are separate local previews outside Discover. Feed is a separate **not connected** placeholder, with no invented community activity or posts; `#feed` now opens that placeholder rather than redirecting to Map. Opened previews and journal/forms/projects remain in the stack until individually closed. Profile is available in the top-right menu and the persistent bottom bar, nowhere in Discover.
- **Map-only legend and filters:** these belong only to the Map section, never inside Home or Profile. Close Map to hide them while other views stay open. Green = observation in a natural setting; yellow = observation in a cultivated setting; red = fictional for-sale listing, **never an observation**. Two labeled native multi-select lists allow multiple colors and organisms (OR within each, AND between lists); each includes an All option. Selected filters are summarized. Map comes first, filters beneath, legend beneath those. A polite result count, explicit empty state and Reset Map filters button explain the current selection. Filters affect only the fictional Map observations/listing, never the journal. Observations have round organism icons; listings have square icons and a separate clearly labeled area. Mushroom, plant, bird, snake/reptile, mouse/mammal and bug/insect icons also carry text labels, so neither color nor emoji recognition is required. The grid remains an imaginary local schematic, not geography, coordinates or organism ranges; no map tiles, GPS or lookup.
- **Profile · local fieldbook:** Posts, Projects and Awards tabs read the existing journal and ID-only projects without duplicate storage. Name, bio, symbolic avatar and user-entered/unverified credentials persist locally; no LinkedIn verification, real follows, upload or account sync. Followers/following stay 0, not connected. Three transparent participation badges unlock once-only randomized primitive decorations for the local rewards terrarium. No verified-observation claim or rare-species incentive. Collectibles have no cash/trade/NFT value and are not guaranteed unique globally. Profile/rewards are excluded from journal backups. See [NEXT-UI.md](NEXT-UI.md).

Quick local review: select Mushroom + Plant and Green + Yellow in Map; verify map → filters → legend, selected text and Reset. Save through the searchable organism dropdown and see the same entry in Profile Posts. Edit local profile text and reload; credentials remain unverified. Open Awards, read each rule, remove/place an earned decoration and reload without rerolling. Minimize/close a draft, reopen from Workspace and check it is intact. Journal Trash, future dates, project boundaries and provenance still work. Try all seven destinations, keyboard tabs and narrow layouts; Feed/Genetics remain unconnected. See [NEXT-UI.md](NEXT-UI.md) for full checks and limitations.

## Run locally

Use Python 3.9+ and a modern browser with JavaScript and localStorage enabled. From the repository folder:

```sh
pip install -r requirements.txt
python3 server.py
```

Open **http://localhost:8080**. The Flask development server listens only on loopback `127.0.0.1`, using `PORT` if set (default `8080`). It is not exposed to the LAN or publicly deployed. Stop it with Ctrl+C. This is a local development server, not a production hosting setup.

There is no frontend build step, framework, CDN, external service, account, or database. The frontend is plain `index.html`, `styles.css`, `ui.js` (ephemeral context/navigation/demos), `app.js` (journal/discovery), `local-data.js` (shared validation/retention/containment), and `local-map.js` (local drawing controls). Flask only serves files and `/api/health`; it does not receive observations. Use the server rather than opening `index.html` directly, because `file://` storage behavior varies between browsers.

### Windows (PowerShell)

In Trevor's existing clone (stop the running server first; export a journal backup), update without merging:

```powershell
Set-Location "$HOME\TERRA-combined-test"
git fetch origin integration/pr7-pr11-pr12:refs/remotes/origin/integration/pr7-pr11-pr12
git switch integration/pr7-pr11-pr12
git pull --ff-only origin integration/pr7-pr11-pr12
python -m pip install -r requirements.txt
python server.py
```

Open **http://localhost:8080** and keep the terminal running. These commands use `python`; the Windows `py` launcher is not required. Stop with Ctrl+C. Keep using the same browser profile, hostname, and port to see your existing journal; export a backup before testing.

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

1. Choose **Plant**, **Mushroom**, **Insect**, **Mammal**, **Bird**, **Fish**, or **Reptile**. **Other** remains available for unlisted groups and existing records.
2. Enter a species/common name, choose a starter suggestion, keep a custom/manual name, or leave it blank to save as **Unknown**.
3. Type the observation date as **YYYY-MM-DD**, or use the calendar icon **inside the same date bar**; both stay in sync. It defaults to today's local date. Optionally add notes.
4. Optionally select an image up to 10 MB to preview. You can remove the preview; it is also cleared after a successful save or reload.
5. Choose **Hidden**, **Approximate**, or **Exact**, then select on the required local schematic map. Exact stores a local-grid pin; Approximate stores a coarse rectangle (or saved project boundary expanded to coarse cells); Hidden discards the selected region and stores only a withheld marker. This is not geographic accuracy; no GPS or external geocoding.
6. Select **Save to local journal**. This saves only to this browser, not to iNaturalist. The saved list shows newest observation dates first, with category, name, notes, and the privacy preference.
7. Confirm **🗑 Delete** to move an entry to Trash. Restore within 3 days (72 hours). After expiry recovery is disabled; permanent cleanup happens on the next successful journal write, not in the background. Cancel leaves it unchanged.
8. Select **Export JSON** to download all saved entries, plus an export timestamp and format version. Check your browser's downloads and keep the file somewhere safe.
9. To bring back an exported backup, use **Restore a JSON backup** as described below. Nothing is imported just by selecting a file.

## Explore a photo — local-first MOCK prototype

This is a UI/interaction prototype, **not AI identification**. It has no model, comparison database, API, image upload, or scientific verification. The browser decodes photos only to display previews. The Analyze button returns a fixed set of six examples for the chosen organism group; it does not inspect pixels. Parts, date, region, administrative detail, and additional views do not influence candidates or scores. The examples are not a taxonomically vetted look-alike set.

1. Choose **Plant**, **Mushroom**, **Insect**, **Mammal**, **Bird**, **Fish**, **Reptile**, or **Unsure**.
2. Choose one local image, or first enable **Add multiple views of the same organism** to add up to **6** photos in one selection or across selections. For another organism, reset and start a separate review. The prototype cannot verify that the photos show the same organism. To turn multi-view mode off, remove extra views first.
3. Each preview has **Remove photo** and a required **Photographed part** selector. Plants offer leaf, flower, fruit, bark, whole organism, other; mushrooms cap, gills/underside, stem, whole, other; insects dorsal/top, ventral/underside, wing, leg, whole, other; mammals head, body, tracks, whole, other; birds head, wing, plumage, whole, other; fish side, fin, head, whole, other; reptiles head, scales, body, whole, other. Unsure offers whole, detail/close-up, other. Changing the group clears part choices so incompatible context is never silently reused.
4. Optionally choose an observation date. In **Location context**, keep **Prefer not to say** or choose natural/wild, cultivated/garden, or broad region/locality only. Natural/cultivated reveal an optional setting description. All three reveal an optional **continent-level coarse region**. After choosing a region, keep **Broad region only** or explicitly choose **Enter state / province manually** or **Enter city / locality manually**. Country/territory and state/province are optional manual fields; the city/locality choice adds an optional locality field. Names vary by country and are not validated. Changing the broad region clears finer detail; reducing precision clears hidden detail. No GPS permission, coordinates/address field, EXIF parser, metadata autofill, geocoding, or external lookup. Avoid sensitive sites; location context is temporary, never saved/exported, and does not affect the mock.
5. Select **Analyze — show MOCK suggestions**. Required fields and readable previews are checked first. The **top three remain visible**. The native **All remaining MOCK candidates** disclosure below them lists all three additional candidates in descending score order, with continued list numbering. Toggle with click, Enter, or Space; any candidate can be selected. All six carry **MOCK / Demo data** and arbitrary **Illustrative confidence / score** (72/48/26/19/12/5 out of 100), labeled non-calibrated. These numbers are **not calibrated probabilities**, measured similarity, or evidence for a match. Never use this demo for edibility, medical, or wildlife safety decisions.
6. Accept a demo candidate, or enter your own taxon/common name (1–120 characters) and click **Use corrected name**. A live status and pressed state identify the selected candidate. **Leave uncertain** or editing the manual name clears the selection. Merely accepting/correcting never changes the journal or discovery form. Changing photo/context inputs hides stale results and clears the previous review; analyze again.
7. Select **Use selected organism to record a discovery**. Empty/uncertain selections are rejected. A browser confirmation summarizes the unverified name, photo count, date and location, warns about replacing draft fields, and requires explicit approval. **Cancel** leaves the draft untouched. Confirmation prefills the name, group (Unsure → Other; all seven named groups stay distinct), all current images, date, and region/administrative fields in **Record a discovery**, then focuses its name for review. Notes and privacy preference are kept; old draft name/group/date/images/location are replaced. An absent optional date stays blank and must be supplied before saving. **This action never submits, saves, or publishes.**
8. Review/edit the discovery form and separately choose **Save to local journal** if desired. Only the existing six journal fields are saved. Temporary images and location fields are discarded on successful save or reload; failed writes keep the entire draft for retry. Location is not silently copied into persistent notes. Any name/notes you explicitly save will remain in journal backups.
9. **Reset photos & review**, reload, or leave the page to discard Explore a photo state. A previously transferred draft is independent: resetting the photo flow does not clear that draft's previews. Remove them with **Remove all transferred previews**, choose a new journal photo (replaces all transferred views), save successfully, or reload. Each area owns its own object URLs and releases them on replacement, removal, decode failure, and page exit. Repeating a transfer replaces rather than appends draft previews. The browser/OS still controls the original files; reset does not delete them or promise forensic memory erasure.

Supported preview types: non-empty JPEG, PNG, WebP, GIF, AVIF, up to **10 MB per file**. Unsupported/oversize selections are rejected as a batch without removing existing previews. Undecodable files are removed with an error; actual decoding support depends on the browser. No HEIC conversion, image resizing, camera capture integration, duplicate-photo detection, or persistent gallery is included. This is local-first behavior after the page loads, not an installed offline/PWA app.

The existing journal still uses `terra.observations.v1` and exactly `{ id, type, name, notes, date, privacy }`. No schema migration or persistent image/location/identification-result fields. A confirmed handoff uses an in-page event carrying local File references; `app.js` owns the independent draft preview URLs. No backend route, model, network call, GPS, iNaturalist connection, or new runtime dependency was added.

### Manual Windows review (PowerShell / VS Code)

These steps do **not** merge or deploy. Use Python 3.9+ and current Edge or Chrome. Keep the same browser profile and `localhost:8080` origin when comparing existing journal data.

```powershell
# From this repository folder; first commit/stash unrelated work if needed.
git fetch origin
git switch integration/pr7-pr11-pr12
python -m pip install -r requirements.txt
python server.py
```

Open **http://localhost:8080** (not the file directly). If `py` is unavailable, use `python` in both commands. If 8080 is occupied, stop the other process or set `$env:PORT = "8081"` before starting and browse that port; note that a different port has a separate journal.

- **Baseline:** export a backup if you have real entries. Note the count/names. Do not clear browser site data. Confirm the familiar journal still saves, reloads, exports, and restores with a preview/confirmation.
- **Validation:** in Explore a photo, analyze empty; expect a focused group error. Choose a group and analyze without a file; expect an image error. Select a `.txt`, an empty or corrupt image, or an image over 10 MB; expect an error without lost journal data. Select a valid JPEG/PNG, then analyze before choosing its part; expect the missing-part control to receive focus.
- **Parts/context:** check all seven groups plus Unsure and their part choices. Changing group must clear the old part and results. Test a blank date/region and a valid optional date/continent. No location permission should appear.
- **Location precision:** initially only Location context is visible. Choose natural/wild, cultivated/garden, or broad-only; with no broad region, finer controls are hidden. Select North America; keep broad only, then try manual state/province and manual city/locality (e.g. Canada / Ontario / Ottawa). Leave fields blank too. Switch city → state: city clears. Switch continent or Prefer not to say: finer values clear. Check the privacy note and confirm no permission prompt or external lookup.
- **Single/multi:** preview and remove a photo. Enable multi-view and choose 2 photos of the same organism (Ctrl+click in the Windows file picker), then add another selection. Choose a part per view. Try a seventh photo; expect the six-view limit. Try turning multi-view off while extras remain; expect a clear remove-extra-views error.
- **Mock/review:** analyze. Verify top three stay visible while All remaining MOCK candidates expands/collapses by keyboard (Tab, then Enter/Space). Check all six names, descending scores 72/48/26/19/12/5, MOCK/Demo data/non-calibrated labels and caveat. Select in either list, try empty/corrected names, then leave uncertain. These are not verified IDs. Change context and confirm stale results disappear.
- **Handoff:** with two photos and a date/location, try transferring with no selection or after Leave uncertain (error). Select a candidate inside the disclosure; click Use selected organism to record a discovery. Read and cancel the confirmation: existing discovery draft unchanged. Repeat and confirm: all images, name, date and location prefill, count/storage unchanged. Notes/privacy must remain. Try a custom taxon with Use corrected name and repeat; editing it without selecting again must not transfer a stale name. A missing date stays blank and prevents save until entered.
- **Draft/image limits:** repeat confirmed transfer; previews replace, never accumulate. Reset Explore a photo: transferred previews still display. Remove transferred previews or choose a journal photo: old previews disappear. Transfer again and Save separately; name/date save, photos and temporary location clear. Reload and export: only `{ id, type, name, notes, date, privacy }`, no photo/location/result fields. No persisted gallery, HEIC conversion, or recovery of images from exports is available.
- **Privacy:** press F12 → **Network**, clear the log *after* the page loads, and use the entire photo flow. There should be **no HTTP/API requests** (local `blob:` preview reads are allowed). Under **Application → Local storage**, existing observation data must be unchanged until you separately press Save in Record a discovery. Do not delete storage. Reload: previews, context, and review should be empty; the journal must remain. Export JSON and confirm no photo, filename, region, or identification fields were added.
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

## Identification provenance (saved discovery details)

Expand **Identification provenance** within a saved observation to read **No identification history yet**. There is no standalone provenance navigation/page and no premature draft selector. Current six-field journal records contain no identification evidence, so none receives an **AI-suggested**, **community-identified**, or **expert-confirmed** badge. Manual names, autocomplete matches, selected fixed photo mocks, project membership and arbitrary scores do not establish review history or community consensus. Saved discoveries, including mock-prefilled ones, retain the neutral state after reload and export/restore.

Future labels require actual attributed evidence: model/source/version, suggestion and uncertainty for AI; reviewers, evidence and an explicit agreement/disagreement policy for community identification; relevant expert identity, explicit confirmation and supporting evidence for expert confirmation. No supported source currently supplies these records, so no new provenance store or schema migration is warranted.

Assignment/persistence is deliberately deferred until reviewer trust and a separately versioned optional provenance store/import policy are designed. No provenance was added to the six base fields (`id`, `type`, `name`, `notes`, `date`, `privacy`). Version-1 JSON now also preserves validated optional `location` and `deletedAt`; unrecognized metadata is still stripped. See [compatibility rules](LOCAL-WORKFLOWS.md#compatibility-and-retention).

## Genetic Data: unconnected local plans

Separate **BOLD lookup — future / local preview** and **GenBank lookup — future / local preview** paths show only a local plan, never fake matches. Enter an optional taxon/record identifier and/or temporary DNA. The sequence syntax checker accepts plain IUPAC DNA or one FASTA record, up to 10,000 total input characters; it rejects empty/header-only sequences, additional records, RNA U, gaps, digits and other symbols. Lowercase and whitespace are supported. Preview reports only base and ambiguity counts—not identity, biological validity, sequence quality, service compatibility or search results. FASTA headers and sequence contents are not echoed into the preview.

Inputs/previews remain in page memory only: no local/session storage, files, journal, project, JSON or CSV persistence; no network APIs or service calls; no credentials. Clear explicitly with **Clear genetic inputs**; leaving/reloading the page also clears them. This is not a secure-memory erase guarantee, and browser/OS clipboard or extensions are outside app control. No sequence-saving action is provided. **GenBank submission is not search** and is not implemented. iNaturalist publishing remains a separate future authenticated, explicitly consented action, never implied by Add to TERRA project.

### Manual review of the clarified integration scope

- In a fresh profile, verify the no-project empty state. Create custom/day/name/site projects and a completed project. Add a new draft, repeat Add, then add a saved observation to another project. Confirm journal count/IDs do not duplicate, scope mismatches do not save, completion locks membership and reload preserves references/counts.
- Save normally then Add; verify the saved observation is selected. Keep an unrelated discovery draft while adding an existing record; it must stay untouched. Keep an unsaved project-editor draft while adding; it must require refresh before a stale save.
- Expand Identification provenance inside a saved discovery. Verify “No identification history yet”, no AI/community/expert label, no standalone provenance navigation and no draft status control. Close and reopen each view; drafts and saved records must remain.
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

No curated taxonomy dataset exists in the current repository. `STARTER_SPECIES` in `app.js` is a transparent, hand-written two-name starter list: **Trichocereus bridgesii** and **Trichoderma harzianum**. These are examples, not verified identifications, an authoritative taxonomy, or a complete species catalog. Matching trims the search text and shows **every local name that starts with or contains it**, case-insensitively, without filtering by discovery category (including the seven organism choices and Other). Nothing is queried or downloaded.

Type `Trich` to see both; `Trichoc`, `bridgesii`, or `harz` narrows the list. Arrow Up/Down moves through suggestions and an explicit **Keep … as my manual name** option; Enter chooses the active option without submitting. Click/tap also selects. Escape closes, and Tab leaves without changing the text. Merely typing or blurring never forces a suggestion. Custom names are always allowed and saved as text (trimmed as before); a blank saves as Unknown. To extend the examples, edit `STARTER_SPECIES`, update the visible two-example description, and extend the tests. Any larger curated dataset needs separate provenance, licensing, and maintenance review.

One integrated date bar accepts keyboard input in strict `YYYY-MM-DD` format and includes a calendar icon backed by the browser's native date picker. There is no second visible date field. Tab from the text to the icon, then press Enter or Space to open the calendar; click/tap also works. Invalid text clears the internal picker value but remains editable in the bar; calendar selections immediately update that same text. Impossible dates, year 0000, and malformed formats are rejected; valid leap days and years 0001–9999 are accepted only through today's local calendar date. Future dates are rejected by native picker limits, manual validation, photo review/handoff and JSON import; legacy stored future records remain readable to avoid destructive migration. Storage/export still use the same ISO date string and version-1 schema. Native calendar presentation varies by browser/OS; there is no custom calendar widget.

## Projects / Field Summary — local descriptive reporting

This small prototype is a step toward Trevor's reporting idea, **not an AI summary, ecological inference, mapping tool, trend analysis, or species verification**. It does not call an API or add a reporting backend. Existing journal saving, starter suggestions, dates, JSON export/restore, and the explicitly mock photo-review flow remain unchanged. No mock identification/verification rewards or camera-roll permissions have been added; the separate participation badges are described in NEXT-UI.md.

1. Scroll to **Projects / Field Summary** and choose **New project**.
2. Enter a title of 1–120 characters, group type, optional date/site/species and notes (up to 3,000 characters). Every project needs a title. Site and species are stacked in **one shared column**, with two independently labeled inputs: **Site name** is a manual project label, **Species / name** is the exact recorded name for species grouping. Neither value is replaced or merged; both remain in saved project scope and CSV. Labels omit parenthetical “required” wording; existing title/day/species/site validation still applies.
   - **Project date / day:** requires a valid `YYYY-MM-DD` start, with optional inclusive end. A blank end means one day. Choose all eligible journal days, a prior day, or Other/manual day within the window, then select observations.
   - **Species / name:** requires a recorded name, up to 120 characters; exact, case-sensitive matching after trimming. This is not a taxonomy lookup.
   - **Site / name:** new sites require a label and drawn local rectangle. Only saved points or whole approximate regions inside the boundary qualify. Hidden/legacy records cannot prove inclusion. Edit the boundary after creation (reopen completed projects first); save removes invalid memberships with an explanation, never journal records. Existing label-only sites stay readable until a boundary is added.
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
- Journal deletion leaves a visible **missing ID reference**, excluded from all metrics. Restoring from Trash within 72 hours reconnects it if still eligible; importing a missing exact ID from JSON can also reconnect it, but duplicate IDs never overwrite Trash; a different ID with the same name does not. Reopen an affected project and uncheck the missing reference to remove it permanently. Completed reports also reflect current journal deletions/restorations.
- Damaged/blocked journal or project reads pause project writes/exports rather than overwrite data. Project write failures retain the draft and saved bytes. Invalid project data does not block the independent journal. Tabs refresh saved reports without replacing drafts; stale project writes require an explicit refresh/review. localStorage is not transactional: use one active editing tab.
- **Journal JSON exports/restores do not include projects.** There is no project JSON backup/restore UI in this small step; keep CSV reports and do not clear browser data. Both projects and journal are local to the exact browser profile/origin. Project deletion, shared/synced projects, frozen reports, charts, richer taxonomic normalization, and geographic matching are outside this prototype.

### Windows manual review (PowerShell / VS Code)

Review the branch without merging or deploying. Start from a clean working tree in your existing repository; stop if Git reports local changes/conflicts (do not force-reset them):

```powershell
git status -sb
git fetch origin
git switch integration/pr7-pr11-pr12
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
- Names are limited to 120 characters and notes to 3,000. Empty names become Unknown. Only today/past calendar dates are allowed for new observations/imports; no species identification is performed.
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
node --check ui.js
node --check test-ui-browser.cjs
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
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-cache" node test-ui-browser.cjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-cache" node test-view-stack-browser.cjs
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
node test-ui-browser.cjs
```

Historical test record (current complete results/commands: [NEXT-UI.md](NEXT-UI.md)): `test-ui-browser.cjs` previously covered keyboard menu/six-destination bottom navigation/hash/history/focus, Discover without Profile or duplicate navigation, clearly unconnected Feed, fixed placement, 44px targets, safe content/scroll spacing and enlarged labels, Map-only legend/filter visibility on Home and Profile, every purpose/category dropdown, combined filters/empty/reset/counts, temporary mock Profile file-name-only add/invalid file/literal text/follow/reset/reload, native location disclosure and stale-field clearing in both forms, cultivated photo handoff and independent reset, unchanged journal/export privacy and mock isolation, six recognizable organism icons, separate nontransactional sale listing, labels/IDs and widths 320/390/768/1280. All four browser suites, nine JS unit tests and four Flask tests pass on Linux Chromium 156 for this follow-up. No runtime dependency was added. Windows/Edge, Firefox/Safari and manual screen-reader review remain unverified.

`test-integration-plan.cjs` adds pure membership idempotency/immutability/scope/completion and single-record IUPAC DNA validation tests. `test-discovery-browser.cjs` adds new/saved/ordinary-save project handoff, failed journal/project writes and retry identity, stale drafts and cross-tab completion, six-field version-1 export/restore, neutral provenance within saved discovery details, distinct local genetic plans, literal-text safety, no sequence persistence, keyboard/mobile checks and zero outbound/network API calls. All three browser suites, nine JS unit tests, Flask unittests, syntax/manifest/whitespace checks were run successfully on Linux Chromium for this follow-up. Test-only missing Chromium libraries/fonts were extracted under ignored `.browser-cache`; they are not runtime dependencies.

`test-field-summary.cjs` covers versioned JSON compatibility/validation, exact scopes, metric reconciliation, deterministic ordering, missing/unknown records, and CSV quoting/formula safety. `test-projects-browser.cjs` covers all group types, membership editing, complete/reopen/reload, source tables, CSV downloads, missing/restored IDs, unchanged journal bytes/schema, quota/read/version failures, concurrent drafts, labels/keyboard/mobile widths, and no remote or network API calls. The original full `test-browser.cjs` remains a required regression check; the Flask unittest checks routes, manifest, and HTML IDs/labels.

### Manual review: JSON export and restore

The same suite now also exercises the mock photo flow: all seven organism groups plus Unsure/part resets and caveats, required fields, unsupported/empty/oversize/undecodable photos, single/multi-image limits, preview removal and object-URL cleanup, mock labels/source/confidence, accept/correct/uncertain controls, literal text safety, context invalidation, reset/reload, unchanged local/session storage and journal schema, populated mobile widths, and no HTTP requests during the flow. The suite additionally covers manual location levels and clearing hidden/stale values, top-three visibility plus all remaining ranked mock candidates in each group, keyboard disclosure and selection state, invalid/uncertain/manual selections, confirmation cancellation and repeated handoffs, single/multi-view draft prefill, date synchronization/missing-date validation, notes/privacy preservation, independent URL cleanup (replacement, errors, removal, save, pagehide), draft survival on failed saves, unchanged export/schema, and narrow populated drafts. Full existing and new tests passed in Linux Chromium; Windows, Firefox/Safari, and full screen-reader review remain unverified.

`test-browser.cjs` is the current regression entry point. There is no configured linter/build system; checks are JavaScript parse checks, Flask route smoke checks, and browser regressions.

For a manual review, use Tab/Shift+Tab and the skip link, submit an empty name, reload to verify persistence, preview an image then save/reload to verify it is not retained, cancel and confirm deletion, and inspect the exported JSON. Restore it once to preview duplicates (no additions), cancel, then delete one entry and recover it from the visible Trash bin within 72 hours. Backup duplicates do not override Trash timestamps. Try an invalid JSON file and verify that nothing changes. Resize to a narrow mobile viewport. No merge or deployment is required to review this feature branch.
Playwright and Chromium are test tools only; the app itself needs no npm dependencies or external network requests. The check uses a fresh, isolated browser profile and tests both starter names, prefix/substring/case matching, custom names, keyboard selection/dismissal, safe suggestion rendering, one-bar layout, Enter/Space native-picker activation, typed invalid dates and leap days (including century rules), calendar/text input and change synchronization, unchanged date storage, local-only messaging, saving/reloading, Unknown names, safe text rendering, image preview/non-persistence, JSON export/restore round-trips, preview/cancel/confirm, duplicate IDs, invalid files/schema/records, restore write-failure preservation/retry and changed-journal reconfirmation, confirm/cancel deletion, cross-tab updates, corrupt/blocked/full storage, labels, and overflow at 320, 390, 768, and 1280 pixels. Remote requests are blocked and asserted absent; fetch, XMLHttpRequest, WebSocket, EventSource, and sendBeacon calls are trapped and asserted absent across page loads. These checks do not establish behavior for a future integration. The suite has passed in Chromium, including touch selection and open-dropdown mobile overflow checks. Firefox/Safari and a **manual screen-reader audit remain necessary**, especially combobox announcements and native calendar operation.

### Manual review: Trevor’s organism and project layout refinements

- In **Record a discovery → What did you find?**, check Plant, Mushroom, Insect, Mammal, Bird, Fish, and Reptile. Save one of each, reload, export JSON, then restore in a fresh profile; confirm categories and six-field records survive. Other remains supported. Existing `fungus` records now display **Mushroom** without rewriting saved data; the storage/backup key remains `fungus` for compatibility.
- In **Explore a photo → Organism group**, check the same seven labels plus Unsure. With a local image, switch through every group: old parts/results must clear, part choices must fit the group, and Analyze must show three matching-group **MOCK** examples, three additional ranked demo rows in the disclosure, and a safety caveat, not pixel-based identification. Nothing uploads or persists.
- With each discovery category selected, type `Trich`: both starter names should still appear. Category never filters the manual name suggestions. Names remain free text; group-specific filtering applies only to photo demo examples/parts.
- In **Projects / Field Summary**, check that Site name and Species / name appear vertically in one shared column at desktop and 320px widths. Fill both, save, reload, and export CSV: confirm both labeled values survive in the project scope. Species-group eligibility still matches the species field, not the site label.
- Check that no feature label contains “(required…)”. Blank title and missing day/species/site scope values must still fail validation without saving. Add a new-category discovery to a project, repeat Add, and confirm one journal record/reference; complete/reopen must still work.
- Keep browser network tools open: no iNaturalist, BOLD, GenBank, image upload, or application API request should occur. These remain unconnected plans, not integrations.

### Manual review: Species suggestions and typed dates

Type `Trich` (both starter names), `Trichoc` (one), `RICH` (both substring matches), `harz` (one), and an unlisted name (visible no-match feedback with a manual-name option). Results update with each keystroke, replacement/paste, and deletion. Select by arrows/Enter, mouse, and touch; the field fills but the journal count stays unchanged until Save. Check Escape/Tab retain custom text and clearing closes the list. This searches every matching entry in the **two-name starter dataset, not all real species or biodiversity**.

For a manual review, use Tab/Shift+Tab and the skip link. Type `Trich`, navigate with arrows and Enter, reopen with an arrow, dismiss with Escape, and keep an unlisted name. Check that Enter on an active suggestion does not save. Type `2024-02-29` (valid) and `2025-02-29` (invalid), then choose a calendar date and verify the text updates. Confirm local-only save/publishing notices. Submit an empty name, reload to verify persistence, preview an image then save/reload to verify it is not retained, cancel and confirm deletion, and inspect the exported JSON. Resize to a narrow mobile viewport. Review with a screen reader (not yet audited). No merge or deployment is required to review this feature branch.

