"use strict";

// Legacy six-field records remain readable. Optional validated local-grid location
// and deletion timestamps are preserved in storage/backups. Photos are never saved.
const STORAGE_KEY = "terra.observations.v1";
// Keep legacy fungus/other keys readable in existing version-1 journals and backups.
const categories = { plant: "Plant", fungus: "Mushroom", insect: "Insect", mammal: "Mammal", bird: "Bird", fish: "Fish", reptile: "Reptile", other: "Other" };
const privacyLabels = { hidden: "Hidden", approximate: "Approximate", exact: "Exact" };
const form = document.querySelector("#observation-form");
const organismChoice = document.querySelector("#organism-choice");
function validateOrganism() {
  organismChoice.setCustomValidity(Object.values(categories).some(label => label.toLowerCase() === organismChoice.value.trim().toLowerCase()) ? "" : "Choose a listed organism group, or Other.");
}
organismChoice.addEventListener("input", validateOrganism);
form.addEventListener("reset", () => organismChoice.setCustomValidity(""));
const list = document.querySelector("#observation-list");
const status = document.querySelector("#status");
const storageError = document.querySelector("#storage-error");
const formError = document.querySelector("#form-error");
const saveButton = document.querySelector("#save-button");
const exportButton = document.querySelector("#export-button");
const photoInput = document.querySelector("#photo");
const preview = document.querySelector("#photo-preview");
const previewWrap = document.querySelector("#preview-wrap");
const photoError = document.querySelector("#photo-error");
const importFile = document.querySelector("#import-file");
const importPreview = document.querySelector("#import-preview");
const importSummary = document.querySelector("#import-summary");
const importRecords = document.querySelector("#import-records");
const importError = document.querySelector("#import-error");
const importStatus = document.querySelector("#import-status");
const confirmImport = document.querySelector("#confirm-import");
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
let pendingImport = null;
let importGeneration = 0;
// Transparent starter examples only, not verified identifications or a taxonomy database.
// Extend this list deliberately; no remote lookup, category filtering, or automatic selection.
const STARTER_SPECIES = Object.freeze(["Trichocereus bridgesii", "Trichoderma harzianum"]);
const nameInput = document.querySelector("#name");
const nameSuggestions = document.querySelector("#name-suggestions");
const nameStatus = document.querySelector("#name-status");
const dateInput = document.querySelector("#date");
const datePicker = document.querySelector("#date-picker");
let nameChoices = [];
let activeChoice = -1;
let observations = [];
let storageReady = false;
let previewUrl = null;
// Retry identity is in memory only; never persist workflow bookkeeping.
let pendingDiscovery = null;
const projectObservation = document.querySelector("#project-observation");
const discoveryProject = document.querySelector("#discovery-project");
const addProjectButton = document.querySelector("#add-project-button");

function refreshProjectAction() {
  const selectedRecord = projectObservation.value;
  const selectedProject = discoveryProject.value;
  projectObservation.replaceChildren(new Option("Current discovery draft (save once, then add)", ""));
  for (const r of TerraData.active(observations)) projectObservation.add(new Option(`${r.name} · ${r.date} · ID: ${r.id}`, r.id));
  projectObservation.value = observations.some(r => r.id === selectedRecord) ? selectedRecord : "";
  try {
    const projects = FieldSummary.parse(localStorage.getItem(FieldSummary.KEY));
    discoveryProject.replaceChildren(new Option("Choose a project", ""));
    for (const p of projects) {
      const option = new Option(`${p.title} (${p.complete ? "complete — reopen first" : FieldSummary.scope(p)})`, p.id);
      option.disabled = p.complete;
      discoveryProject.add(option);
    }
    discoveryProject.value = projects.some(p => p.id === selectedProject) ? selectedProject : "";
    addProjectButton.disabled = !storageReady || !projects.some(p => !p.complete);
    document.querySelector("#add-project-state").textContent = !projects.length ? "No projects yet. Create a local project below, then return here to add your discovery." : projects.every(p => p.complete) ? "All projects are complete. Reopen one below to add observations." : "Select a project and a draft or saved observation. Nothing leaves this browser.";
  } catch {
    addProjectButton.disabled = true;
    document.querySelector("#add-project-state").textContent = "Project data cannot be read. Add is paused; existing data is untouched. Do not clear browser storage.";
  }
}
function projectMembership(record, write = false) {
  const projects = FieldSummary.parse(localStorage.getItem(FieldSummary.KEY));
  const next = FieldSummary.addMember(projects, discoveryProject.value, record);
  if (write) {
    localStorage.setItem(FieldSummary.KEY, FieldSummary.encode(next));
    document.dispatchEvent(new Event("terra:project-membership-changed"));
  }
}
document.addEventListener("terra:projects-rendered", refreshProjectAction);

