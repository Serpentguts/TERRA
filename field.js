"use strict";

// Field sessions: start a session, add photos as you go (straight from the phone's camera), and the
// TERRA agent works through them in the background: plant ID with Pl@ntNet, species info from GBIF,
// iNaturalist and Wikipedia, and what's seen near where you took the photo. Each photo becomes a
// DRAFT in the agent inbox. Nothing reaches your journal until you approve it; you can edit or
// delete any draft. The agent also asks questions to help you write your OWN notes. Posting to
// iNaturalist sends only your words (machine-written text isn't allowed there); for now it's a
// preview until TERRA is registered as an iNaturalist app (see INAT_LIVE).
// Drafts and photos live in this browser (IndexedDB) and survive going offline; the agent picks
// up again when you're back online.
const TerraField = (() => {
  const DB = "terra-field", INAT_KEY = "terra.inat.v1", TOKEN_LIFE = 24 * 3600 * 1000;
  // Real posting needs TERRA registered as an iNaturalist app (planned for the app release). Until
  // then the post buttons open a preview of exactly what would be sent. Flip to true to post for real
  // with a personal API token (the server route and token panel are already built).
  // (Tests and local experiments can set window.TERRA_INAT_LIVE = true before this script loads.)
  const INAT_LIVE = typeof window !== "undefined" && window.TERRA_INAT_LIVE === true;
  const GROUP_LABEL = { plant: "Plant", fungus: "Mushroom", reptile: "Reptile", insect: "Insect", fish: "Fish", microorganism: "Microorganism", mammal: "Mammal", bird: "Bird", other: "Other" };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pct = n => `${Math.round(n * 100)}%`;
  const round1 = n => Math.round(n * 10) / 10;

  // ---------- pure helpers (tested in node) ----------
  // The busiest stretch of the year from a 12-month histogram, e.g. "March to May".
  function season(months) {
    if (!Array.isArray(months) || months.length !== 12) return null;
    const total = months.reduce((a, b) => a + b, 0);
    if (total < 5) return null;
    let best = { start: 0, len: 1, sum: -1 };
    for (let len = 1; len <= 4; len++) for (let start = 0; start < 12; start++) {
      let sum = 0; for (let k = 0; k < len; k++) sum += months[(start + k) % 12];
      if (sum >= total * 0.6 && (best.sum < 0 || len < best.len)) best = { start, len, sum };
    }
    if (best.sum < 0) return null;
    const a = MONTHS[best.start], b = MONTHS[(best.start + best.len - 1) % 12];
    return best.len === 1 ? a : `${a} to ${b}`;
  }
  // The agent's write-up: built only from the sources it consulted, with honest uncertainty.
  function compose(d) {
    const lines = [], sources = new Set();
    const pick = d.guesses?.[d.chosen ?? 0], sp = d.species, near = d.nearby;
    const common = pick?.commonName || sp?.inat?.commonName, sci = sp?.gbif?.canonicalName || pick?.scientificName;
    if (pick) {
      sources.add(pick.source === "plantnet" ? "Pl@ntNet" : "GBIF");
      lines.push(`Best guess: ${common ? `${common} (${sci})` : sci}${typeof pick.score === "number" ? `, ${pct(pick.score)} match from Pl@ntNet` : ""}.`);
      const others = (d.guesses ?? []).filter((_, i) => i !== (d.chosen ?? 0)).slice(0, 2);
      if (others.length) lines.push(`Also possible: ${others.map(o => `${o.commonName || o.scientificName}${typeof o.score === "number" ? ` (${pct(o.score)})` : ""}`).join(", ")}.`);
    } else lines.push(d.group && d.group !== "plant"
      ? `No photo ID for ${GROUP_LABEL[d.group]?.toLowerCase() ?? "this group"} yet. Pick a name from what's common nearby, or type your own.`
      : "No confident photo match. Try a closer, sharper photo of one leaf or flower, or type a name.");
    if (sp?.gbif) { sources.add("GBIF"); const g = sp.gbif; const tax = [g.family && `family ${g.family}`, g.order && `order ${g.order}`].filter(Boolean).join(", "); if (tax) lines.push(`Taxonomy: ${tax}.`); }
    if (sp?.inat?.conservation) { sources.add("iNaturalist"); lines.push(`Conservation status: ${sp.inat.conservation}.`); }
    if (near?.species && Number.isInteger(near.species.nearby)) {
      sources.add("iNaturalist");
      const when = season(near.species.months);
      lines.push(near.species.nearby
        ? `Near here: ${near.species.nearby.toLocaleString("en")} iNaturalist observation${near.species.nearby === 1 ? "" : "s"} within ${near.radiusKm} km${when ? `, mostly ${when}` : ""}.`
        : `Near here: no iNaturalist observations within ${near.radiusKm} km. It may be unusual here, or the ID may be off: worth a second look.`);
    }
    if (near?.common?.length) { sources.add("iNaturalist"); lines.push(`Commonly seen nearby${d.group ? ` (${GROUP_LABEL[d.group]?.toLowerCase()})` : ""}: ${near.common.slice(0, 5).map(c => c.commonName || c.name).join(", ")}.`); }
    if (sp?.wikipedia?.extract) { sources.add("Wikipedia"); lines.push(sp.wikipedia.extract.split(/(?<=\.)\s/)[0]); }
    if (!d.location) lines.push("No location: the photo had no GPS and the device location wasn't available. Add one before posting.");
    lines.push("This is a draft from the TERRA agent. Check it against what you saw.");
    return { summary: lines.join("\n").slice(0, 4000), sources: [...sources] };
  }
  // A journal record from an approved draft. Location follows the privacy you chose.
  function toRecord(d, { id, name, group, notes, privacy, today, GEO, GEO_CELL = 0.1 }) {
    const date = (d.capturedAt ?? today).slice(0, 10) <= today ? (d.capturedAt ?? today).slice(0, 10) : today;
    let location;
    if (privacy === "hidden" || !d.location) location = { version: 1, space: GEO, kind: "withheld" };
    else if (privacy === "exact") location = { version: 1, space: GEO, kind: "point", x: Math.round(d.location.lon * 1e5) / 1e5, y: Math.round(d.location.lat * 1e5) / 1e5 };
    else {
      const snap = (v, lo, hi) => Math.min(hi, Math.max(lo, round1(Math.floor(v / GEO_CELL) * GEO_CELL - GEO_CELL)));
      const x1 = snap(d.location.lon, -180, 179.7), y1 = snap(d.location.lat, -90, 89.7);
      location = { version: 1, space: GEO, kind: "region", x1, y1, x2: round1(x1 + 3 * GEO_CELL), y2: round1(y1 + 3 * GEO_CELL) };
    }
    const effectivePrivacy = location.kind === "withheld" ? "hidden" : privacy;
    const pick = d.guesses?.[d.chosen ?? 0], g = d.species?.gbif;
    const chosenName = (name ?? "").trim() || "Unknown";
    const record = { id, type: group, name: chosenName.slice(0, 120), notes: (notes ?? "").trim().slice(0, 2000), date, privacy: effectivePrivacy, location };
    const sci = g?.canonicalName || pick?.scientificName;
    if (sci && d.nameFromAgent === chosenName) {
      record.taxon = Object.fromEntries(Object.entries({ scientificName: sci.slice(0, 200), source: pick?.source === "plantnet" ? "plantnet" : "gbif",
        gbifKey: Number.isInteger(g?.key) && g.key > 0 ? g.key : Number.isInteger(pick?.gbifKey) && pick.gbifKey > 0 ? pick.gbifKey : undefined,
        score: typeof pick?.score === "number" && pick.score >= 0 && pick.score <= 1 ? pick.score : undefined,
        rank: typeof g?.rank === "string" ? g.rank.toLowerCase().slice(0, 30) : undefined, family: (g?.family || pick?.family || "").slice(0, 60) || undefined,
        kingdom: (g?.kingdom || "").slice(0, 60) || undefined, class: (g?.class || "").slice(0, 60) || undefined }).filter(([, v]) => v !== undefined));
    }
    if (d.writeUp?.summary) record.agent = { summary: d.writeUp.summary.slice(0, 4000), sources: d.writeUp.sources.slice(0, 8) };
    return record;
  }
  // What goes to iNaturalist: your chosen name, date, location (privacy → geoprivacy), your own notes.
  function inatFields(r) {
    const f = { name: r.name, scientificName: r.taxon?.scientificName ?? null, date: r.date, privacy: r.privacy, notes: r.notes };
    const l = r.location;
    if (l?.kind === "point") Object.assign(f, { lat: l.y, lon: l.x, accuracy: 10 });
    else if (l?.kind === "region") {
      const lat = (l.y1 + l.y2) / 2, lon = (l.x1 + l.x2) / 2, dy = (l.y2 - l.y1) * 111320, dx = (l.x2 - l.x1) * 111320 * Math.cos(lat * Math.PI / 180);
      Object.assign(f, { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, accuracy: Math.round(Math.hypot(dx, dy) / 2) });
    }
    return f;
  }
  // Questions that help YOU write your notes. The agent asks; you answer in your own words, and only
  // your answers become notes. Each prompt adds a short label line ("Count: ") for you to finish.
  // Questions come from the group, plus anything the agent noticed (rare here, out of season, a close
  // call between two guesses). At most five.
  const GROUP_PROMPTS = {
    plant: [["Flowering or fruiting?", "Flowers/fruit"], ["Growing where?", "Habitat"], ["How many?", "Count"]],
    fungus: [["Growing on what?", "Substrate"], ["Cap and gill details?", "Features"], ["Smell, bruising or spore print?", "Tests"], ["How many?", "Count"]],
    insect: [["What was it doing?", "Behaviour"], ["On what plant or surface?", "Found on"], ["Alive or dead?", "Condition"]],
    reptile: [["What was it doing?", "Behaviour"], ["Rough size?", "Size"], ["Alive or dead?", "Condition"]],
    fish: [["Where in the water?", "Habitat"], ["Rough size?", "Size"], ["How many?", "Count"]],
    bird: [["What was it doing?", "Behaviour"], ["Heard it? What did it sound like?", "Call"], ["How many?", "Count"]],
    mammal: [["What was it doing?", "Behaviour"], ["Seen, or signs (tracks, scat)?", "Evidence"], ["How many?", "Count"]],
    microorganism: [["Where did the sample come from?", "Sample"], ["Magnification and stain?", "Microscope"], ["Moving? How?", "Motility"]],
    other: [["What made you stop?", "Notes"], ["Growing where?", "Habitat"], ["How many?", "Count"]],
  };
  function notePrompts(d, now = new Date()) {
    const out = [], near = d.nearby?.species, g = d.guesses ?? [];
    const top = g[d.chosen ?? 0], next = g.find((_, i) => i !== (d.chosen ?? 0));
    const label = x => x?.commonName || x?.scientificName;
    if (top && next && typeof top.score === "number" && typeof next.score === "number" && Math.abs(top.score - next.score) < 0.15)
      out.push({ ask: `Close call between ${label(top)} and ${label(next)}. What tells them apart here?`, label: "ID features" });
    if (near && near.nearby === 0) out.push({ ask: "No records within 10 km. What makes you confident in the ID?", label: "ID notes" });
    else if (near) {
      const when = season(near.months), m = (d.capturedAt ? new Date(d.capturedAt) : now).getMonth();
      const total = (near.months ?? []).reduce((a, b) => a + b, 0);
      if (when && total >= 5 && near.months[m] / total < 0.03) out.push({ ask: `Usually seen ${when} near here. Anything unusual about this one?`, label: "Timing" });
    }
    if (!d.location) out.push({ ask: "No GPS on this photo. Where were you?", label: "Place" });
    for (const [ask, lbl] of GROUP_PROMPTS[d.group] ?? GROUP_PROMPTS.other) out.push({ ask, label: lbl });
    return out.slice(0, 5);
  }
  // Add a "Label: " line to the notes (or move to it if it's there), leaving the cursor after it.
  function addPromptLine(text, lbl) {
    const lines = text.split("\n"), at = lines.findIndex(l => l.startsWith(`${lbl}: `) || l === `${lbl}:`);
    if (at >= 0) { const before = lines.slice(0, at + 1).join("\n"); return { text, cursor: before.length }; }
    const base = text.replace(/\s+$/, ""), next = `${base ? `${base}\n` : ""}${lbl}: `;
    return { text: next, cursor: next.length };
  }
  const tokenFresh = (t, now = Date.now()) => Boolean(t && typeof t.token === "string" && t.token && Number.isFinite(t.saved) && now - t.saved < TOKEN_LIFE);

  if (typeof document === "undefined") return Object.freeze({ season, compose, toRecord, inatFields, tokenFresh, notePrompts, addPromptLine, GROUP_LABEL, INAT_LIVE });

  // ---------- storage (IndexedDB) ----------
  let dbPromise = null;
  const open = () => dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "id" }).createIndex("session", "sessionId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  const tx = async (store, mode, fn) => { const db = await open(); return new Promise((resolve, reject) => { const t = db.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => resolve(out?.result ?? out); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); }); };
  const all = store => tx(store, "readonly", s => s.getAll());
  const put = (store, value) => tx(store, "readwrite", s => { s.put(value); });
  const del = (store, id) => tx(store, "readwrite", s => { s.delete(id); });
  const uid = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const today = () => new Date().toLocaleDateString("en-CA");
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  // Resize to ≤1600 px (and a 360 px thumbnail): smaller files, and re-encoding drops EXIF.
  async function shrink(file, max) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bitmap.width * scale)); c.height = Math.max(1, Math.round(bitmap.height * scale));
    c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height); bitmap.close?.();
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(Error("encode")), "image/jpeg", 0.88));
  }
  const deviceSpot = () => new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lon: Math.round(p.coords.longitude * 1e5) / 1e5, accuracy: Math.round(p.coords.accuracy || 50), source: "device" }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });

  // ---------- state ----------
  let sessions = [], drafts = [], urls = new Map(), running = false;
  const activeSession = () => sessions.find(s => !s.ended) ?? null;
  const thumbUrl = d => { if (!urls.has(d.id) && d.thumb) urls.set(d.id, URL.createObjectURL(d.thumb)); return urls.get(d.id); };
  async function reload() {
    try { [sessions, drafts] = await Promise.all([all("sessions"), all("drafts")]); }
    catch { $("field-status").textContent = "Field sessions need browser storage (IndexedDB), which is blocked here."; sessions = []; drafts = []; }
    drafts.sort((a, b) => (a.capturedAt ?? a.added).localeCompare(b.capturedAt ?? b.added));
    render();
  }

  // ---------- adding photos ----------
  async function addPhotos(files) {
    const session = activeSession();
    if (!session) return;
    const list = [...files].filter(f => /^image\//.test(f.type)).slice(0, 30);
    if (!list.length) return;
    $("field-status").textContent = `Adding ${list.length} photo${list.length === 1 ? "" : "s"}…`;
    let device = null, askedDevice = false;
    for (const file of list) {
      let meta = {};
      try { meta = TerraExif.read(await file.slice(0, 256 * 1024).arrayBuffer()); } catch { /* No EXIF. */ }
      let location = Number.isFinite(meta.lat) ? { lat: meta.lat, lon: meta.lon, accuracy: 20, source: "photo" } : null;
      if (!location && session.useDevice) { if (!askedDevice) { device = await deviceSpot(); askedDevice = true; } location = device; }
      try {
        const [photo, thumb] = await Promise.all([shrink(file, 1600), shrink(file, 360)]);
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const taken = meta.taken && meta.taken.slice(0, 10) <= today() ? meta.taken : local;
        await put("drafts", { id: uid(), sessionId: session.id, added: now.toISOString(), capturedAt: taken, location, group: session.group, status: "queued", photo, thumb, guesses: [], chosen: 0, species: null, nearby: null, writeUp: null, note: "" });
      } catch { $("field-status").textContent = "One photo couldn't be read. Try a JPEG or PNG."; }
    }
    await reload();
    $("field-status").textContent = `${list.length} photo${list.length === 1 ? "" : "s"} added. The agent is on it${navigator.onLine === false ? " as soon as you're back online" : ""}.`;
    run();
  }

  // ---------- the agent ----------
  async function api(path, init) {
    let res;
    try { res = await fetch(path, init); } catch { throw { code: "offline", message: "Waiting for a connection to the TERRA server." }; }
    let body = null; try { body = await res.json(); } catch { /* Not JSON. */ }
    if (!res.ok) throw { code: body?.error ?? "upstream", message: body?.message ?? "Something went wrong." };
    return body;
  }
  async function work(d) {
    const notes = [];
    d.guesses = [];
    if (d.group === "plant") {
      try {
        const form = new FormData(); form.append("image", d.photo, "photo.jpg"); form.append("organ", "auto");
        const r = await api("/api/identify", { method: "POST", body: form });
        d.guesses = (r.results ?? []).slice(0, 5).map(x => ({ scientificName: x.scientificName, commonName: x.commonNames?.[0] ?? "", family: x.family, score: x.score, gbifKey: x.gbifKey, source: "plantnet" }));
      } catch (e) { if (e.code === "offline") throw e; notes.push(e.message); }
    }
    const pick = d.guesses[0];
    if (pick) { try { d.species = await api(`/api/species?name=${encodeURIComponent(pick.scientificName)}`); } catch (e) { if (e.code === "offline") throw e; } }
    if (d.location) {
      const q = new URLSearchParams({ lat: round1(d.location.lat), lon: round1(d.location.lon), group: d.group, ...(pick ? { name: pick.scientificName } : {}) });
      try { d.nearby = await api(`/api/nearby?${q}`); } catch (e) { if (e.code === "offline") throw e; notes.push("Nearby records unavailable right now."); }
    }
    if (pick) d.nameFromAgent = titleCase(pick.commonName || d.species?.inat?.commonName || pick.scientificName);
    d.writeUp = compose(d);
    if (notes.length) d.writeUp.summary = `${notes.join(" ")}\n${d.writeUp.summary}`;
    d.status = "ready";
  }
  const titleCase = s => String(s ?? "").replace(/\b\w/g, c => c.toUpperCase()).slice(0, 120);
  async function run() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const d = drafts.find(x => x.status === "queued" || x.status === "waiting");
        if (!d) break;
        d.status = "working"; render();
        try { await work(d); }
        catch (e) { d.status = "waiting"; d.error = e.message; await put("drafts", d); render(); break; }
        d.error = null;
        await put("drafts", d);
        render();
      }
    } finally { running = false; }
  }
  // Choosing another guess (or a nearby species) re-gathers info for it.
  async function choose(d, i, name) {
    if (name) d.guesses = [...d.guesses, { scientificName: name, commonName: "", source: "gbif" }], i = d.guesses.length - 1;
    d.chosen = i; delete d.typedName;
    const pick = d.guesses[i];
    d.status = "working"; render();
    try {
      d.species = await api(`/api/species?name=${encodeURIComponent(pick.scientificName)}`);
      if (d.location) d.nearby = await api(`/api/nearby?${new URLSearchParams({ lat: round1(d.location.lat), lon: round1(d.location.lon), group: d.group, name: pick.scientificName })}`);
    } catch { /* Keep what we have. */ }
    d.nameFromAgent = titleCase(pick.commonName || d.species?.inat?.commonName || pick.scientificName);
    d.writeUp = compose(d); d.status = "ready";
    await put("drafts", d); render();
  }

  // ---------- review ----------
  async function approve(d, card, { post = false } = {}) {
    const name = card.querySelector(".draft-name").value, group = card.querySelector(".draft-group").value;
    const notes = card.querySelector(".draft-notes").value, privacy = card.querySelector(".draft-privacy").value;
    const record = toRecord(d, { id: uid(), name, group, notes, privacy, today: today(), GEO: TerraData.GEO, GEO_CELL: TerraData.GEO_CELL });
    if (!TerraJournal.add(record)) { card.querySelector(".draft-status").textContent = "Couldn't save to your journal (storage blocked or full). The draft is kept."; return false; }
    try { await TerraPhotos.save(record.id, [new File([d.photo], "photo.jpg", { type: "image/jpeg" })]); } catch { /* The record is safe without its photo. */ }
    await del("drafts", d.id);
    if (urls.has(d.id)) { URL.revokeObjectURL(urls.get(d.id)); urls.delete(d.id); }
    TerraScreens.toast(`Added “${record.name}” to your journal.`, { href: "#journal", label: "View" });
    if (post) await postToInat(record);
    await reload();
    return true;
  }
  async function remove(d) {
    await del("drafts", d.id);
    if (urls.has(d.id)) { URL.revokeObjectURL(urls.get(d.id)); urls.delete(d.id); }
    await reload();
  }
  // Hand a draft to the full Record form for detailed edits; it leaves the inbox when saved.
  let editing = null;
  function editInForm(d, card) {
    editing = d.id;
    const group = card.querySelector(".draft-group").value, privacy = card.querySelector(".draft-privacy").value;
    $("organism-choice").value = GROUP_LABEL[group]; $("organism-choice").dispatchEvent(new Event("input", { bubbles: true }));
    $("name").value = card.querySelector(".draft-name").value;
    $("date").value = (d.capturedAt ?? today()).slice(0, 10); $("date").dispatchEvent(new Event("input", { bubbles: true }));
    $("notes").value = card.querySelector(".draft-notes").value;
    const p = d.location ? privacy : "hidden";
    $("privacy").value = p; $("privacy").dispatchEvent(new Event("change", { bubbles: true }));
    if (d.location && p !== "hidden") {
      const r = toRecord(d, { id: "x", name: "x", group, notes: "", privacy: p, today: today(), GEO: TerraData.GEO, GEO_CELL: TerraData.GEO_CELL }).location;
      try { if (r.kind === "point") TerraMaps.observation.select(r.x, r.y); else if (r.kind === "region") TerraMaps.observation.select(r.x1, r.y1, r.x2, r.y2); } catch { /* Pick on the map. */ }
    }
    const transfer = new DataTransfer(); transfer.items.add(new File([d.photo], "field-photo.jpg", { type: "image/jpeg" }));
    $("photo").files = transfer.files; $("photo").dispatchEvent(new Event("change", { bubbles: true }));
    $("field-status").textContent = "Draft moved to the form below. It leaves the inbox when you save.";
    $("organism-choice").scrollIntoView({ block: "center", behavior: "smooth" });
  }
  document.addEventListener("terra:observation-saved", () => { if (editing) { const id = editing; editing = null; del("drafts", id).then(reload).catch(() => {}); } });

  // ---------- iNaturalist ----------
  const readToken = () => { try { const t = JSON.parse(localStorage.getItem(INAT_KEY)); return tokenFresh(t) ? t : null; } catch { return null; } };
  async function previewInat(record) {
    const f = inatFields(record), dl = $("inat-preview-fields"), dialog = $("inat-preview");
    let photos = 0;
    try { photos = Math.min(4, (await TerraPhotos.forObservation(record.id)).length); } catch { /* No photos stored. */ }
    const where = { exact: "Exact (public)", approximate: "Obscured (shown as an area, not a point)", hidden: "Private" }[f.privacy] ?? f.privacy;
    const rows = [["Name", f.name], ["Scientific name", f.scientificName || "None (stays a name guess)"], ["Date observed", f.date],
      ["Location", f.lat != null ? `${where} · ${f.lat.toFixed(3)}, ${f.lon.toFixed(3)} ±${f.accuracy.toLocaleString("en")} m` : `${where} · no coordinates`],
      ["Photos", `${photos}`], ["Your notes", f.notes || "(none yet: add some in your journal before posting)"]];
    dl.replaceChildren(...rows.flatMap(([k, v]) => [el("dt", "", k), el("dd", k === "Your notes" ? "inat-preview-notes" : "", v)]));
    if (typeof dialog.showModal === "function") { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute("open", "");
    return null;
  }
  async function postToInat(record) {
    if (!INAT_LIVE) return previewInat(record);
    const t = readToken();
    if (!t) { TerraScreens.toast("Add a fresh iNaturalist token first (Record → Agent inbox → iNaturalist).", { href: "#record", label: "Add token" }); return null; }
    const form = new FormData();
    form.append("observation", JSON.stringify(inatFields(record)));
    try { for (const p of (await TerraPhotos.forObservation(record.id)).slice(0, 4)) form.append("photos", p.full ?? p.blob ?? p, "photo.jpg"); } catch { /* Post without photos. */ }
    try {
      const r = await api("/api/inat/observations", { method: "POST", body: form, headers: { "X-iNat-Token": t.token } });
      TerraJournal.update(record.id, { inat: { id: r.id, url: r.url, posted: today() } });
      TerraScreens.toast(`Posted “${record.name}” to iNaturalist${r.photos ? ` with ${r.photos} photo${r.photos === 1 ? "" : "s"}` : ""}.`, { href: r.url, label: "Open" });
      return r;
    } catch (e) { TerraScreens.toast(`Not posted: ${e.message}`); return null; }
  }

  // ---------- rendering ----------
  const statusText = { queued: "Queued", working: "Agent working…", waiting: "Waiting for connection", ready: "Ready to review" };
  function render() {
    const s = activeSession();
    $("field-idle").hidden = Boolean(s); $("field-active").hidden = !s;
    if (s) $("field-meta").textContent = `${s.name} · started ${new Date(s.started).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${drafts.filter(d => d.sessionId === s.id).length} photo${drafts.filter(d => d.sessionId === s.id).length === 1 ? "" : "s"}`;
    const strip = $("field-strip"); strip.replaceChildren();
    for (const d of drafts.filter(x => s && x.sessionId === s.id)) {
      const li = el("li", `field-thumb ${d.status}`); li.dataset.draft = d.id;
      const img = el("img"); img.src = thumbUrl(d); img.alt = ""; li.append(img, el("span", "field-chip", statusText[d.status] ?? d.status));
      strip.append(li);
    }
    const ready = drafts.filter(d => d.status === "ready"), pending = drafts.filter(d => d.status !== "ready");
    $("inbox-count").textContent = drafts.length ? `${ready.length} ready${pending.length ? ` · ${pending.length} in progress` : ""}` : "";
    $("inbox-approve-all").hidden = ready.length < 2;
    // Keep your place if a re-render lands while you're typing (another photo finished, say).
    const a = document.activeElement, keep = a?.closest?.(".draft-card") ? { id: a.closest(".draft-card").dataset.draft, cls: a.className.split(" ")[0], start: a.selectionStart, end: a.selectionEnd, value: a.value } : null;
    const list = $("inbox-list"); list.replaceChildren();
    if (!drafts.length) list.append(el("p", "inbox-empty", "No drafts yet. Start a field session and add photos; the agent's drafts land here for you to approve, edit or delete."));
    for (const d of drafts) list.append(card(d));
    if (keep?.cls) {
      const t = list.querySelector(`.draft-card[data-draft="${CSS.escape(keep.id)}"] .${CSS.escape(keep.cls)}`);
      if (t) { if (typeof keep.value === "string" && "value" in t && t.tagName !== "SELECT") t.value = keep.value; t.focus(); try { if (keep.start != null) t.setSelectionRange(keep.start, keep.end); } catch { /* Not a text field. */ } }
    }
    const home = $("home-drafts");
    if (home) { home.hidden = !ready.length; home.textContent = `✦ ${ready.length} agent draft${ready.length === 1 ? "" : "s"} to review`; }
    renderToken();
  }
  // Dictation with the browser's speech recognition, where available (Chrome, Safari; needs HTTPS on
  // phones). Your phone keyboard's mic works everywhere too. Words are appended as you speak them.
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  let listening = null;
  function dictateButton(notes) {
    if (!Speech) return null;
    const b = el("button", "note-mic");
    b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'; b.type = "button"; b.setAttribute("aria-label", "Dictate notes"); b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      if (listening) { listening.stop(); return; }
      let rec;
      try { rec = new Speech(); } catch { b.hidden = true; return; }
      rec.lang = navigator.language || "en-US"; rec.interimResults = false; rec.continuous = true;
      rec.onresult = e => {
        for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) {
          const said = e.results[i][0].transcript.trim(); if (!said) continue;
          const v = notes.value; notes.value = `${v}${v && !/\s$/.test(v) ? " " : ""}${said}`.slice(0, 2000);
          notes.dispatchEvent(new Event("input"));
        }
      };
      const done = () => { listening = null; b.classList.remove("on"); b.setAttribute("aria-pressed", "false"); };
      rec.onend = done;
      rec.onerror = e => { done(); if (e.error === "not-allowed" || e.error === "service-not-allowed") TerraScreens.toast("Microphone not available here. Use your keyboard's mic instead."); };
      try { rec.start(); listening = rec; b.classList.add("on"); b.setAttribute("aria-pressed", "true"); } catch { done(); }
    });
    return b;
  }
  function card(d) {
    const c = el("article", `draft-card ${d.status}`); c.dataset.draft = d.id;
    const img = el("img", "draft-photo"); img.src = thumbUrl(d); img.alt = "Your photo";
    const body = el("div", "draft-body");
    const when = d.capturedAt ? new Date(d.capturedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
    const where = d.location ? `${d.location.lat.toFixed(3)}, ${d.location.lon.toFixed(3)} (${d.location.source === "photo" ? "from photo" : "from device"})` : "No location";
    body.append(el("p", "draft-meta", `${when} · ${where}`));
    if (d.status !== "ready") { body.append(el("p", "draft-state", d.error ? `${statusText[d.status]}: ${d.error}` : statusText[d.status])); c.append(img, body); return c; }
    // Guesses
    if (d.guesses.length) {
      const g = el("div", "draft-guesses"); g.setAttribute("role", "group"); g.setAttribute("aria-label", "Agent guesses");
      d.guesses.forEach((x, i) => {
        const b = el("button", `draft-guess${i === d.chosen ? " chosen" : ""}`, `${x.commonName || x.scientificName}${typeof x.score === "number" ? ` · ${pct(x.score)}` : ""}`);
        b.type = "button"; b.setAttribute("aria-pressed", String(i === d.chosen)); b.addEventListener("click", () => choose(d, i)); g.append(b);
      });
      body.append(g);
    }
    if (d.nearby?.common?.length && (!d.guesses.length || d.group !== "plant")) {
      const g = el("div", "draft-guesses"); g.append(el("small", "", "Common near here:"));
      for (const x of d.nearby.common.slice(0, 6)) { const b = el("button", "draft-guess", x.commonName || x.name); b.type = "button"; b.addEventListener("click", () => choose(d, null, x.name)); g.append(b); }
      body.append(g);
    }
    const row = el("div", "draft-fields");
    const name = el("input", "draft-name"); name.value = d.typedName ?? d.nameFromAgent ?? ""; name.addEventListener("input", () => { d.typedName = name.value; put("drafts", d).catch(() => {}); }); name.placeholder = "Name (or leave blank for Unknown)"; name.maxLength = 120; name.setAttribute("aria-label", "Name");
    const group = el("select", "draft-group"); group.setAttribute("aria-label", "Group");
    for (const [v, label] of Object.entries(GROUP_LABEL)) group.append(new Option(label, v, false, v === d.group));
    group.addEventListener("change", async () => { d.group = group.value; d.status = "queued"; d.species = null; d.nearby = null; await put("drafts", d); render(); run(); });
    const privacy = el("select", "draft-privacy"); privacy.setAttribute("aria-label", "Location privacy");
    for (const [v, label] of [["approximate", "Approximate location"], ["exact", "Exact location"], ["hidden", "Hide location"]]) privacy.append(new Option(label, v, false, v === (d.location ? (activeSession()?.privacy ?? "approximate") : "hidden")));
    if (!d.location) privacy.disabled = true;
    row.append(name, group, privacy);
    body.append(row);
    const write = el("details", "draft-writeup"); write.open = true;
    write.append(el("summary", "", "Agent write-up (stays in TERRA)"), el("p", "", d.writeUp?.summary ?? ""));
    body.append(write);
    // Your notes: the agent asks, you answer. Tap a question to add its line, then type or dictate.
    const notes = el("textarea", "draft-notes"); notes.rows = 3; notes.maxLength = 2000; notes.placeholder = "Your field notes, in your own words. Tap a question above to start."; notes.setAttribute("aria-label", "Your notes");
    notes.value = d.notes ?? "";
    const grow = () => { notes.style.height = "auto"; notes.style.height = `${Math.min(notes.scrollHeight + 2, 320)}px`; };
    notes.addEventListener("input", () => { d.notes = notes.value; grow(); put("drafts", d).catch(() => {}); });
    requestAnimationFrame(grow);
    const asks = el("div", "note-prompts"); asks.setAttribute("role", "group"); asks.setAttribute("aria-label", "Questions for your notes");
    asks.append(el("small", "note-prompts-label", "The agent asks:"));
    for (const p of notePrompts(d)) {
      const b = el("button", "note-prompt", p.ask); b.type = "button"; b.dataset.label = p.label;
      b.addEventListener("click", () => {
        const r = addPromptLine(notes.value, p.label);
        notes.value = r.text; notes.dispatchEvent(new Event("input")); notes.focus(); notes.setSelectionRange(r.cursor, r.cursor);
        b.classList.add("used");
      });
      if (notes.value.split("\n").some(l => l.startsWith(`${p.label}:`))) b.classList.add("used");
      asks.append(b);
    }
    const noteRow = el("div", "note-row"); noteRow.append(notes);
    const mic = dictateButton(notes); if (mic) noteRow.append(mic);
    body.append(asks, noteRow, el("p", "note-hint", "Only your words become notes. The write-up above stays in TERRA."));
    const actions = el("div", "draft-actions");
    const btn = (text, cls, fn) => { const b = el("button", cls, text); b.type = "button"; b.addEventListener("click", fn); actions.append(b); return b; };
    btn("Approve", "primary-button draft-approve", () => approve(d, c));
    const postBtn = btn("Approve & post to iNaturalist", "secondary-button draft-post", () => approve(d, c, { post: true }));
    postBtn.hidden = INAT_LIVE && !readToken();
    btn("Edit in full form", "secondary-button draft-edit", () => editInForm(d, c));
    btn("Delete", "text-button draft-delete", () => remove(d));
    body.append(actions, el("p", "draft-status", ""));
    body.lastChild.setAttribute("role", "status");
    c.append(img, body);
    return c;
  }
  function renderToken() {
    const panel = document.querySelector(".inat-connect"); if (panel) panel.hidden = !INAT_LIVE;
    const t = readToken();
    $("inat-state").textContent = t ? `Connected (token saved ${new Date(t.saved).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}; it expires after 24 hours).` : "Not connected. Posting to iNaturalist needs your personal API token.";
    $("inat-forget").hidden = !t;
  }

  // ---------- wiring ----------
  $("field-start").addEventListener("click", async () => {
    const session = { id: uid(), name: `Field session · ${new Date().toLocaleDateString([], { month: "short", day: "numeric" })}`, started: new Date().toISOString(), ended: null,
      group: $("field-group").value, privacy: $("field-privacy").value, useDevice: $("field-device").checked };
    try { await put("sessions", session); } catch { $("field-status").textContent = "Couldn't start a session: browser storage is blocked."; return; }
    await reload();
    $("field-status").textContent = "Session started. Add photos as you go; the agent drafts each one.";
  });
  $("field-end").addEventListener("click", async () => {
    const s = activeSession(); if (!s) return;
    await put("sessions", { ...s, ended: new Date().toISOString() });
    await reload();
    $("field-status").textContent = "Session ended. Your drafts are in the agent inbox below.";
  });
  $("field-photos").addEventListener("change", event => { addPhotos(event.target.files); event.target.value = ""; });
  $("field-group-active").addEventListener("change", async () => { const s = activeSession(); if (s) { await put("sessions", { ...s, group: $("field-group-active").value }); await reload(); } });
  $("inbox-approve-all").addEventListener("click", async () => {
    for (const d of drafts.filter(x => x.status === "ready")) { const c = document.querySelector(`.draft-card[data-draft="${d.id}"]`); if (c) await approve(d, c); }
  });
  $("inat-save").addEventListener("click", () => {
    const token = $("inat-token").value.trim();
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) { $("inat-state").textContent = "That doesn't look like an iNaturalist API token (it's a long code with two dots)."; return; }
    try { localStorage.setItem(INAT_KEY, JSON.stringify({ token, saved: Date.now() })); } catch { $("inat-state").textContent = "Couldn't save the token (storage blocked)."; return; }
    $("inat-token").value = ""; render();
  });
  $("inat-forget").addEventListener("click", () => { try { localStorage.removeItem(INAT_KEY); } catch { /* Nothing saved. */ } render(); });
  window.addEventListener("online", run);
  reload().then(run);
  return Object.freeze({ season, compose, toRecord, inatFields, tokenFresh, notePrompts, addPromptLine, postToInat, readToken, GROUP_LABEL, INAT_LIVE, reload, run });
})();
if (typeof module !== "undefined") module.exports = TerraField;
