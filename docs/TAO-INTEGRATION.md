# TERRA × Bittensor (TAO) integration plan

A living planning document. It collects the ideas from earlier conversations (October 2026, saved in Ditto) and decisions made while building, so each piece can be plugged in when the app is ready for it. **Nothing here is built yet** unless a section says so.

**Product north star:** the Pokémon of nature, a game that gets people outdoors noticing and recording real living things, sitting on top of a professional, streamlined workspace that agencies and companies find indispensable. The fun side fills the baseline database; the professional side pays for it and holds it to a high standard (see §7).

**Network north star:** do for citizen science what Bittensor does for AI research. Define a valuable output (useful, verified ecological data and fieldwork), let people produce it, and reward the work that independent review judges useful.

---

## 1. Principles (keep these as the app grows)

1. **Reward verified usefulness, not volume.** Score evidence quality, protocol compliance, coverage, calibrated confidence and independent review. Raw uploads, check-ins or "most observations" invite duplicates and junk.
2. **Don't compress nature into one number.** Taxonomy, habitat, location, genetics, ecological role and medicinal/nutritional value stay separate fields with sources and uncertainty. No universal "ecological value score".
3. **Alpha is not an ecological credit.** Subnet alpha rewards participation in the network. It never certifies a carbon, biodiversity or restoration outcome. Keep environmental credits (if any) on their own measurement and verification (MRV) track.
4. **Private stays private.** Raw client data, exact sensitive-species coordinates and personal data never go to subnet miners or validators. Bittensor traffic has no confidentiality guarantee. Only minimized, de-identified, public or explicitly consented tasks leave TERRA.
5. **Consent first for training data.** Photos are used to train models only with explicit opt-in, a clear license, location generalized and file metadata stripped. Big files stay off-chain; only hashes, labels, provenance and contribution receipts go on-chain.
6. **Revenue first, emissions second.** Customers, sponsors, contracts and grants pay for real work. TAO emissions are a bonus for contributors, never the budget. Model budgets at zero, low and high emissions.
7. **Living things need rules.** Trades of plants, seeds, cultures and microorganisms carry provenance (cultivated vs. wild), legality, phytosanitary and protected-species checks.

## 2. Where TERRA is today (November 2026)

- Local-first journal: observations, projects, Trash, backups. Nothing is uploaded.
- **Locations on a real map** (`terra-geo-v1`): Exact = a pin (5 decimals), Approximate = snapped to 0.1° cells, at least 0.2° each way (~22 km), Hidden = nothing kept. The same rules a subnet task would need.
- **Terrarium**: participation achievements with a living ecosystem. Today it promises users *"no cash, trade, NFT, blockchain or financial value."* **If tokens or NFTs ever attach to Terrarium items, that wording, the rules text and user consent must change first.**
- Photo identification is still a local mock. No real model is connected.

## 3. Roadmap (each phase builds on the one before)

| Phase | What | Depends on | Notes |
|---|---|---|---|
| 1 | **iNaturalist integration** | OAuth app registration | Read taxa and observations; publish a reviewed observation to iNat with the user's approval. See §6. |
| 2 | **Real identification** | Phase 1, or a model | iNat computer vision needs approved, fee-based access. Alternatives: Pl@ntNet for plants, or a self-hosted open model (e.g. BioCLIP). |
| 3 | **Consented dataset** | Phase 2, accounts | Opt-in "contribute to training" per photo; license choice; location generalized; EXIF stripped; provenance and hash per item. Stored on Hippius (§5). |
| 4 | **Model fine-tuning** | Phase 3 | Bundle images into large archive shards, copy them to rented GPUs, fine-tune an existing biodiversity model, publish evaluation results. |
| 5 | **Subnet design and testnet** | Phases 3–4 | Miners and validators on public/consented tasks only (§4). Start on testnet with public or synthetic data. |
| 6 | **Research marketplace** | Accounts, payments | Organizations post scoped surveys and contracts; contributors are paid by quality. Fees fund the platform. |
| 7 | **Restoration MRV pilot** | Field partner | Biochar first (batches, feedstock and lab tests can be audited). Mycoremediation and habitat later. |
| 8 | **Provenance tokens** | Phase 6 | Custody records for clone lineages and seed *lots*, not "the plant itself". Wild locations stay private. |

## 4. Subnet sketch (first draft)

**Start narrow:** one valuable, checkable service.