let discoveryImages = [];
const discoveryPreviews = document.querySelector("#discovery-previews");
const discoveryImageWrap = document.querySelector("#discovery-images");
const transferStatus = document.querySelector("#discovery-transfer-status");

function clearDiscoveryImages() {
  for (const image of discoveryImages) {
    image.img.onerror = null;
    image.img.removeAttribute("src");
    URL.revokeObjectURL(image.url);
  }
  discoveryImages = [];
  discoveryPreviews.replaceChildren();
  discoveryImageWrap.hidden = true;
}
document.querySelector("#discovery-clear-images").addEventListener("click", clearDiscoveryImages);
// Independent File-backed previews: never borrow URLs owned by Explore a photo.
// Resetting either area cannot revoke the other area's live previews.
document.addEventListener("terra:prefill-discovery", event => {
  const draft = event.detail;
  if (!draft || typeof draft.name !== "string" || !draft.name.trim() || draft.name.length > 120 ||
      !Object.hasOwn(categories, draft.type) || (draft.date && !TerraData.observationDate(draft.date)) ||
      !Array.isArray(draft.files) || !draft.files.length || draft.files.length > 6 ||
      draft.files.some(file => !(file instanceof File) || !file.type.startsWith("image/") || !file.size || file.size > 10 * 1024 * 1024)) return;
  clearPreview();
  // A confirmed transfer targets the new draft, not a previously selected saved record.
  projectObservation.value = "";
  pendingDiscovery = null;
  nameInput.value = draft.name.trim();
  closeSuggestions();
  nameStatus.textContent = "Unverified photo-review name. Review before saving.";
  document.querySelector("#organism-choice").value = categories[draft.type];
  dateInput.value = draft.date; // Missing dates stay blank; never invent an observation date.
  syncDate();
  TerraLocation.set("discovery", draft.location);
  TerraMaps.resetObservation(); // Never inherit a previous draft's precise location.
  for (const file of draft.files) {
    const card = element("li", "identify-photo");
    const img = element("img");
    const url = URL.createObjectURL(file);
    const image = { img, url };
    img.alt = `Temporary discovery preview: ${file.name}`;
    img.onerror = () => {
      img.onerror = null;
      img.removeAttribute("src");
      URL.revokeObjectURL(url);
      discoveryImages = discoveryImages.filter(item => item !== image);
      card.remove();
      discoveryImageWrap.hidden = !discoveryImages.length;
      showError(photoError, "A transferred preview could not be displayed. No image will be saved; choose a supported image to retry.");
    };
    discoveryImages.push(image);
    card.append(img, element("p", "identify-filename", file.name));
    discoveryPreviews.append(card);
    img.src = url;
  }
  discoveryImageWrap.hidden = false;
  transferStatus.textContent = "Draft prefilled only. Review name, date, group, temporary images/location, notes and privacy, then Save separately. Images and location detail are not saved or exported. Nothing sent to iNaturalist.";
  nameInput.focus();
});

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function speciesSuggestions(value) {
  const query = value.trim().toLowerCase();
  return query ? STARTER_SPECIES.filter(name => name.toLowerCase().includes(query)) : [];
}

function closeSuggestions() {
  nameSuggestions.hidden = true;
  nameInput.setAttribute("aria-expanded", "false");
  nameInput.removeAttribute("aria-activedescendant");
  activeChoice = -1;
  // Keep visible status on blur so pointer targets do not move mid-click.
}

