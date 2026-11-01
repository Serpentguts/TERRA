# Combined review: PRs #7, #11 and #12

Branch: `integration/pr7-pr11-pr12`.

## Latest request: cohesive workspace/profile/awards UI

Review remains **existing draft PR #13 only**, on this integration branch; no merge/deployment/main changes. See **[NEXT-UI.md](NEXT-UI.md)** for authoritative current UI behavior, new-key schemas, criteria/limits, full tests and existing-clone PowerShell instructions. It supersedes historical mock-profile, single-select and six-destination descriptions below.

- Profile Posts/Projects derive from the existing journal/ID-only project store; no duplicate observations. Local profile text/symbolic avatar persists separately. Credentials are always user-entered/unverified; followers/following are 0/not connected. No LinkedIn, social follows, account sync or external calls.
- Three once-only non-quality participation awards (first observation, seven distinct consecutive recorded days, nonempty eligible completed project) unlock randomized CSS/emoji decorations with persistent placement/local serials. No genuine verification evidence exists, so no verified-observation award. No rare-species/precise-location/transaction incentives. No cash/trade/NFT/blockchain value or global uniqueness promise.
- Map → multiselect filters → legend, OR within each group/AND between groups, selected summary/reset; Map-only fictional data. One native searchable organism dropdown preserves legacy category keys.
- Persistent Workspace plus six existing destinations; accessible minimize/expand/close/reopen without draft/data deletion. Current privacy/date/72h Trash/boundary/provenance safeguards retained.
- Complete verification: **21 JS unit tests, 4 Flask tests, 7 full Linux Chromium suites PASS**, plus syntax/diff checks. New next-UI and reward suites cover triggers/random decor/farming/persistence/quotas/corruption/schema/multiselect/stack; existing complete suites retained. Human Windows/Edge, Firefox/Safari, touch and screen-reader review still needed.

## Prior request: observation privacy, recoverable Trash and scoped projects

Existing **draft PR #13 only** remains the review artifact; no merge/deployment. Commits `a309408` and `1aed8c6` add the cohesive update; subsequent hardening keeps the same branch/PR. See [LOCAL-WORKFLOWS.md](LOCAL-WORKFLOWS.md) for current behavior, schema/retention caveats, limitations and complete PowerShell update/run/test steps. It supersedes older historical claims below about future dates, immediate permanent Delete, six-field-only new saves and site labels without boundaries.

- Redundant first Discover TERRA section removed; existing intro remains Home. Natural habitat input removed, cultivated context preserved.
- Today/past-only observation dates enforced in both UI paths, Save/Add, photo handoff and import. Existing stored legacy records remain readable without destructive migration.
- Required honest local map: Exact pin, Approximate coarse rectangle/project site, Hidden selection discarded. No real geographic accuracy, GPS, external geocoder or services. Privacy validation prevents hidden/approximate point-coordinate leakage.
- Confirmed Delete atomically soft-deletes, visible 🗑 Trash with deadline/Restore. 72-hour recovery, then disabled restore and permanent cleanup on next successful journal write only; no read-time or background deletion.
- Inclusive project start/end dates, prior-entry checkboxes, recorded-species/day/site choices and safe Other/manual values. New site rectangles enforce full containment on every membership path. Editable boundaries revalidate/remove invalid memberships with IDs and an explicit journal-retention explanation.
- Existing version-1 keys/envelopes and six-field records readable; optional versioned local-grid location, ISO `deletedAt`, project `endDate`/`groupValue`/`boundary`. Backups preserve recognized optional fields and unexpired Trash; no automatic migration. Do not downgrade to a build that strips those fields. Project backup UI remains unavailable.
- Verification: **six Linux Chromium browser suites, 15 JS unit tests, four Flask tests PASS**, including future dates/photo paths, privacy precision, location requirement, Trash quota failure/restore/expiry, timeframe/group choices, boundary add/edit validation, journal retention, backups, no outbound requests and responsive widths. Existing discovery retry identity, navigation/view-stack, photo URL ownership, journal import and project CSV coverage preserved. Syntax and whitespace checks pass. Browser test libraries/fonts are workspace-only ignored tools, no runtime dependency added.
- Remaining human checks: Windows/Edge, Firefox/Safari, manual screen reader, physical touch/safe areas. Rectangles are local demo workflow geometry, not geographic enforcement.

