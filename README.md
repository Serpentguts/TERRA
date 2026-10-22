# TERRA
Eco Token
# TERRA

TERRA is a project exploring tools for recording and reviewing nature observations.

## First prototype
The browser-only prototype now records plant, fungus, or other observations with a name (or “Unknown”), notes, a date, and a location-privacy preference. An optional photo is previewed temporarily; it is not saved. No location is collected.

## Status
Early prototype — not yet connected to iNaturalist or a scientific review service.
Add TERRA README

## Run locally

Use Python 3.9+ and a modern browser with JavaScript and localStorage enabled. From the repository folder:

```sh
pip install -r requirements.txt
python3 server.py
```

Open **http://localhost:8080**. The Flask development server listens on `0.0.0.0`, using `PORT` if set (default `8080`). Stop it with Ctrl+C. This is a local development server, not a production hosting setup.

There is no frontend build step, framework, CDN, external service, account, or database. The frontend is plain `index.html`, `styles.css`, and `app.js`. Flask only serves files and `/api/health`; it does not receive observations. Use the server rather than opening `index.html` directly, because `file://` storage behavior varies between browsers.

## Use the journal

1. Choose **Plant**, **Fungus**, or **Other**.
2. Enter a species/common name, or leave it blank to save as **Unknown**.
3. Set the observation date (defaults to today's local date) and optionally add notes.
4. Optionally select an image up to 10 MB to preview. You can remove the preview; it is also cleared after a successful save or reload.
5. Choose **Hidden**, **Approximate**, or **Exact** as a location privacy preference. All three are preferences only: none requests geolocation or saves coordinates.
6. Select **Save observation**. The saved list shows newest observation dates first, with category, name, notes, and the privacy preference.
7. Use **Delete** on an entry and confirm the browser prompt to remove it permanently. Cancel leaves it unchanged.
8. Select **Export JSON** to download all saved entries, plus an export timestamp and format version. Check your browser's downloads and keep the file somewhere safe.
9. To bring back an exported backup, use **Restore a JSON backup** as described below. Nothing is imported just by selecting a file.

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

## Data, privacy, and limitations

- Observations stay in **this browser profile on this device**, in localStorage under `terra.observations.v1`. They are not synced, automatically backed up, uploaded, or submitted to iNaturalist or a scientific review service.
- Browser storage belongs to an origin (protocol, hostname, and port). Different browsers/profiles, `localhost` versus `127.0.0.1`, or a changed port/domain have separate journals. Clearing site data, uninstalling the browser, private browsing, or browser eviction may remove entries. Export regularly.
- **Photos are preview-only.** Neither image data nor filenames are saved or exported. A saved observation has no persistent photo. The app never reads photo location metadata.
- **Privacy selection is not location storage or a protection mechanism.** Even “Exact” stores only the preference word, never coordinates. Avoid putting sensitive locations or personal information in names or notes; text is saved as entered and included in exports.
- Local storage is not encrypted or password protected. People with access to this browser profile, and scripts on the same origin, may access it. Treat downloaded JSON as potentially sensitive.
- JSON backups can be restored through the validated, previewed merge above. There is no editing, identification, mapping, or offline app installation. Keep original exported files. The page must first be loaded from the local server; offline-first/PWA support is not implemented.
- Names are limited to 120 characters and notes to 3,000. Empty names become Unknown. Any valid calendar date is allowed, including future dates; no species identification is performed.
- Read errors or malformed stored data pause saving/deletion/restore rather than silently replacing existing records. Failed writes preserve the form, restore preview, and existing entries. Check storage permissions and reload; do not clear potentially recoverable data. There is no built-in damaged-data recovery tool.
- Tabs on the same origin refresh when storage changes; truly simultaneous writes are not transactional. Prefer one active editing tab.
- All user text is rendered through DOM nodes and `textContent`, not interpreted as HTML. This does not make the journal a secure vault.

## Checks

Basic checks (no browser-test tools needed):

```sh
node --check app.js
node --check test-browser.cjs
python3 -c "from server import app; c = app.test_client(); assert all(c.get(p).status_code == 200 for p in ['/', '/app.js', '/styles.css', '/api/health'])"
```

An optional development-only Chromium regression check is included. With Node.js 18+ installed, run the following from the repository folder while the Flask server is running on port 8080:

```sh
npm install --no-save --package-lock=false playwright
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-cache" npx playwright install chromium
# On Linux, if browser libraries are missing (may require admin permissions):
# npx playwright install-deps chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-cache" node test-browser.cjs
```

Playwright and Chromium are test tools only; the app itself needs no npm dependencies or external network requests. The check uses a fresh, isolated browser profile and tests saving/reloading, Unknown names, safe text rendering, image preview/non-persistence, JSON export/restore round-tripping, preview/cancel/confirm, existing and within-file duplicate IDs, invalid JSON/wrappers/record fields/file types/sizes, bounded previews, file-read failures, restore quota/blocked-write preservation and retry, changed-journal reconfirmation, confirm/cancel deletion, cross-tab updates, corrupt/blocked/full storage, labels, and overflow at 320, 390, 768, and 1280 pixels. These checks passed in Chromium; Firefox/Safari and a full screen-reader audit have not been run.

For a manual review, use Tab/Shift+Tab and the skip link, submit an empty name, reload to verify persistence, preview an image then save/reload to verify it is not retained, cancel and confirm deletion, and inspect the exported JSON. Restore it once to preview duplicates (no additions), cancel, then delete one entry and restore again to preview and confirm its recovery. Try an invalid JSON file and verify that nothing changes. Resize to a narrow mobile viewport. No merge or deployment is required to review this feature branch.