function chooseName(index) {
  // The final choice explicitly keeps the current text, including custom names.
  if (index < nameChoices.length) nameInput.value = nameChoices[index];
  closeSuggestions();
  nameInput.focus();
}

function openSuggestions() {
  nameSuggestions.replaceChildren();
  closeSuggestions();
  nameStatus.textContent = "";
  if (!nameInput.value.trim()) return;
  nameChoices = speciesSuggestions(nameInput.value);
  const labels = [...nameChoices, `Keep “${nameInput.value.trim()}” as my manual name`];
  labels.forEach((label, index) => {
    const option = element("li", "", label);
    option.id = `name-option-${index}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    // Keep DOM focus in the combobox while pointing at an option.
    option.addEventListener("pointerdown", event => event.preventDefault());
    option.addEventListener("click", () => chooseName(index));
    nameSuggestions.append(option);
  });
  nameSuggestions.hidden = false;
  nameInput.setAttribute("aria-expanded", "true");
  nameStatus.textContent = nameChoices.length
    ? `${nameChoices.length} matching starter suggestions. You can also keep your manual name.`
    : "No matching starter species. You can keep your manual name.";
}

nameInput.addEventListener("input", openSuggestions);
nameInput.addEventListener("blur", closeSuggestions);
nameInput.addEventListener("keydown", event => {
  if (event.isComposing) return;
  if (event.key === "Escape") {
    if (!nameSuggestions.hidden) event.preventDefault();
    closeSuggestions();
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (nameSuggestions.hidden) openSuggestions();
    if (nameSuggestions.hidden) return;
    const count = nameSuggestions.children.length;
    activeChoice = event.key === "ArrowDown"
      ? (activeChoice + 1) % count
      : (activeChoice <= 0 ? count - 1 : activeChoice - 1);
    [...nameSuggestions.children].forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === activeChoice));
    });
    nameInput.setAttribute("aria-activedescendant", nameSuggestions.children[activeChoice].id);
  } else if (event.key === "Enter" && !nameSuggestions.hidden && activeChoice !== -1) {
    event.preventDefault();
    chooseName(activeChoice);
  } else if (event.key === "Tab") {
    closeSuggestions(); // Never force a suggestion on Tab or blur.
  }
});

function syncDate() {
  const valid = TerraData.observationDate(dateInput.value);
  datePicker.max = today();
  document.querySelector("#identify-date").max = today();
  dateInput.setCustomValidity(valid ? "" : "Enter a valid YYYY-MM-DD date, today or earlier.");
  dateInput.setAttribute("aria-invalid", String(!valid));
  datePicker.value = valid ? dateInput.value : "";
}
dateInput.addEventListener("input", syncDate);
datePicker.addEventListener("focus", syncDate);
document.querySelector("#identify-date").addEventListener("focus", event => { event.target.max = today(); });
function pickDate() {
  dateInput.value = datePicker.value;
  syncDate();
}
datePicker.addEventListener("input", pickDate);
datePicker.addEventListener("change", pickDate);
// The native input overlays only the icon inside the bar, not a second visible field.
// Pointer/touch use the native picker directly; provide explicit keyboard activation too.
datePicker.addEventListener("keydown", event => {
  if (["Enter", " ", "ArrowDown"].includes(event.key) && typeof datePicker.showPicker === "function") {
    event.preventDefault();
    datePicker.showPicker();
  }
});

function validObservation(item) {
  return item && typeof item === "object" && !Array.isArray(item) &&
    typeof item.id === "string" && item.id.trim().length > 0 &&
    typeof item.type === "string" && Object.hasOwn(categories, item.type) &&
    typeof item.privacy === "string" && Object.hasOwn(privacyLabels, item.privacy) &&
    typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 120 &&
    typeof item.notes === "string" && item.notes.length <= 3000 && validDate(item.date) && TerraData.optional(item);
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function readObservations() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  const saved = JSON.parse(raw);
  if (!Array.isArray(saved) || !saved.every(validObservation) || new Set(saved.map(item => item.id)).size !== saved.length) {
    throw new Error("Invalid saved journal");
  }
  // Explicitly pick fields, even if storage has been edited externally.
  return saved.map(TerraData.pick);
}

function load() {
  try {
    observations = readObservations();
    storageReady = true;
    showError(storageError, "");
  } catch {
    storageReady = false;
    showError(storageError, "Your saved journal could not be read. Browser storage may be blocked or the saved data may be damaged. Saving, deletion, and restore are paused to protect existing data. Do not clear browser data; check storage permissions and reload.");
  }
  saveButton.disabled = !storageReady;
  render();
}

function persist(next, errorElement = formError) {
  try {
    const retained = TerraData.retain(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(retained));
    observations = retained;
    showError(errorElement, "");
    return true;
  } catch {
    showError(errorElement, "This change could not be saved. Browser storage may be full or blocked. Your form and saved observations have been kept. Export a backup, check storage permissions, and try again.");
    return false;
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  document.dispatchEvent(new Event("terra:journal-rendered"));
  list.replaceChildren();
  const active = TerraData.active(observations);
  document.querySelector("#count").textContent = String(active.length);
  document.querySelector("#empty-state").hidden = active.length > 0 || !storageReady;
  renderTrash();
  exportButton.disabled = !storageReady || observations.length === 0;
  importFile.disabled = !storageReady;
  confirmImport.disabled = !storageReady || !pendingImport || pendingImport.additions.length === 0;
  for (const observation of [...active].sort((a, b) => b.date.localeCompare(a.date))) {
    const card = element("li", "observation-card");
    const meta = element("div", "card-meta");
    const date = element("time", "", new Date(`${observation.date}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }));
    date.dateTime = observation.date;
    meta.append(element("span", "category", categories[observation.type]), date);
    card.append(meta, element("h3", "", observation.name));
    card.append(element("p", "card-notes", observation.notes || "No field notes added."));
    // Version-1 records contain no identification evidence. A manual name or
    // fixed photo-demo selection must never imply AI, community or expert review.
    const provenance = element("details", "identification-history");
    provenance.append(element("summary", "", "Identification provenance"));
    provenance.append(element("p", "", "No identification history yet"));
    card.append(provenance);
    const bottom = element("div", "card-bottom");
    const remove = element("button", "text-button", "🗑 Delete");
    remove.type = "button";
    remove.disabled = !storageReady;
    remove.setAttribute("aria-label", `Delete observation: ${observation.name}`);
    remove.addEventListener("click", () => {
      if (!window.confirm(`Move “${observation.name}” to Trash? Restore it within 3 days. After that it is permanently removed on the next successful journal change.`)) return;
      // Read again so another tab's latest entries are not overwritten.
      load();
      if (!storageReady) return;
      if (persist(observations.map(item => item.id === observation.id && !item.deletedAt ? { ...item, deletedAt: new Date().toISOString() } : item))) {
        render();
        status.textContent = "Observation moved to Trash. Restore within 3 days using the trash bin below. Project references are retained but not counted while in Trash.";
        exportButton.disabled ? document.querySelector("#name").focus() : exportButton.focus();
      }
    });
    bottom.append(element("small", "", `Privacy: ${privacyLabels[observation.privacy]} · ${observation.location ? (observation.privacy === "hidden" ? "Location withheld" : observation.privacy === "approximate" ? "Coarse local region only" : "Local schematic pin") : "Legacy record: no location saved"}`), remove);
    card.append(bottom);
    list.append(card);
  }
  refreshProjectAction();
}