- **Candidate first task:** identification and enrichment of *public or consented* observations. Miners return a ranked identification with calibrated confidence plus sourced enrichment (habitat, range, look-alikes). Validators score against expert-reviewed holdout sets.
- **Later tasks:** observation verification (photo quality, duplicate detection, plausibility for date and place), re-sighting matches (the same individual insect across photos), dataset cleaning, and model improvement (which contributions actually reduce error).
- **Scoring:** accuracy against hidden expert labels, calibration, provenance completeness, novelty and coverage (not repeats). Penalize copying and duplicates.
- **What miners earn:** subnet alpha, distributed by validator scores (Yuma Consensus). Not a per-upload TAO payment.
- **Contributor rewards in TERRA:** reputation and Terrarium items first (no monetary value). Later, an optional share of rewards for contributions that measurably helped, under clear terms.

**Open design questions**
- How do validators get trustworthy labels without exposing private data? Options: expert-reviewed public holdouts, rotating secret test sets, community-ID consensus with uncertainty.
- How do we stop miners from simply calling the iNat or Pl@ntNet APIs and passing off the answers as their own work?
- What is the smallest real buyer for the first task (a land trust, consultancy or researcher)?

## 5. Storage and training setup

**Hippius (Bittensor Subnet 75)**: decentralized, S3-compatible storage. Good for **datasets, labels, provenance records and model checkpoints**. It is storage, not GPUs.

- Each file is split into 30 shards across independent miners; any 10 rebuild it, and no single node holds a whole file.
- Works with standard S3 tools (boto3, AWS CLI, MinIO): change the endpoint and keep the rest.
- **Limits to plan around:**
  - 100 requests per minute per account, so don't stream single images into training. Pack images into large archive shards (WebDataset-style `.tar`, ~100 MB–1 GB) and copy them to the GPU machine first.
  - No bucket versioning yet. Version datasets with immutable folder names plus a manifest of SHA-256 hashes per release.
  - Encryption for object storage isn't clearly documented. Treat stored data as potentially readable: consented and de-identified only.
- **Training compute** lives elsewhere: rented GPUs (cloud or a Bittensor GPU-rental subnet). Bittensor's main decentralized-training subnet (Templar, SN3) trains LLMs and currently uses Cloudflare R2, not Hippius, so it isn't a fit for image models today.
- **Practical path:** fine-tune an existing biodiversity vision model, measure it on held-out expert data, and only then consider training at larger scale.

## 6. iNaturalist in the meantime

There's no "iNat Pro" tier to rely on. What exists:

- **Public API** (`api.inaturalist.org`, v1): reading taxa, places and observations is free. Be polite with request volume: their docs ask third parties to stay around 60 requests per minute and under 10,000 per day.
- **Writing** (creating observations, uploading photos) uses OAuth with a registered iNaturalist application. Plan: user reviews the observation in TERRA, chooses geoprivacy, then explicitly approves publishing.
- **Computer vision (species suggestions)** is **not public**. iNat staff have granted a small number of research and citizen-science apps fee-based access by request. Worth emailing them about once TERRA has a clear use case and user base.
- Respect iNat licensing and attribution (each photo and observation has its own license) and their geoprivacy for sensitive taxa.

## 7. Professional and citizen-science workspaces

**Recommendation:** one shared data model and quality pipeline, two kinds of workspace, and explicit **release rules** that decide what flows into the shared baseline database.

| | Citizen science (community) | Professional / corporate |
|---|---|---|
| Who | Individuals, clubs, schools | Consultancies, land managers, agencies, companies |
| Default visibility | Public, with geoprivacy (Approximate by default; sensitive species obscured) | Private to the organization and its client |
| Locations | Approximate or hidden by default | Exact, held privately |
| Roles | Observer, identifier, reviewer | Owner, surveyor, reviewer, client viewer, auditor |
| Protocols | Optional; BioBlitz-style missions | Required: survey methods, effort, QA, chain of custody |
| Quality tiers | Casual, community-verified | Expert-verified, protocol-compliant |
| Pays for | Free core features | Subscriptions, contracts, data services |

**How they bleed into each other, with permission:**

- **Release policy per project:** what goes into the baseline, at what precision, and when. For example, "after a 12-month embargo, release species + date + 0.1° area; never release the client name or exact points."
- **Field-level sharing:** taxon and date can be shared while coordinates, photos and notes stay private.
- **Provenance and quality travel with every record:** source workspace type, protocol, reviewer level and license. Professional records can raise the quality tier of an area; citizen records can feed professional projects as clearly labelled supplementary evidence.
- **Contracts drive it:** a research-marketplace job can recruit citizen scientists into a professional protocol (paid by quality), and their contributions follow that job's release policy.

