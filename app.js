"use strict";

// Only these text fields are saved. Photos and coordinates never enter storage.
const STORAGE_KEY = "terra.observations.v1";
const categories = { plant: "Plant", fungus: "Fungus", other: "Other" };
const privacyLabels = { hidden: "Hidden", approximate: "Approximate", exact: "Exact" };
const form = document.querySelector("#observation-form");
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
let observations = [];
let storageReady = false;
let previewUrl = null;

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validObservation(item) {
  return item && typeof item === "object" && !Array.isArray(item) &&
    typeof item.id === "string" && item.id.trim().length > 0 &&
    typeof item.type === "string" && Object.hasOwn(categories, item.type) &&
    typeof item.privacy === "string" && Object.hasOwn(privacyLabels, item.privacy) &&
    typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 120 &&
    typeof item.notes === "string" && item.notes.length <= 3000 && validDate(item.date);
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
  return saved.map(({ id, type, name, notes, date, privacy }) => ({ id, type, name, notes, date, privacy }));
}

function load() {
  try {
    observations = readObservations();
    storageReady = true;
    showError(storageError, "");
  } catch {
    storageReady = false;
    showError(storageError, "Your saved journal could not be read. Browser storage may be blocked or the saved data may be damaged. Saving and deletion are paused to protect existing data. Do not clear browser data; check storage permissions and reload.");
  }
  saveButton.disabled = !storageReady;
  render();
}

function persist(next, errorElement = formError) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    observations = next;
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
  list.replaceChildren();
  document.querySelector("#count").textContent = String(observations.length);
  document.querySelector("#empty-state").hidden = observations.length > 0 || !storageReady;
  exportButton.disabled = !storageReady || observations.length === 0;
  importFile.disabled = !storageReady;
  confirmImport.disabled = !storageReady || !pendingImport || pendingImport.additions.length === 0;
  for (const observation of [...observations].sort((a, b) => b.date.localeCompare(a.date))) {
    const card = element("li", "observation-card");
    const meta = element("div", "card-meta");
    const date = element("time", "", new Date(`${observation.date}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }));
    date.dateTime = observation.date;
    meta.append(element("span", "category", categories[observation.type]), date);
    card.append(meta, element("h3", "", observation.name));
    card.append(element("p", "card-notes", observation.notes || "No field notes added."));
    const bottom = element("div", "card-bottom");
    const remove = element("button", "text-button", "Delete");
    remove.type = "button";
    remove.disabled = !storageReady;
    remove.setAttribute("aria-label", `Delete observation: ${observation.name}`);
    remove.addEventListener("click", () => {
      if (!window.confirm(`Delete “${observation.name}”? This cannot be undone.`)) return;
      // Read again so another tab's latest entries are not overwritten.
      load();
      if (!storageReady) return;
      if (persist(observations.filter(item => item.id !== observation.id))) {
        render();
        status.textContent = "Observation deleted.";
        exportButton.disabled ? document.querySelector("#name").focus() : exportButton.focus();
      }
    });
    bottom.append(element("small", "", `Privacy preference: ${privacyLabels[observation.privacy]} · No location saved`), remove);
    card.append(bottom);
    list.append(card);
  }
}

function clearPreview() {
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

form.addEventListener("submit", event => {
  event.preventDefault();
  showError(formError, "");
  const data = new FormData(form);
  const observation = {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: data.get("type"),
    name: data.get("name").trim() || "Unknown",
    notes: data.get("notes").trim(),
    date: data.get("date"),
    privacy: data.get("privacy")
  };
  if (!validObservation(observation)) {
    showError(formError, "Check the observation fields and enter a valid date (year 0001–9999).");
    return;
  }
  load();
  if (!storageReady || !persist([observation, ...observations])) return;
  form.reset();
  document.querySelector("#date").value = today();
  clearPreview();
  render();
  status.textContent = `Saved “${observation.name}” in this browser. Image previews are not saved.`;
  document.querySelector("#name").focus();
});

exportButton.addEventListener("click", () => {
  load();
  if (!storageReady || observations.length === 0) return;
  try {
    const exported = {
      format: "terra-observations", version: 1, exportedAt: new Date().toISOString(),
      notice: "Browser-only journal. Images and coordinates are not saved. Privacy is a preference only.",
      observations
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
      typeof data.exportedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(data.exportedAt) ||
      !Number.isFinite(Date.parse(data.exportedAt)) || !Array.isArray(data.observations)) {
    throw new Error("This is not a supported TERRA version-1 export. Nothing was imported.");
  }
  // Validate even records that will be skipped as duplicates, before any write.
  const invalid = data.observations.findIndex(item => !validObservation(item));
  if (invalid !== -1) {
    throw new Error(`Observation ${invalid + 1} has invalid or missing fields. The whole file was rejected; nothing was imported.`);
  }
  return data.observations.map(({ id, type, name, notes, date, privacy }) => ({ id, type, name, notes, date, privacy }));
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
document.querySelector("#date").value = today();
load();