function renderTrash() {
  const trash = document.querySelector("#trash-list");
  trash.replaceChildren();
  for (const r of observations.filter(r => r.deletedAt)) {
    const expired = TerraData.expired(r);
    const row = element("li", "observation-card");
    const until = new Date(Date.parse(r.deletedAt) + TerraData.RETENTION).toLocaleString();
    row.append(element("p", "", `${r.name} · ${expired ? "Recovery expired; permanently removed on next successful journal change." : `Recover until ${until} (3 days after deletion).`}`));
    const restore = element("button", "secondary-button", "Restore observation");
    restore.type = "button"; restore.disabled = !storageReady || expired;
    restore.addEventListener("click", () => {
      load();
      const saved = observations.find(item => item.id === r.id);
      if (!storageReady || !saved?.deletedAt || TerraData.expired(saved)) {
        status.textContent = "Recovery is unavailable: the entry changed or its 3-day window expired."; return;
      }
      const next = observations.map(item => {
        if (item.id !== r.id) return item;
        const { deletedAt, ...record } = item; return record;
      });
      if (persist(next)) { render(); status.textContent = "Observation restored to journal. Project references reconnect only where the current scope still allows it."; }
    });
    row.append(restore); trash.append(row);
  }
  document.querySelector("#trash-count").textContent = String(observations.filter(r => r.deletedAt).length);
}