**Getting data out (built Nov 13):** a spreadsheet export (`.xlsx`) from the Journal and Projects screens, with plain-language or **Darwin Core** columns. It opens in Excel and imports into Google Sheets. Locations follow each record's privacy, and exact points are generalized unless the user opts in. Next steps for the professional side:
- **Send straight to Google Sheets / Drive and Microsoft 365:** needs accounts plus a Google Cloud OAuth app (and a Microsoft Entra app), so it waits for the accounts phase. Ask only for file-level access (`drive.file`), never the whole Drive.
- **Darwin Core Archive** (zipped CSVs + `meta.xml` + EML metadata) for direct upload to GBIF and agency portals.
- **Per-organization export templates:** column sets and controlled vocabularies an agency requires (e.g. state natural heritage program forms), saved per workspace.
- **Release rules apply to exports too:** a professional project's embargo and precision settings should limit what any export contains.

**Baseline database:** the union of everything released, de-identified, licensed and quality-tagged. It's the long-term asset that research buyers, models and the subnet can use, and it never mixes in data nobody agreed to share.

**Risks to handle:** client confidentiality contracts, sensitive-species locations, liability for professional-grade claims, mixed quality (keep tiers visible, never average them away), and data licensing conflicts.

## 8. Funding model

Revenue sources, roughly in order of reliability:
1. Sponsored research missions and monitoring contracts (an agency, land trust or university pays for a defined survey and dataset).
2. Data, API and dashboard services for organizations.
3. Grants for public-good pilots, usually led by an eligible nonprofit, university, Tribal organization or local government, with TERRA as contractor or subrecipient. Lead with the science outcome, not tokens.
4. Marketplace fees on cultivated-plant and ecological-materials exchanges, and paid group tools.
5. Subnet emissions: a contributor bonus, never payroll.

Keep grant money and token rewards separate unless a funder explicitly approves otherwise.

## 9. Ideas inbox

New ideas go here first, then move into a phase above when they're scheduled.

