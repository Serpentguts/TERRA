# Combined review: PRs #7, #11 and #12

Branch: `integration/pr7-pr11-pr12`.

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
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PORT = "8080"
.\.venv\Scripts\python.exe server.py
```

In a second PowerShell terminal, open the user's local Flask URL:

```powershell
Start-Process "http://localhost:8080"
```

Use `python` instead of `py` if that is your launcher. Stop the server with Ctrl+C. No public host or remote service is involved; never use a tunnel or deployment command. A different hostname/port has separate browser storage.

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
