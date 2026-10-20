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

## Data, privacy, and limitations

- Observations stay in **this browser profile on this device**, in localStorage under `terra.observations.v1`. They are not synced, automatically backed up, uploaded, or submitted to iNaturalist or a scientific review service.
- Browser storage belongs to an origin (protocol, hostname, and port). Different browsers/profiles, `localhost` versus `127.0.0.1`, or a changed port/domain have separate journals. Clearing site data, uninstalling the browser, private browsing, or browser eviction may remove entries. Export regularly.
- **Photos are preview-only.** Neither image data nor filenames are saved or exported. A saved observation has no persistent photo. The app never reads photo location metadata.
- **Privacy selection is not location storage or a protection mechanism.** Even “Exact” stores only the preference word, never coordinates. Avoid putting sensitive locations or personal information in names or notes; text is saved as entered and included in exports.
- Local storage is not encrypted or password protected. People with access to this browser profile, and scripts on the same origin, may access it. Treat downloaded JSON as potentially sensitive.
- JSON export is a readable copy only: **there is no import/restore feature**, editing, identification, mapping, or offline app installation. Keep the original exported file; it cannot currently be re-imported through the UI. The page must first be loaded from the local server; offline-first/PWA support is not implemented.
- Names are limited to 120 characters and notes to 3,000. Empty names become Unknown. Any valid calendar date is allowed, including future dates; no species identification is performed.
- Read errors or malformed stored data pause saving/deletion rather than silently replacing existing records. Failed writes preserve the form and existing entries. Check storage permissions and reload; do not clear potentially recoverable data. There is no built-in damaged-data recovery tool.
- Tabs on the same origin refresh when storage changes; truly simultaneous writes are not transactional. Prefer one active editing tab.
- All user text is rendered through DOM nodes and `textContent`, not interpreted as HTML. This does not make the journal a secure vault.

## Checks

Basic checks (no browser-test tools needed):

```sh
node --check app.js
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

Playwright and Chromium are test tools only; the app itself needs no npm dependencies or external network requests. The check uses a fresh, isolated browser profile and tests saving/reloading, Unknown names, safe text rendering, image preview/non-persistence, JSON contents, confirm/cancel deletion, cross-tab updates, corrupt/blocked/full storage, labels, and overflow at 320, 390, 768, and 1280 pixels. These checks passed in Chromium; Firefox/Safari and a full screen-reader audit have not been run.

For a manual review, use Tab/Shift+Tab and the skip link, submit an empty name, reload to verify persistence, preview an image then save/reload to verify it is not retained, cancel and confirm deletion, and inspect the exported JSON. Resize to a narrow mobile viewport. No merge or deployment is required to review this feature branch.