- [ ] Marketplace map layers: green observations, red research jobs/recruiting, yellow goods and services (the Map screen already uses these colors for examples).
- [ ] Pokémon-GO-style community events: BioBlitzes and guided forays with access permission and harvest limits.
- [ ] Re-sighting: match the same individual (e.g. an insect) across photos.
- [ ] Camera-roll discovery: find unuploaded organism photos on the user's device (on-device only, with consent).
- [ ] Barcoding and GenBank: a separate sequencing workflow with reviewed submissions.
- [ ] Offline field mode: regional data packs, offline maps, queued sync (GitHub issue #8).
- [ ] NFT/provenance records for Trichocereus clone lineages and seed lots.
- [ ] Terrarium × rewards: if contributors ever earn tokens, decide whether Terrarium items stay purely cosmetic (recommended) or link to on-chain receipts.

### Terrarium and gamification ideas (Nov 11)

**Built Nov 13:** 1, 2, 3, 4, 5, 6 (cards), 8 (ladybugs and aphids, frogs and flies, bees on flowers) plus daily streak achievements (3, 5, 7, 14 and 30 days). Still open: 6's "complete the guide" reward, 7 (more jars), 9 (social), 10 (snapshot), and turning over a log in 5.

Ideas for making the terrarium more engaging, roughly in recommended order:

1. **Your finds live in the jar.** Each new species group you record adds a small inhabitant: log a frog and a frog appears; log a fern and one sprouts. The jar becomes a living picture of your journal.
2. **Seasons, weather and day/night** follow the real date and time: autumn colors, winter frost, spring blooms, fireflies at night. Recording observations brings rain, and rain makes mushrooms fruit.
3. **Field quests:** small daily and weekly missions ("photograph something purple", "3 fungi this week") that reward seed packets or decorations, with a gentle streak counter that never punishes missed days.
4. **Rare variants:** a small chance of a glowing mushroom, an albino snail or an iridescent beetle after real observations, kept in a "rare sightings" log.
5. **Care interactions:** mist the plants, scatter seed for the bird, turn over a log to find a beetle. Small taps that make the jar respond.
6. **Field guide cards:** tap a creature for real facts. Completing the guide unlocks a decoration.
7. **More jars:** unlock desert, rainforest, tide pool and alpine jars by observing in different habitats, and switch between them.
8. **Food webs:** ladybugs eat aphids, birds eat beetles, fungi feed the plants. Jars with more species have richer interactions, which quietly teaches ecology.
9. **Social:** visit friends' terrariums, leave a pebble or seed as a gift, and earn limited-time items for attending BioBlitz events.
10. **Snapshot:** save or share a picture of your terrarium.

Keep all of these participation-based and free of monetary value unless the token decision (§2) changes.

**Rare variants as "shinies":** two tiers so far. *Rare* (glowing mushroom, albino snail, golden beetle) and *Legendary* (moonlight moth at night, white fawn at dawn or dusk). Each one seen is logged with its date in a Rare sightings list where unseen ones show as "???". Next ideas: tie some rares to real conditions (a glowing mushroom is likelier after you log a fungus in the rain), seasonal legendaries, and a reward for completing the list. Rares are cosmetic and never rank people or locations; never reward finding rare *real* species, which could put sensitive populations at risk.

**Extra jars (planned, not built):** desert, rainforest, tide pool and alpine jars, each unlocked by observing in a matching habitat (from the observation's habitat field or map location) and switchable from the Terrarium tab. Each jar needs its own backdrop, resident set and food web, so build one at a time, starting with the desert jar (cactus, lizard, beetle and snake already exist as residents).

**Visiting friends (planned, not built):** needs real accounts and a server, so it waits for the accounts phase. Plan: a read-only snapshot of someone's jar (items, positions, residents; no journal details or locations), shared only with people they follow back, with gifts limited to a seed or pebble per day. Never expose where someone observes.

## 10. Decisions log

| Date | Decision |
|---|---|
| 2026-10-17 | Subnet rewards verifiable data services; no universal ecological value score. |
| 2026-10-17 | Private client data stays off the subnet; only minimized, consented tasks go out. |
| 2026-10-17 | TAO emissions supplement revenue; they're not the business model. |
| 2026-10-21 | Image contributions for model training are opt-in, with files off-chain and receipts on-chain. |
| 2026-11-11 | Hippius for datasets and checkpoints; rented GPUs for fine-tuning; build up to it. |
| 2026-11-11 | Locations moved to real-world coordinates with the same Exact / Approximate / Hidden rules. |
| 2026-11-13 | Genetics stays a "Sequencing" section on each observation plus a list in the Journal, not its own bottom tab, until there's enough sequencing activity to justify one. The tab bar stays focused on the five everyday screens. |
| 2026-11-13 | Streaks use observation dates (backfilled days count) and reset gently: the best streak is kept and nothing earned is lost. Field quests are checked only against the journal; colour quests need the colour in the name or notes. |
| 2026-11-13 | Spreadsheet export is a single `.xlsx` that works in both Excel and Google Sheets, written in the browser with no dependency. Exact points are generalized unless the user opts in. Direct "send to Google Sheets" waits for accounts and OAuth. |
| 2026-11-13 | Extra jars and visiting friends are deferred: jars need per-habitat art; friends needs accounts and a server. |
| 2026-11-11 | Observation photos are saved locally (IndexedDB, resized, metadata stripped) when "Save photos" is checked; still never uploaded or in backups. |

## References

- Bittensor docs: [network](https://www.bittensor.com/docs/concepts/network) · [emissions](https://www.bittensor.com/docs/concepts/emissions) · [mining](https://www.bittensor.com/docs/guides/mining) · [Yuma Consensus](https://www.bittensor.com/docs/internals/consensus)
- Hippius: [S3 drop-in replacement](https://hippius.com/blog/hippius-s3-drop-in-replacement) · [SN75 overview](https://taodaily.io/all-you-need-to-know-about-hippius-sn75)
- Templar (SN3): [Learn Bittensor](https://learnbittensor.org/subnets/3)
- iNaturalist: [API reference](https://www.inaturalist.org/pages/api+reference) · [computer vision access thread](https://forum.inaturalist.org/t/hidden-computer-vision-api/41775) · [geoprivacy](https://www.inaturalist.org/pages/geoprivacy) · [data quality](https://help.inaturalist.org/en/support/solutions/articles/151000169936-what-is-the-data-quality-assessment-dqa-and-how-do-observations-qualify-to-become-research-grade)
- Pl@ntNet: [identify API](https://my.plantnet.org/doc/api/identify)
- MRV: [Isometric biochar protocol](https://isometric.com/pathways/biochar)
- Funding: [EPA participatory science funding](https://www.epa.gov/participatory-science/funding-opportunities-participatory-science-projects) · [NSF funding](https://www.nsf.gov/funding) · [Grants.gov](https://www.grants.gov/)
- Earlier briefs (Ditto): [Ecological value on Bittensor](https://s3.hippius.com/ditto/gtqajnbnUSgwNTB71gCGWOOTEKv2/ditto/main/ecological-value-subnet-brief.md) · [Incentives and TAO value](https://s3.hippius.com/ditto/gtqajnbnUSgwNTB71gCGWOOTEKv2/ditto/main/ecological-subnet-incentives.md) · [Business and funding strategy](https://s3.hippius.com/ditto/gtqajnbnUSgwNTB71gCGWOOTEKv2/ditto/citizen-science-business-and-funding-strategy.md) · [Rooted prototype](https://s3.hippius.com/ditto/gtqajnbnUSgwNTB71gCGWOOTEKv2/ditto/main/rooted-nature-network.html)