## Prior consolidated request: discovery provenance + closable view stack

Review artifact: existing **draft PR #13 only**, <https://github.com/Serpentguts/TERRA/pull/13>. Implementation commits: `2d8f3bc`, `81ca3af`. This supersedes the older staged-provenance page and exclusive-preview visibility described in historical notes below. No separate provenance branch/proposal/PR is being implemented.

- Identification provenance is a native expandable subsection of each saved discovery. The standalone navigation/page is removed; no draft status control exists. Version-1 records carry no identification history, so they show **No identification history yet**, including after a fixed MOCK photo selection. No fabricated AI/community/expert label or consensus. The six-field journal, version-1 backups and importer are unchanged; no migration or new metadata store.
- All nine openable views have native, named **Close view** buttons with 44px minimum targets, explicit controlled-section relationships, shared explanatory help and polite close feedback. Opened sections coexist in the main screen stack; closing only sets visibility. It never deletes journal/project data, resets draft fields/follows/filters, discards images or submits a form. Focus returns to a visible reopen control. Reload restores normal initial visibility.
- The six persistent bottom destinations remain reachable even with every view closed. Observation reopens photo review + discovery draft; Projects / Journal reopens projects + saved observations. Menu links reopen individual sections. Direct hashes, Back/Forward and confirmed photo-to-draft handoffs reveal their destination. Delete observation remains separate and confirmation-gated.

Verification: **all five full Chromium 156 suites PASS**, including new `test-view-stack-browser.cjs`; **9 JS unit tests PASS**, **4 Flask tests PASS**. Regressions cover all-section menu close/reopen, keyboard Enter/Space, accessible names/help/targets, visible focus after closing, all-closed persistent reopening, coexisting Map/Profile, hash history, mobile control bounds, unchanged journal/project/local/session storage, retained drafts/images/follows, saved-discovery unknown provenance and all-group MOCK transfers reopening a closed draft. Existing JSON export/restore/failure-retry suites pass unchanged in schema. Syntax, Python compile, manifest and whitespace checks also pass. Test-only browser libraries/fonts are ignored under `.browser-cache`; no runtime dependencies added. Manual Windows/Edge, Firefox/Safari, screen-reader and physical safe-area reviews remain outstanding.

### Trevor's existing Windows clone

Export a journal backup and stop the old server with Ctrl+C. Do not reset/force through local Git changes or conflicts:

```powershell
Set-Location "$HOME\TERRA-combined-test"
git status --short
git fetch origin integration/pr7-pr11-pr12:refs/remotes/origin/integration/pr7-pr11-pr12
git switch integration/pr7-pr11-pr12
git pull --ff-only origin integration/pr7-pr11-pr12
git log -1 --oneline
python -m pip install -r requirements.txt
python server.py
```

Open **http://localhost:8080**, press **Ctrl+F5**, and keep the same browser profile/hostname/port for existing data. Open Profile and Map; close each, then reopen. Close Record a discovery with an unsaved draft and reopen via Observation; the draft remains. Close Your observations and reopen via Projects / Journal; saved data remains. Expand Identification provenance under a saved discovery: the neutral unknown message belongs there, not in the menu or form. Closing views is not deleting data.

Optional full tests in a second PowerShell terminal with the server still running (Node.js 18+):

```powershell
npm install --no-save --package-lock=false playwright
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.browser-cache"
npx playwright install chromium
node test-browser.cjs
node test-projects-browser.cjs
node test-discovery-browser.cjs
node test-ui-browser.cjs
node test-view-stack-browser.cjs
node --test test-field-summary.cjs test-integration-plan.cjs
python -m unittest -v test_server.py
```