function clearPreview() {
  clearDiscoveryImages();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.removeAttribute("src");
  previewWrap.hidden = true;
  photoInput.value = "";
  showError(photoError, "");
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  clearPreview();
  if (!file) return;
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
    showError(photoError, "Choose an image file no larger than 10 MB. You can still save an observation without an image.");
    return;
  }
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  previewWrap.hidden = false;
});
preview.addEventListener("error", () => {
  clearPreview();
  showError(photoError, "This image could not be previewed. Try a JPEG, PNG, or another supported image.");
});
document.querySelector("#remove-photo").addEventListener("click", clearPreview);
window.addEventListener("pagehide", clearPreview);

function saveDiscovery(withProject = false) {
  showError(formError, "");
  const data = new FormData(form);
  const observation = {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: Object.keys(categories).find(key => categories[key].toLowerCase() === data.get("type").trim().toLowerCase()),
    name: data.get("name").trim() || "Unknown",
    notes: data.get("notes").trim(),
    date: data.get("date"),
    privacy: data.get("privacy")
  };
  const location = TerraMaps.observation.read();
  if (location) observation.location = location;
  if (!validObservation(observation) || !TerraData.observationDate(observation.date) || !location) {
    showError(formError, "Check the fields: date must be today or earlier, and a map location selection is required for the chosen privacy tier.");
    return;
  }
  // Check scope before creating a record, then recheck before writing membership.
  if (withProject) {
    try { projectMembership(observation); }
    catch (error) { showError(formError, `Nothing added. ${error.message}`); return; }
  }
  load();
  if (!storageReady) return;
  const fingerprintOf = ({ id, ...fields }) => JSON.stringify(fields);
  const fingerprint = fingerprintOf(observation);
  const previous = pendingDiscovery && observations.find(r => r.id === pendingDiscovery.id);
  if (previous && pendingDiscovery.fingerprint === fingerprint && fingerprintOf(previous) === fingerprint) {
    observation.id = previous.id;
  } else {
    if (!persist([observation, ...observations])) return;
    pendingDiscovery = { id: observation.id, fingerprint };
  }
  if (withProject) {
    try { projectMembership(observation, true); }
    catch (error) {
      render();
      showError(formError, `Observation saved in the local journal, but project add failed. Retry Add with this unchanged draft to reuse the same record, or select it from saved observations. ${error.message}`);
      return;
    }
  }
  pendingDiscovery = null;
  const targetProject = discoveryProject.value;
  form.reset();
  TerraLocation.sync("discovery");
  TerraMaps.resetObservation();
  discoveryProject.value = targetProject;
  dateInput.value = today();
  syncDate();
  closeSuggestions();
  nameStatus.textContent = "";
  clearPreview();
  transferStatus.textContent = "";
  render();
  projectObservation.value = observation.id;
  status.textContent = `Saved “${observation.name}” to the local journal in this browser.${withProject ? " Added to the selected TERRA project." : ""} Nothing was published to iNaturalist. Image previews are not saved.`;
  document.querySelector("#name").focus();
}
form.addEventListener("submit", event => { event.preventDefault(); saveDiscovery(); });
addProjectButton.addEventListener("click", () => {
  showError(formError, "");
  if (!projectObservation.value) {
    if (form.reportValidity()) saveDiscovery(true);
    return;
  }
  const id = projectObservation.value;
  load();
  if (!storageReady) return;
  const record = TerraData.active(observations).find(r => r.id === id);
  if (!record) { showError(formError, "That saved observation no longer exists. Choose another record or the current draft."); return; }
  try {
    projectMembership(record, true);
    status.textContent = `“${record.name}” is in the selected TERRA project. Existing journal record reused; no duplicates or uploads.`;
  } catch (error) { showError(formError, `Project add failed; journal unchanged. ${error.message}`); }
});

