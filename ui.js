"use strict";

// Shared ephemeral controls. No storage, coordinates, metadata, or network access.
const TerraLocation = (() => {
  const keys = ["context", "setting", "region", "precision", "country", "state", "city"];
  const control = (prefix, key) => document.getElementById(`${prefix}-${key}`);
  function sync(prefix) {
    const context = control(prefix, "context").value;
    const active = Boolean(context);
    const setting = context === "natural" || context === "cultivated";
    function reveal(id, visible) {
      const section = document.getElementById(`${prefix}-${id}`);
      section.hidden = !visible;
      section.querySelectorAll("input, select").forEach(input => {
        input.disabled = !visible;
        if (!visible) input.value = "";
      });
    }
    reveal("context-fields", active);
    reveal("setting-field", setting);
    control(prefix, "setting-label").textContent = context === "cultivated"
      ? "Garden / cultivation details (optional, temporary)" : "Habitat / natural setting (optional, temporary)";
    const region = control(prefix, "region").value;
    reveal("location-detail", active && Boolean(region));
    const precision = control(prefix, "precision").value;
    reveal("manual-location", active && Boolean(region) && Boolean(precision));
    reveal("city-field", active && Boolean(region) && precision === "city");
  }
  function read(prefix) {
    sync(prefix); // Sanitize hidden values even before a confirmed handoff.
    return Object.fromEntries(keys.map(key => [key, control(prefix, key).value.trim()]));
  }
  function set(prefix, location = {}) {
    for (const key of keys) control(prefix, key).value = typeof location[key] === "string" ? location[key] : "";
    sync(prefix);
  }
  for (const fieldset of document.querySelectorAll("[data-location]")) {
    const prefix = fieldset.dataset.location;
    // This template contains only fixed app-owned markup; user text is assigned via value.
    fieldset.insertAdjacentHTML("beforeend", `
      <p id="${prefix}-location-help"><small>Optional, temporary review only. Nothing here is saved or exported, even with Exact privacy selected. No GPS, photo metadata, geocoding, or lookup. Avoid addresses and sensitive sites. Context does not affect mock suggestions.</small></p>
      <div class="field"><label for="${prefix}-context">Location context</label>
        <select id="${prefix}-context" aria-controls="${prefix}-context-fields" aria-describedby="${prefix}-location-help">
          <option value="">Prefer not to say · no location context</option>
          <option value="natural">Natural / wild location</option>
          <option value="cultivated">Cultivated / garden</option>
          <option value="broad">Broad region / locality only · setting unspecified</option>
        </select>
      </div>
      <div id="${prefix}-context-fields" hidden>
        <div id="${prefix}-setting-field" class="field" hidden><label id="${prefix}-setting-label" for="${prefix}-setting">Habitat / natural setting (optional, temporary)</label><input id="${prefix}-setting" maxlength="120" autocomplete="off"></div>
        <div class="field"><label for="${prefix}-region">Broad region (optional, temporary)</label><select id="${prefix}-region"><option value="">Prefer not to say</option><option>Africa</option><option>Antarctica</option><option>Asia</option><option>Europe</option><option>North America</option><option>Oceania</option><option>South America</option></select></div>
        <fieldset id="${prefix}-location-detail" hidden><legend>Optional manual locality · no lookup</legend>
          <div class="field"><label for="${prefix}-precision">Location precision</label><select id="${prefix}-precision"><option value="">Broad region only · no finer detail</option><option value="state">Enter state / province manually</option><option value="city">Enter city / locality manually</option></select></div>
          <div id="${prefix}-manual-location" hidden>
            <div class="field"><label for="${prefix}-country">Country / territory (optional, temporary)</label><input id="${prefix}-country" maxlength="120" autocomplete="off"></div>
            <div class="field"><label for="${prefix}-state">State / province (optional, temporary)</label><input id="${prefix}-state" maxlength="120" autocomplete="off"></div>
            <div id="${prefix}-city-field" class="field" hidden><label for="${prefix}-city">City / locality (optional, temporary)</label><input id="${prefix}-city" maxlength="120" autocomplete="off"></div>
          </div>
        </fieldset>
      </div>`);
    fieldset.addEventListener("input", event => {
      if (event.target === control(prefix, "context")) {
        // A different setting starts fresh; never silently reuse the last location.
        for (const key of keys.slice(1)) control(prefix, key).value = "";
      }
      if (event.target === control(prefix, "region")) control(prefix, "precision").value = "";
      sync(prefix);
      fieldset.dispatchEvent(new Event("terra:location-changed"));
    });
    sync(prefix);
  }
  window.addEventListener("pagehide", () => {
    for (const prefix of ["identify", "discovery"]) set(prefix);
  });
  return Object.freeze({ sync, read, set });
})();

