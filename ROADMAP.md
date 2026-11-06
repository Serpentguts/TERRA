# TERRA next-stage integration roadmap

## Clarified direction and repository baseline

Trevor's second green action under **Record a discovery** adds the observation to a selected **local TERRA project**. It is not a publishing action. A later, distinct **Publish to iNaturalist** option requires its own authenticated integration and explicit review/consent. This direction supersedes the separate, unapproved iNaturalist-button demo; that job is not implemented here.

Reviewed main (`d82d733`), open Projects PR #11, independent photo-handoff PR #7, and backlog issues #9 (layered review/privacy) and #10 (site/project reporting). This follow-up branches from PR #11's `8093dfb` to reuse its actual membership model, not invent a second project store. It should be reviewed as a **stacked PR against `feature/local-field-summary`**. If #11 is approved and merged, maintainers can retarget this follow-up to main and rerun checks; no merge or deployment is authorized by this task. PR #7 is neither copied nor changed.

## Implemented now — strictly local

- A second green **Add to TERRA project** action: choose the current discovery draft or an existing saved record, then an existing project. Store only ID references in the existing `terra.projects.v1` version-1 envelope; leave `terra.observations.v1` and six-field version-1 JSON untouched.
- Explicit membership only. Exact date/name scopes, complete/reopen rules, missing references, and summary calculations remain those of PR #11. Duplicate adds reuse IDs. Empty/unreadable storage fails safely. Partial two-key writes are disclosed and unchanged-draft retries reuse the journal ID during the current page session.
- **AI-suggested**, **community-identified**, **expert-confirmed**: separate staged definitions linked from each observation, no assignable badges or persisted claims. Mock photo output is not AI evidence. This is the deliberate staged-UI alternative to unsafe metadata/schema expansion.
- Separate unconnected BOLD and GenBank local lookup plans. Optional temporary single-record DNA syntax validation/counts only; no invented results, outbound data, credential handling, sequence storage or submission.

## Reviewable later stages (not implemented)

### 1. Evidence/provenance model before status assignment

Design independent evidence entries attached by observation ID, not one mutually exclusive status or automatic ladder. Proposed entry contract: track kind, proposed taxon, source/reviewer identity, relevant model version or expertise, timestamp, evidence/citations, limitations, review state and correction history. Community policy must explicitly represent disagreement and attributed contributions; expert confirmation requires an accountable reviewer and inspectable evidence. A model score or barcode match must never promote an observation to expert-confirmed.

Gate: decide trust/identity/abuse handling, who can claim each category, revocation/corrections, sensitive-evidence visibility, orphaned/restored observation behavior, and readable/exportable evidence. Prefer a separately versioned optional metadata envelope with its own validated backup/restore, conflict and failure tests; old six-field journals must still round-trip unchanged. Do not assume unknown fields survive the existing importer. No migration or metadata contract is activated in this prototype.

### 2. Photo identification pilot remains a separate, bounded priority

Preserve the local mock/review flow while assessing organism-specific models and data sources (start with an explicitly scoped plant pilot, not one universal organism model). Evaluate licensing, calibrated uncertainty, look-alikes, evidence provenance and human review before connecting a model. Gate: dataset/model evaluation, privacy and consent review, no auto-save/auto-publish. Coordinate with PR #7 rather than silently replacing its separate handoff work.

### 3. Read-only BOLD / GenBank search pilots

Keep two source entry paths and show the source, query type and limitations. Taxon/accession retrieval is not sequence comparison. For a real barcode-identification pilot, validate organism/marker suitability and the supported reference service/workflow; GenBank record search and NCBI sequence-comparison workflows require separate technical review. No particular live endpoint/terms/support is assumed by this plan.

Gate before any network: review current API terms/licensing, attribution, rate limits, privacy of query/sequences, retention, explicit per-request consent, and minimal request fields. First test adapters against local fixtures, including timeouts, malformed/empty results and source outages. Then separately authorize a bounded read-only pilot. Real results would need accession/source/version, query date, alignment coverage/identity where applicable, uncertainty and a traceable link—not an automatic species conclusion or expert label. A mock or close sequence match is not proof of species. Raw sequences must never be persisted without a separate explicit saving action and backup/privacy policy.

### 4. Optional iNaturalist publishing — separate consent boundary

A future explicit **Publish to iNaturalist** option must not be the local project button or a side effect of Save/Add. Gate: supported authentication, credentials/tokens handled safely (not casually stored in localStorage), field-by-field review, photo rights/licenses, taxon/date mapping, location precision and sensitive-species policy, destination account confirmation, cancellation and error/retry behavior. Include remote-ID tracking/idempotency to prevent duplicate publishing, and a user-visible confirmation of the actual remote result. No account, token, network call or placeholder publishing success exists today.

### 5. GenBank submission preparation — not identification/search

Only after separate approval, consider a local reviewed package for sequence/specimen/source/protocol metadata and validation against current submission requirements. Gate: authorization/ownership, provenance and specimen traceability, quality checks, disclosure review and the supported submission process. Actual submission needs a distinct explicit confirmation, receipts and error handling. Looking up a record or comparing a barcode never grants consent to submit a sequence. This prototype neither prepares nor submits a GenBank package.

## Acceptance gates and current limitations

Run the full existing journal/photo and Projects suites, new discovery suite, unit tests, Flask route/manifest checks, JS/Python syntax and whitespace checks (commands in README). Preserve existing journal import/export; never silently add review or sequence fields to version 1. Tests must prove no outbound calls, no sequence persistence, no automatic expert/community claims, no duplicate local journal records on Add/retry, and unchanged project membership constraints.

localStorage is not transactional across keys or truly simultaneous tabs. A journal save can succeed before a project write fails; retain that record, explain the partial result and let the user retry/reuse it. After reload, choose the already saved record. Projects remain excluded from journal JSON backups; CSV is not a restore format. Status assignment, live AI/search/publishing, project sync/backups and submission remain deferred. Human review is still needed for Windows, Firefox/Safari and assistive technologies. No deployment or merging is performed.