exportButton.addEventListener("click", () => {
  load();
  if (!storageReady || observations.length === 0) return;
  try {
    const exported = {
      format: "terra-observations", version: 1, exportedAt: new Date().toISOString(),
      notice: "Browser-only journal. May include versioned local schematic locations and 3-day Trash timestamps. No photos or real geographic coordinates. Keep private; do not downgrade to older builds that discard optional fields.",
      observations: TerraData.retain(observations)
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" }));
    const link = element("a");
    link.href = url;
    link.download = `terra-observations-${today()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "JSON export requested. Keep the downloaded file somewhere safe; exports can contain personal notes.";
  } catch {
    showError(storageError, "The export could not be created. Your saved observations have not changed. Please try again.");
  }
});

// Restore only the app's versioned export, never arbitrary arrays or partial files.
function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Choose an unchanged TERRA JSON export.");
  }
  if (!data || Array.isArray(data) || data.format !== "terra-observations" || data.version !== 1 ||
      typeof data.exportedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.exportedAt) ||
      !Number.isFinite(Date.parse(data.exportedAt)) || new Date(data.exportedAt).toISOString() !== data.exportedAt ||
      !Array.isArray(data.observations)) {
    throw new Error("This is not a supported TERRA version-1 export. Nothing was imported.");
  }
  // Validate even records that will be skipped as duplicates, before any write.
  const invalid = data.observations.findIndex(item => !validObservation(item) || !TerraData.observationDate(item.date));
  if (invalid !== -1) {
    throw new Error(`Observation ${invalid + 1} has invalid or missing fields (including a future date or location beyond its privacy tier). The whole file was rejected; nothing was imported.`);
  }
  return data.observations.map(TerraData.pick);
}

function resetImport() {
  importGeneration += 1; // Ignore reads from an older selection or a cancelled preview.
  pendingImport = null;
  importFile.value = "";
  importPreview.hidden = true;
  importRecords.replaceChildren();
  confirmImport.disabled = true;
}

function previewImport(records) {
  const seen = new Set(observations.map(item => item.id));
  const additions = [];
  records = TerraData.retain(records);
  const rows = records.map(record => {
    const duplicate = seen.has(record.id);
    seen.add(record.id);
    if (!duplicate) additions.push(record);
    return { record, duplicate };
  });
  pendingImport = { records, additions, snapshot: JSON.stringify(observations) };
  const summary = `${records.length} valid records: ${additions.length} to add; ${records.length - additions.length} duplicate IDs to skip. Existing observations will not be replaced.`;
  importSummary.textContent = summary;
  importStatus.textContent = `Preview ready. ${summary}`;
  importRecords.replaceChildren();
  // Bound preview DOM size even for large backups; all records are validated.
  for (const { record, duplicate } of rows.slice(0, 20)) {
    importRecords.append(element("li", "", `${duplicate ? "Skip duplicate" : "Add"}: ${record.name} · ${record.date} · ${categories[record.type]}`));
  }
  if (rows.length > 20) importRecords.append(element("li", "", `Showing the first 20 of ${rows.length} records.`));
  importPreview.hidden = false;
  confirmImport.disabled = !storageReady || additions.length === 0;
}

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  resetImport();
  showError(importError, "");
  importStatus.textContent = "";
  if (!file) return;
  const generation = importGeneration;
  try {
    if (!/\.json$/i.test(file.name) || !["", "application/json", "text/json", "application/octet-stream"].includes(file.type)) {
      throw new Error("Choose a .json file exported by TERRA.");
    }
    if (file.size === 0 || file.size > MAX_IMPORT_BYTES) {
      throw new Error("Choose a non-empty JSON file no larger than 5 MB. Nothing was imported.");
    }
    let text;
    try {
      text = await file.text();
    } catch {
      throw new Error("This file could not be read. Select the original backup and try again.");
    }
    if (generation !== importGeneration) return;
    const records = parseImport(text);
    load();
    if (!storageReady) throw new Error("Restore is paused because the current journal cannot be read. Existing browser data has not been changed. Check storage permissions and reload; do not clear site data.");
    previewImport(records);
  } catch (error) {
    if (generation !== importGeneration) return;
    showError(importError, error.message);
  }
});

document.querySelector("#cancel-import").addEventListener("click", () => {
  resetImport();
  showError(importError, "");
  importStatus.textContent = "Restore cancelled. No observations were imported.";
  importFile.focus();
});

confirmImport.addEventListener("click", () => {
  if (!pendingImport) return;
  showError(importError, "");
  // Re-read immediately before merging; never overwrite records added since preview.
  load();
  if (!storageReady) {
    showError(importError, "Restore paused: the current journal cannot be read. Nothing was imported. Do not clear browser data.");
    return;
  }
  if (JSON.stringify(observations) !== pendingImport.snapshot) {
    previewImport(pendingImport.records);
    importStatus.textContent = `Your journal changed. Review the updated preview and confirm again. ${importSummary.textContent}`;
    return;
  }
  const { additions, records } = pendingImport;
  if (additions.length === 0) return;
  if (!persist([...additions, ...observations], importError)) {
    importStatus.textContent = "Restore was not saved. Your previous observations and this preview are unchanged; you can retry.";
    return;
  }
  resetImport();
  render();
  importStatus.textContent = `Restore complete: added ${additions.length} observations; skipped ${records.length - additions.length} duplicate IDs. Existing observations were not replaced.`;
  importFile.focus();
});

window.addEventListener("storage", event => {
  if (event.key === STORAGE_KEY || event.key === null) {
    load();
    status.textContent = "Journal updated from another tab.";
  }
});
const geneticQuery = document.querySelector("#genetic-query");
const geneticSequence = document.querySelector("#genetic-sequence");
const geneticPreview = document.querySelector("#genetic-preview");
const geneticError = document.querySelector("#genetic-error");
function clearGeneticInputs() {
  geneticQuery.value = "";
  geneticSequence.value = "";
  geneticPreview.textContent = "";
  showError(geneticError, "");
}
for (const service of ["bold", "genbank"]) {
  document.querySelector(`#${service}-preview`).addEventListener("click", () => {
    geneticPreview.textContent = "";
    showError(geneticError, "");
    try {
      const query = geneticQuery.value.trim();
      const dna = geneticSequence.value.trim() ? validateLocalDNA(geneticSequence.value) : null;
      if (!query && !dna) throw new Error("Enter a taxon/record identifier or a temporary DNA sequence to preview a lookup plan.");
      if (query.length > 120) throw new Error("Use at most 120 characters for a taxon/record identifier.");
      const source = service === "bold" ? "BOLD" : "GenBank";
      geneticPreview.textContent = `${source} — UNCONNECTED local plan only. ${query ? `Search text: ${query}. ` : ""}${dna ? `DNA syntax valid: ${dna.length} bases, ${dna.ambiguous} ambiguous bases. ` : ""}${service === "bold" ? "Future barcode identification/record search needs a supported marker and reviewed service terms." : "Future record search/sequence comparison needs a separately designed search workflow; this is NOT GenBank submission."} No search ran, no matches or identification inferred, nothing sent or saved.`;
    } catch (error) { showError(geneticError, error.message); }
  });
}
for (const input of [geneticQuery, geneticSequence]) input.addEventListener("input", () => {
  geneticPreview.textContent = "";
  showError(geneticError, "");
});
document.querySelector("#genetic-clear").addEventListener("click", clearGeneticInputs);
window.addEventListener("pagehide", clearGeneticInputs);
window.addEventListener("pageshow", clearGeneticInputs);

dateInput.value = today();
syncDate();
load();
