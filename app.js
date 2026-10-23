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
  const prefix = value.trim().toLowerCase();
  return prefix ? STARTER_SPECIES.filter(name => name.toLowerCase().startsWith(prefix)) : [];
}

function closeSuggestions() {
  nameSuggestions.hidden = true;
  nameInput.setAttribute("aria-expanded", "false");
  nameInput.removeAttribute("aria-activedescendant");
  activeChoice = -1;
  nameStatus.textContent = "";
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
  if (!nameInput.value.trim()) return;
  nameChoices = speciesSuggestions(nameInput.value);
  const labels = [...nameChoices, `Keep “${nameInput.value.trim()}” as my manual name`];
  labels.forEach((label, index) => {
    const option = element("li", "", label);
    option.id = `name-option-${index}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    // Keep DOM focus in the combobox while pointing at an option.
    option.addEventListener("mousedown", event => event.preventDefault());
    option.addEventListener("click", () => chooseName(index));
    nameSuggestions.append(option);
  });
  nameSuggestions.hidden = false;
  nameInput.setAttribute("aria-expanded", "true");
  nameStatus.textContent = `${nameChoices.length} starter suggestions. Keep your manual name is also available.`;
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
    activeChoice = (activeChoice + (event.key === "ArrowDown" ? 1 : activeChoice === -1 ? 0 : -1) + count) % count;
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
  const valid = validDate(dateInput.value);
  dateInput.setCustomValidity(valid ? "" : "Enter a valid date as YYYY-MM-DD (year 0001–9999).");
  dateInput.setAttribute("aria-invalid", String(!valid));
  datePicker.value = valid ? dateInput.value : "";
}
dateInput.addEventListener("input", syncDate);
datePicker.addEventListener("change", () => {
  dateInput.value = datePicker.value;
  syncDate();
});

function validObservation(item) {
  return item && typeof item === "object" && typeof item.id === "string" && item.id.length > 0 &&
    Object.hasOwn(categories, item.type) && Object.hasOwn(privacyLabels, item.privacy) &&
    typeof item.name === "string" && item.name.length > 0 && item.name.length <= 120 &&
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

function persist(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    observations = next;
    showError(formError, "");
    return true;
  } catch {
    showError(formError, "This change could not be saved. Browser storage may be full or blocked. Your form and saved observations have been kept. Export a backup, check storage permissions, and try again.");
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
  dateInput.value = today();
  syncDate();
  closeSuggestions();
  clearPreview();
  render();
  status.textContent = `Saved “${observation.name}” to the local journal in this browser. Nothing was published to iNaturalist. Image previews are not saved.`;
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

window.addEventListener("storage", event => {
  if (event.key === STORAGE_KEY || event.key === null) {
    load();
    status.textContent = "Journal updated from another tab.";
  }
});
dateInput.value = today();
syncDate();
load();