No merge, main modification, deployment, public service, or release is authorized.

## Previous navigation redesign (after `fec372f`)

This supersedes the historical Home/Map/Profile-tab and legacy Feed-redirect descriptions below.

- Discover is a short welcome without tabs, Profile content, or repeated destination links. Map and Profile previews are siblings outside Discover; Feed is an explicit **not connected** placeholder, not fabricated community activity. Journal, observation/photo handoff, projects and genetic previews remain intact.
- Six persistent bottom links: Map, Profile, Feed, Observation, Genetics, Projects / Journal. Inline outline SVGs depict map/person/list/camera/DNA/book; accessible names come from always-visible text, not emoji. Profile remains in the top-right hamburger, with no separate header shortcut or Discover tab. Profile is also included in the bottom bar because the approved six-destination list explicitly requests it.
- Native Tab/Enter links focus destinations; `aria-current`, a border and bold text show selection. Hash navigation, reload and Back/Forward synchronize previews/current state. Only Map shows its existing legend and filters; colors, organism icons and combined filtering are unchanged.
- Six columns on desktop, two rows of three at <=600px. The bar respects bottom/left/right safe-area insets with `viewport-fit=cover`. ResizeObserver reserves its actual height plus breathing room as body padding and scroll padding, including enlarged labels. No journal/schema/storage/network behavior or runtime dependency changes.

Validation: all four full Chromium 156 suites PASS (`test-browser.cjs`, `test-projects-browser.cjs`, `test-discovery-browser.cjs`, `test-ui-browser.cjs`); nine JS unit tests and four Flask tests PASS. UI coverage includes six labeled destinations, icon accessibility, no Discover Profile/navigation, top-menu Profile, keyboard/focus/hash/history, Map-only controls, unchanged local/mock isolation, fixed placement, minimum target sizes, populated 320/390/768/1280px layouts, enlarged text and last-control spacing. Test-only Chromium libraries/fonts were extracted under ignored `.browser-cache`, not added to application requirements. Windows/Edge, physical-device safe areas, Firefox/Safari and manual screen-reader review remain human checks.

Trevor: stop the old server and export your journal backup first. In your existing clone:

```powershell
Set-Location "$HOME\TERRA-combined-test"
git fetch origin integration/pr7-pr11-pr12:refs/remotes/origin/integration/pr7-pr11-pr12
git switch integration/pr7-pr11-pr12
git pull --ff-only origin integration/pr7-pr11-pr12
python -m pip install -r requirements.txt
python server.py
```

Open **http://localhost:8080**, then hard-refresh (Ctrl+F5). Stop with Ctrl+C. Keep the same browser profile/hostname/port for your journal. If git refuses a switch or fast-forward, stop and preserve local work; do not force/reset. No `py` launcher is needed. Full optional test commands remain at the end of this file.

## Inputs and history

Created from current origin/main `d82d73364056600f0f8f6ffd2d8d516cf165d878`.
Merged without squashing in dependency-safe order:

1. #11 — `8093dfb122ed3c72a9baa88750bd62b4747ab2b8` (Projects / Field Summary).
2. #12 — `b75a9d37eb0f26c8d505f0d2e3dfa4c077a395f4` (stacked on #11; local discovery-to-project action, expanded groups and staged integration plans).
3. #7 — `44b5ee0212b7a8663daa6b2b1031bcde98ccf816` (manual photo context, ranked mocks and confirmed discovery draft handoff).

All three exact heads are verified ancestors of this branch. Remote main and source heads were rechecked after testing and were unchanged. No existing PR/base branch was edited or merged on GitHub.

## Conflict decisions

Resolved overlapping `README.md`, `app.js`, `ditto.json`, `index.html` and `test-browser.cjs` by combining features and assertions, not choosing one side wholesale. CSS merged automatically.

