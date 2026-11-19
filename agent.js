"use strict";

// TERRA agent: an observation workflow that runs a few steps for you.
// 1. Prepare the photo: resize and re-encode it, which drops location (EXIF) data.
// 2. Ask Pl@ntNet for plant suggestions, through this TERRA server (/api/identify) so no API key is in the browser.
// 3. When you pick one, gather species info (taxonomy, common name, status, summary) from GBIF, iNaturalist and Wikipedia.
// 4. Fill the name and group in the form. Saving keeps the chosen scientific name as the record's `taxon`.
// Nothing is sent unless you press Identify, or turn on auto-identify. Location, notes and ids are never sent.
const TerraAgent = (() => {
  const PREF = "terra.agent.v1";
  const $ = id => document.getElementById(id);
  const card = $("agent-card"), steps = $("agent-steps"), status = $("agent-status"), results = $("agent-results"), info = $("agent-species");
  const nameInput = $("name"), organismChoice = $("organism-choice"), auto = $("agent-auto"), identifyButton = $("agent-identify");
  let photo = null, chosen = null, run = 0, available = null;

  const readPref = () => { try { const p = JSON.parse(localStorage.getItem(PREF)); return p && p.version === 1 ? p : { version: 1, auto: false }; } catch { return { version: 1, auto: false }; } };
  const writePref = p => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch { /* Preference only. */ } };
  auto.checked = readPref().auto;
  auto.addEventListener("change", () => { writePref({ version: 1, auto: auto.checked }); if (auto.checked && photo && !chosen) identify(); });

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const STEP_TEXT = { prepare: "Prepare photo (resize, remove location data)", identify: "Ask Pl@ntNet for plant suggestions", species: "Gather species info from GBIF, iNaturalist and Wikipedia", fill: "Fill in your observation" };
  function setSteps(state) {
    steps.replaceChildren(...Object.entries(STEP_TEXT).filter(([k]) => state[k]).map(([k, text]) => {
      const li = el("li", `agent-step ${state[k]}`); li.dataset.step = k;
      li.append(el("span", "agent-step-mark", { done: "✓", active: "…", skipped: "–", failed: "!" }[state[k]] ?? ""), el("span", "", text));
      return li;
    }));
  }
  let stepState = {};
  const step = (k, v) => { stepState = { ...stepState, [k]: v }; setSteps(stepState); };

  async function api(path, init) {
    let response;
    try { response = await fetch(path, init); }
    catch { throw { code: "offline", message: "The TERRA agent needs the TERRA server (python server.py) and an internet connection." }; }
    let body = null;
    try { body = await response.json(); } catch { /* Non-JSON error page. */ }
    if (!response.ok) throw { code: body?.error ?? "upstream", message: body?.message ?? "The TERRA agent couldn't finish. Try again." };
    return body;
  }
  async function checkAvailable() {
    if (available) return available;
    try { available = await api("/api/agent/status"); } catch (error) { available = null; throw error; }
    return available;
  }

  // Resize to at most 1280 px on the long side and re-encode as JPEG: this also strips EXIF/GPS.
  async function prepare(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error("encode")), "image/jpeg", 0.9));
  }

  // GBIF taxonomy wins; iNaturalist's "iconic taxon" is only a fallback.
  const fromClass = (k, c) => {
    if (["bacteria", "archaea", "protozoa", "chromista", "viruses"].includes(k)) return "Microorganism";
    if (k === "plantae") return "Plant";
    if (k === "fungi") return "Mushroom";
    if (c === "insecta") return "Insect";
    if (c === "aves") return "Bird";
    if (c === "mammalia") return "Mammal";
    if (["reptilia", "squamata", "testudines", "crocodylia", "amphibia"].includes(c)) return "Reptile";
    if (["actinopterygii", "chondrichthyes", "elasmobranchii"].includes(c)) return "Fish";
    return null;
  };
  const groupFor = (taxon = {}) => {
    const k = (taxon.kingdom ?? "").toLowerCase(), c = (taxon.class ?? "").toLowerCase(), iconic = (taxon.iconic ?? "").toLowerCase();
    return fromClass(k, c) ?? fromClass(iconic === "plantae" || iconic === "fungi" ? iconic : "", iconic);
  };

  async function identify() {
    if (!photo) return;
    const mine = ++run;
    chosen = null; results.replaceChildren(); info.hidden = true; stepState = {};
    identifyButton.disabled = true;
    try {
      const group = organismChoice.value.trim().toLowerCase();
      step("prepare", "active"); status.textContent = "Preparing your photo…";
      const blob = await prepare(photo);
      if (mine !== run) return;
      step("prepare", "done");
      if (group && group !== "plant") {
        step("identify", "skipped");
        status.textContent = `Pl@ntNet identifies plants. For ${organismChoice.value.trim().toLowerCase()} photos, iNaturalist photo ID will plug in once iNaturalist approves TERRA. You can still type a name and use “Species info”.`;
        return;
      }
      step("identify", "active"); status.textContent = "Asking Pl@ntNet…";
      await checkAvailable();
      if (!available?.plantnet) throw { code: "not_configured", message: "Plant ID isn't set up on this TERRA server yet. Add a free Pl@ntNet API key as PLANTNET_API_KEY and restart the server." };
      const form = new FormData();
      form.append("image", blob, "photo.jpg");
      form.append("organ", $("agent-organ").value);
      const answer = await api("/api/identify", { method: "POST", body: form });
      if (mine !== run) return;
      step("identify", "done");
      showResults(answer);
    } catch (error) {
      if (mine !== run) return;
      const failing = Object.entries(stepState).find(([, v]) => v === "active")?.[0];
      if (failing) step(failing, "failed");
      status.textContent = error?.message ?? "This photo couldn't be prepared. Try a JPEG or PNG.";
    } finally { if (mine === run) identifyButton.disabled = false; }
  }

  function showResults({ results: list = [], remaining }) {
    results.replaceChildren();
    if (!list.length) { status.textContent = "Pl@ntNet didn't recognise a plant in this photo. Try a closer, sharper shot of one leaf or flower."; return; }
    status.textContent = `Pl@ntNet suggests ${list.length === 1 ? "one species" : `${list.length} species`}. Pick the one that matches what you saw.${Number.isInteger(remaining) ? ` (${remaining} identifications left today.)` : ""}`;
    list.forEach((r, i) => {
      const li = el("li", "agent-result");
      const pct = typeof r.score === "number" ? Math.round(r.score * 100) : null;
      const text = el("div", "agent-result-text");
      text.append(el("strong", "", r.commonNames?.[0] ?? r.scientificName), el("em", "", r.scientificName));
      if (r.family) text.append(el("small", "", r.family));
      const meter = el("span", "agent-score");
      meter.style.setProperty("--score", `${pct ?? 0}%`);
      meter.append(el("span", "", pct === null ? "?" : `${pct}%`));
      meter.setAttribute("aria-label", pct === null ? "Confidence unknown" : `${pct}% confidence`);
      const use = el("button", "secondary-button", i === 0 ? "Use this" : "Use");
      use.type = "button";
      use.setAttribute("aria-label", `Use ${r.commonNames?.[0] ?? r.scientificName}`);
      use.addEventListener("click", () => choose({ scientificName: r.scientificName, commonName: r.commonNames?.[0], family: r.family, gbifKey: r.gbifKey, score: r.score, source: "plantnet" }));
      li.append(text, meter, use);
      results.append(li);
    });
  }

  // Look up species info and fill the form. `pick` comes from Pl@ntNet, or from the typed name.
  async function choose(pick) {
    const mine = ++run;
    step("species", "active"); status.textContent = `Gathering species info for ${pick.scientificName}…`;
    let data = null;
    try { data = await api(`/api/species?name=${encodeURIComponent(pick.scientificName)}`); }
    catch (error) { if (mine !== run) return; step("species", "failed"); status.textContent = `${error.message} The suggestion can still be used.`; }
    if (mine !== run) return;
    if (data) step("species", "done");
    const gbif = data?.gbif ?? {}, inat = data?.inat ?? {};
    const scientific = gbif.canonicalName || pick.scientificName;
    const common = pick.commonName || inat.commonName || "";
    const display = common ? common.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 120) : scientific.slice(0, 120);
    chosen = {
      name: display,
      taxon: Object.fromEntries(Object.entries({
        scientificName: scientific.slice(0, 200), source: pick.source,
        gbifKey: Number.isInteger(gbif.key) && gbif.key > 0 ? gbif.key : Number.isInteger(pick.gbifKey) && pick.gbifKey > 0 ? pick.gbifKey : undefined,
        score: typeof pick.score === "number" && pick.score >= 0 && pick.score <= 1 ? pick.score : undefined,
        rank: typeof gbif.rank === "string" ? gbif.rank.toLowerCase().slice(0, 30) : undefined,
        family: (gbif.family || pick.family || "").slice(0, 60) || undefined,
        kingdom: (gbif.kingdom || "").slice(0, 60) || undefined,
        class: (gbif.class || "").slice(0, 60) || undefined
      }).filter(([, v]) => v !== undefined))
    };
    nameInput.value = display;
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    const group = groupFor({ kingdom: gbif.kingdom, class: gbif.class, iconic: inat.iconic });
    if (group) { organismChoice.value = group; organismChoice.dispatchEvent(new Event("input", { bubbles: true })); organismChoice.dispatchEvent(new Event("change", { bubbles: true })); }
    step("fill", "done");
    results.replaceChildren(); // Picked: the other suggestions are no longer needed.
    status.textContent = `Filled in “${display}”${group ? ` (${group})` : ""}. Check it against what you saw before saving; you can still edit anything.`;
    renderSpecies(display, scientific, data);
  }

  function renderSpecies(display, scientific, data) {
    info.replaceChildren();
    const head = el("header", "agent-species-head");
    const titles = el("div");
    titles.append(el("h4", "", display), el("p", "agent-sci", scientific));
    head.append(titles);
    const photoUrl = data?.inat?.photo?.url;
    if (photoUrl && /^https:\/\//.test(photoUrl)) {
      const fig = el("figure", "agent-photo");
      const img = el("img"); img.src = photoUrl; img.alt = `Reference photo of ${display} from iNaturalist`; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => fig.remove());
      fig.append(img);
      if (data.inat.photo.attribution) fig.append(el("figcaption", "", data.inat.photo.attribution));
      head.prepend(fig);
    }
    info.append(head);
    const facts = el("dl", "agent-facts");
    const add = (k, v) => { if (v === undefined || v === null || v === "") return; facts.append(el("dt", "", k), el("dd", "", String(v))); };
    const g = data?.gbif ?? {}, i = data?.inat ?? {};
    add("Family", g.family);
    add("Order", g.order);
    add("Class", g.class);
    add("Kingdom", g.kingdom);
    add("Observations on iNaturalist", Number.isInteger(i.observations) ? i.observations.toLocaleString() : undefined);
    add("Conservation status", i.conservation);
    if (g.matchType && g.matchType !== "EXACT") add("Name match", `${g.matchType.toLowerCase()} match to GBIF (check the spelling)`);
    if (facts.children.length) info.append(facts);
    if (data?.wikipedia?.extract) info.append(el("p", "agent-extract", data.wikipedia.extract));
    const links = el("p", "agent-links");
    const link = (label, href) => { if (!href || !/^https?:\/\//.test(href)) return; const a = el("a", "", label); a.href = href.replace(/^http:/, "https:"); a.target = "_blank"; a.rel = "noopener noreferrer"; links.append(a); };
    link("GBIF", g.key ? `https://www.gbif.org/species/${g.key}` : null);
    link("iNaturalist", i.url);
    link("Wikipedia", data?.wikipedia?.url);
    if (links.children.length) info.append(links);
    if (data?.sources?.length) info.append(el("p", "agent-sources", `Sources: ${data.sources.join(", ")}. Check the details against what you saw.`));
    if (!data) info.append(el("p", "agent-sources", "Species details couldn't be loaded right now."));
    info.hidden = false;
  }

  // Typed name → species info, for any group.
  $("agent-lookup").addEventListener("click", () => {
    const name = nameInput.value.trim();
    card.hidden = false;
    if (name.length < 2 || name.toLowerCase() === "unknown") { status.textContent = "Type a species name first, then press Species info."; return; }
    stepState = {}; setSteps(stepState); results.replaceChildren();
    choose({ scientificName: name, source: "gbif" });
  });
  identifyButton.addEventListener("click", identify);
  // The chosen identification only sticks while the name is still the one the agent filled in.
  nameInput.addEventListener("input", () => { if (chosen && nameInput.value.trim() !== chosen.name) { chosen = null; } });
  document.addEventListener("terra:photo-previewed", event => {
    photo = event.detail.file; card.hidden = false;
    stepState = {}; setSteps(stepState); results.replaceChildren(); info.hidden = true;
    status.textContent = auto.checked ? "" : "Press Identify to get plant suggestions for this photo.";
    if (auto.checked) identify();
  });
  document.addEventListener("terra:photo-cleared", () => { photo = null; run++; identifyButton.disabled = false; if (!chosen) card.hidden = true; });

  function reset() {
    run++; photo = null; chosen = null; card.hidden = true;
    stepState = {}; setSteps(stepState); results.replaceChildren(); info.hidden = true; info.replaceChildren(); status.textContent = "";
  }
  // The taxon to save, if the observation still has the name the agent filled in.
  const taxonFor = name => chosen && name === chosen.name ? { ...chosen.taxon } : null;
  return Object.freeze({ taxonFor, reset, groupFor });
})();