(() => {
  const toggle = document.getElementById("navigation-toggle");
  const nav = document.getElementById("site-navigation");
  const tabs = [...document.querySelectorAll(".discovery-tabs [role=tab]")];
  function closeNavigation() {
    nav.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }
  function selectTab(id, focus = false) {
    for (const tab of tabs) {
      const selected = tab.getAttribute("aria-controls") === id;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
      if (selected && focus) tab.focus();
    }
  }
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => selectTab(tab.getAttribute("aria-controls")));
    tab.addEventListener("keydown", event => {
      let next;
      if (["ArrowRight", "ArrowLeft"].includes(event.key)) next = (index + 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next].getAttribute("aria-controls"), true);
    });
  }
  toggle.addEventListener("click", () => {
    const open = nav.hidden;
    nav.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !nav.hidden) {
      closeNavigation();
      toggle.focus();
    }
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".site-navigation")) closeNavigation();
  });
  document.querySelector(".site-navigation").addEventListener("focusout", event => {
    if (!event.currentTarget.contains(event.relatedTarget)) closeNavigation();
  });
  nav.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (!link) return;
    const id = link.hash.slice(1);
    if (["feed", "map"].includes(id)) selectTab(id);
    const target = document.getElementById(id);
    if (target.getAttribute("role") !== "tabpanel") target.tabIndex = -1;
    target.focus();
    closeNavigation();
  });
  function followHash() {
    const id = window.location.hash.slice(1);
    if (["feed", "map"].includes(id)) selectTab(id);
  }
  window.addEventListener("hashchange", followHash);
  followHash();

  // Fictional observations are deliberately separate from the private journal.
  const samples = [
    { icon: "🍄", type: "Mushroom", name: "Woodland mushroom", setting: "natural", note: "A cap among fallen leaves." },
    { icon: "🌿", type: "Plant", name: "Garden seedling", setting: "cultivated", note: "New leaves in an imaginary garden bed." },
    { icon: "🐦", type: "Bird", name: "Woodland bird", setting: "natural", note: "A small bird resting on a branch." },
    { icon: "🐍", type: "Snake / reptile", name: "Grass snake", setting: "natural", note: "Observed from a safe distance in a fictional meadow." },
    { icon: "🐁", type: "Mouse / mammal", name: "Field mouse", setting: "natural", note: "A brief glimpse near a fictional hedgerow." },
    { icon: "🐞", type: "Bug / insect", name: "Garden ladybird", setting: "cultivated", note: "A bug on a cultivated plant." }
  ];
  function card(sample, sale = false) {
    const li = document.createElement("li");
    li.className = `demo-card ${sale ? "sale" : sample.setting}`;
    const icon = document.createElement("span");
    icon.className = "organism-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = sample.icon;
    const title = document.createElement("h4");
    title.textContent = `${sample.type} · ${sample.name}`;
    const purpose = document.createElement("p");
    purpose.className = "demo-purpose";
    purpose.textContent = sale ? "DEMO FOR-SALE LISTING · NOT AN OBSERVATION" : `DEMO OBSERVATION · ${sample.setting === "natural" ? "Natural / wild setting" : "Cultivated / garden setting"}`;
    const note = document.createElement("p");
    note.textContent = sample.note;
    li.append(icon, title, purpose, note);
    return li;
  }
  for (const sample of samples) {
    document.getElementById("demo-feed").append(card(sample));
    document.getElementById("demo-map").append(card(sample));
  }
  document.getElementById("demo-listings").append(card({ icon: "🌿", type: "Plant", name: "Seed packet example", note: "Fictional seeds listing. Not available to buy; no transaction or posting." }, true));
})();