- Preserve seven named organism groups plus Unsure, group-specific parts/caveats, all journal/project UI, provenance definitions, and separate unconnected BOLD/GenBank plans.
- Preserve top-three visible mock candidates plus three ranked disclosed rows for every group. Retain original named examples; the four newly expanded groups use explicitly unresolved demo placeholders for their additional rows. These are not real identification or vetted look-alike datasets.
- Transfer named groups to their exact journal categories; only Unsure maps to legacy Other.
- A confirmed photo transfer selects the current discovery draft, not a previously selected saved observation. It clears in-memory retry identity for the replaced draft. It never saves or publishes.
- Preserve independent temporary image ownership, manual context, separate Save/Add consent, six-field version-1 observation JSON, ID-only project membership and duplicate-free partial-write retries.
- Bind `python server.py` to loopback `127.0.0.1` only; retain `PORT` override. No public hosting, tunnels, deployment or release.

Integration commits: `cbd076c` (combined merge/conflicts), `d8544f9` (interaction regressions and loopback startup), followed by this verification record.

## Verification results

All passed on Linux, Node 22.23.4, Python 3.11.2, Playwright Chromium 156:

| Check | Result |
| --- | --- |
| `node test-browser.cjs` | PASS — all three summaries; journal, restore, dates/autocomplete, mock photo review and handoff |
| `node test-projects-browser.cjs` | PASS — full Projects suite |
| `node test-discovery-browser.cjs` | PASS — full discovery/genetic suite, extended with all seven groups + Unsure photo → draft → project, saved-selection targeting, partial project-write failure retaining previews/locality and duplicate-free retry |
| `node --test test-field-summary.cjs test-integration-plan.cjs` | 9 passed, 0 failed, 0 skipped |
| `python -m unittest -v test_server.py` | 4 passed, including served combined panels and loopback/PORT startup |
| JS syntax for `app.js` and every `test-*.cjs`; every inline script; `ditto.json` parse | PASS |
| `python -m py_compile server.py test_server.py` | PASS |
| Requirements installation and actual `python server.py` startup | PASS |
| Live HTTP `/`, `/index.html`, `/app.js`, `/styles.css`, `/ditto.json`, `/api/health` | All 200 |
| `git diff --check`; exact source-head ancestry | PASS |

Browser suites use isolated profiles and assert no external requests/application network API calls. Missing harness Chromium libraries/fonts were extracted only under ignored `.browser-cache`; Flask is still the only application requirement. No frontend build or new application dependency was added.

Not executed: Windows/Edge/Excel manual review, Firefox/Safari, or manual screen-reader audit. These are human-review follow-ups, not automated failures.

## Next UI iteration on the combined branch

Continues from `19d6909e201bbf4e54d415e3c707ba323aeb0723`, not from main or an individual feature branch. Existing review-only draft PR #13 is the review destination; no merge, deployment, publishing, or main-branch changes.

- `ui.js` adds one native location-context dropdown per form, conditional habitat/garden and optional region/locality fields, clearing/disabling hidden or stale values, sanitized explicit photo-to-draft handoff, and pagehide cleanup. The six-field journal/export and privacy preferences are unchanged; all context remains temporary even with Exact selected.
- `index.html` / `styles.css` add top-right disclosure navigation to all existing areas, keyboard-accessible Feed/Map tabs, fictional observation cards, and a local schematic. Six labeled icons distinguish mushroom, plant, bird, snake/reptile, mouse/mammal and bug/insect.
- Green means natural-setting observation; yellow means cultivated-setting observation. Red means a fictional for-sale listing, never an observation: a separate listing area, square icon and explicit text distinguish it. No journal locations, real social features, remote maps, sellers, transactions, or external posts.
- `test-ui-browser.cjs` covers new controls, focus/keyboard/hash behavior, hidden/stale clearing in both forms, setting handoff and independent reset, unchanged save/export privacy, demo isolation/legend/icons/sale separation, unique labels/IDs, and populated widths 320/390/768/1280. Existing photo tests select the new broad-only context before entering regions; all previous assertions are retained. Flask checks include `ui.js` and the new panels.

Reverified on Linux Chromium 156: all **four** browser suites, **9** JS unit tests, **4** Flask tests, JS/inline syntax, Python compilation, manifest parse, local routes including `/ui.js`, and whitespace checks pass. Browser-only libraries/fonts are extracted inside ignored `.browser-cache`; venv and Playwright are local test tools, not runtime additions. Windows/Edge, Firefox/Safari and a manual screen-reader review remain unverified. Emoji appearance depends on platform; visible organism/purpose labels do not.

## Map/Profile feedback follow-up (after `9f9c707`)

- Removed the duplicate fictional Feed/sample-observations view and navigation link. Home/Map/Profile are mutually exclusive tab panels; Map opens its schematic directly. Legacy `#feed` URLs now select Map. The private **Your observations** journal and all other app areas remain intact.
- Legend and both native filters live only inside Map, hidden on Home and Profile. Purpose/color (all, natural green, cultivated yellow, for-sale red) and organism (all plus each of the six labeled icons) combine with AND across the six observation markers and separate sale listing. Result counts, no-match guidance and reset are accessible and local only.
- Top-right Profile link and menu/tab entry open an explicitly MOCK, unsigned-in profile scaffold. Observation labels and selected image **file names only** can be displayed in memory; no file contents are read or uploaded. Mock follows target only fictional people and make no social/network actions. Reset/reload/pagehide discard everything; journal/storage/export are untouched.
- Three-tab arrow navigation now wraps correctly in either direction. Hamburger disclosure, location dropdowns and all existing privacy/accessibility behavior are preserved.

Validation: all four Chromium browser suites pass, including extended `test-ui-browser.cjs`; 9 JS unit tests and 4 Flask tests pass. The UI suite covers Map-only visibility, every dropdown option, combined/empty/reset/count results, direct/hash/menu/profile navigation, Profile invalid-file/literal-text/add/follow/reset/nonpersistence, unchanged journal/export, populated responsive layouts, no GPS/network calls. No runtime dependency added. Browser libraries/fonts stay in ignored `.browser-cache`. Windows/Edge, Firefox/Safari and manual screen-reader review remain outstanding.

Only `integration/pr7-pr11-pr12` is updated; existing draft PR #13 remains the review destination. No merge, deployment, publishing or main changes.

## VS Code / PowerShell local review

In a clean existing TERRA checkout, export your browser journal backup before testing. Keep the same browser profile and `localhost:8080` origin to retain access to existing journal data.

```powershell
git fetch origin integration/pr7-pr11-pr12:refs/remotes/origin/integration/pr7-pr11-pr12
git switch --track origin/integration/pr7-pr11-pr12
# If the local branch already exists, use these INSTEAD of --track:
# git switch integration/pr7-pr11-pr12
# git pull --ff-only origin integration/pr7-pr11-pr12
# If fast-forward is refused, stop and review local work; do not reset/force it.
code .
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PORT = "8080"
.\.venv\Scripts\python.exe server.py
```

In a second PowerShell terminal, open the user's local Flask URL:

```powershell
Start-Process "http://localhost:8080"
```

Use the installed `python` command; the `py` launcher is not required. Stop the server with Ctrl+C. No public host or remote service is involved; never use a tunnel or deployment command. A different hostname/port has separate browser storage.

Optional full automated rerun in the second terminal, with the local server still running (Node 18+):

```powershell
npm install --no-save --package-lock=false playwright
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.browser-cache"
npx playwright install chromium
node --test test-field-summary.cjs test-integration-plan.cjs
.\.venv\Scripts\python.exe -m unittest -v test_server.py
node test-browser.cjs
node test-projects-browser.cjs
node test-discovery-browser.cjs
node test-ui-browser.cjs
```
