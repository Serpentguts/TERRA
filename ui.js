"use strict";

// Shared ephemeral controls. No storage, coordinates, metadata, or network access.
const TerraLocation = (() => {
  const keys = ["context", "setting", "region", "precision", "country", "state", "city"];
  const control = (prefix, key) => document.getElementById(`${prefix}-${key}`);
  function sync(prefix) {
    const context = control(prefix, "context").value;
    const active = Boolean(context);
    const setting = context === "cultivated";
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
    control(prefix, "setting-label").textContent = "Garden / cultivation details (optional, temporary)";
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
        <div id="${prefix}-setting-field" class="field" hidden><label id="${prefix}-setting-label" for="${prefix}-setting">Garden / cultivation details (optional, temporary)</label><input id="${prefix}-setting" maxlength="120" autocomplete="off"></div>
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
  const bottomNav = document.getElementById("bottom-navigation");
  // Reserve the actual bar height, including wrapped labels, zoom and safe area.
  const reserveNavigationSpace = () => document.documentElement.style.setProperty("--bottom-nav-height", `${bottomNav.getBoundingClientRect().height}px`);
  new ResizeObserver(reserveNavigationSpace).observe(bottomNav);
  reserveNavigationSpace();
  const views = [
    ["home", "Home"], ["map", "Map"], ["profile", "Profile"], ["feed", "Feed"],
    ["identify-title", "Explore a photo"], ["form-title", "Record a discovery"],
    ["saved-title", "Your observations"], ["projects-title", "Projects / Field Summary"],
    ["genetic-title", "Genetic Data"]
  ].map(([id, label]) => ({ id, label, section: document.getElementById(id).closest("section") }));
  const aliases = { projects: "projects-title", "genetic-data": "genetic-title", discover: "home" };
  const destinationFor = id => ({ "form-title": "identify-title", "saved-title": "projects-title" }[id] || id);
  const stackStatus = document.getElementById("view-stack-status");
  function markCurrent(id) {
    for (const link of bottomNav.querySelectorAll("a")) {
      if (link.hash === `#${destinationFor(id)}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  function selectArea(id, grouped = false) {
    id = aliases[id] || id;
    const view = views.find(view => view.id === id);
    if (!view) return;
    const reveal = view => {
      view.section.hidden = false;
      view.section.classList.remove("minimized");
      view.section.querySelector(".minimize-view").setAttribute("aria-expanded", "true");
    };
    reveal(view);
    // Persistent destinations restore both related sections, including minimized drafts.
    if (grouped && id === "identify-title") reveal(views.find(view => view.id === "form-title"));
    if (grouped && id === "projects-title") reveal(views.find(view => view.id === "saved-title"));
    updateWorkspace();
    markCurrent(id);
  }
  for (const view of views) {
    if (!view.section.id) view.section.id = `${view.id}-view`;
    const controls = document.createElement("div");
    controls.className = "view-controls";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "secondary-button close-view";
    close.textContent = "Close view";
    close.setAttribute("aria-label", `Close ${view.label} view`);
    close.setAttribute("aria-controls", view.section.id);
    close.setAttribute("aria-describedby", "view-stack-help");
    close.addEventListener("click", () => {
      // Visibility only: do not reset forms, remove nodes, revoke images or write storage.
      view.section.hidden = true;
      updateWorkspace();
      // Clear the closed location without a hashchange that could reopen it.
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      markCurrent("");
      stackStatus.textContent = `${view.label} view closed. No data deleted. Reopen from the menu or bottom navigation.`;
      const reopen = bottomNav.querySelector(`a[href="#${destinationFor(view.id)}"]`) || toggle;
      reopen.focus();
    });
    const minimize = document.createElement("button");
    minimize.type = "button";
    minimize.className = "secondary-button minimize-view";
    minimize.textContent = "Minimize / expand";
    minimize.setAttribute("aria-label", `Minimize or expand ${view.label} view`);
    minimize.setAttribute("aria-expanded", "true");
    minimize.setAttribute("aria-controls", view.section.id);
    minimize.addEventListener("click", () => {
      const minimized = view.section.classList.toggle("minimized");
      minimize.setAttribute("aria-expanded", String(!minimized));
      updateWorkspace();
    });
    controls.append(minimize, close);
    view.section.prepend(controls);
  }
  function updateWorkspace() {
    const list = document.getElementById("workspace-views");
    list.replaceChildren();
    for (const view of views) {
      const item = document.createElement("li");
      const open = document.createElement("a");
      open.href = `#${view.id}`;
      open.textContent = `${view.label} · ${view.section.hidden ? "closed" : view.section.classList.contains("minimized") ? "minimized" : "open"}`;
      item.append(open);
      list.append(item);
    }
  }
  updateWorkspace();
  document.getElementById("workspace-close").addEventListener("click", () => {
    document.getElementById("workspace").hidden = true;
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    markCurrent("");
    bottomNav.querySelector('a[href="#workspace"]').focus();
  });
  function closeNavigation() {
    nav.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
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
  function followLink(event) {
    const link = event.target.closest("a");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const id = link.hash.slice(1);
    if (id === "workspace") { document.getElementById("workspace").hidden = false; updateWorkspace(); markCurrent("workspace"); }
    const target = document.getElementById(id);
    if (!target) return;
    selectArea(id, bottomNav.contains(link));
    target.tabIndex = -1;
    target.focus();
    closeNavigation();
  }
  // Include in-content project links, including repeated links to a closed view.
  document.addEventListener("click", followLink);
  function followHash() {
    const id = window.location.hash.slice(1);
    if (id === "workspace") document.getElementById("workspace").hidden = false;
    selectArea(id);
  }
  window.addEventListener("hashchange", followHash);
  // A confirmed photo handoff must also reveal a previously closed draft.
  document.addEventListener("terra:prefill-discovery", () => selectArea("form-title"));
  followHash();

  // Fictional observations are deliberately separate from the private journal.
  const samples = [
    { category: "fungus", icon: "🍄", type: "Mushroom", name: "Woodland mushroom", setting: "natural", note: "A cap among fallen leaves." },
    { category: "plant", icon: "🌿", type: "Plant", name: "Garden seedling", setting: "cultivated", note: "New leaves in an imaginary garden bed." },
    { category: "bird", icon: "🐦", type: "Bird", name: "Woodland bird", setting: "natural", note: "A small bird resting on a branch." },
    { category: "reptile", icon: "🐍", type: "Snake / reptile", name: "Grass snake", setting: "natural", note: "Observed from a safe distance in a fictional meadow." },
    { category: "mammal", icon: "🐁", type: "Mouse / mammal", name: "Field mouse", setting: "natural", note: "A brief glimpse near a fictional hedgerow." },
    { category: "insect", icon: "🐞", type: "Bug / insect", name: "Garden ladybird", setting: "cultivated", note: "A bug on a cultivated plant." }
  ];
  function card(sample, sale = false) {
    const li = document.createElement("li");
    li.className = `demo-card ${sale ? "sale" : sample.setting}`;
    li.dataset.purpose = sale ? "sale" : sample.setting;
    li.dataset.category = sample.category;
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
  for (const sample of samples) document.getElementById("demo-map").append(card(sample));
  document.getElementById("demo-listings").append(card({ category: "plant", icon: "🌿", type: "Plant", name: "Seed packet example", note: "Fictional seeds listing. Not available to buy; no transaction or posting." }, true));
  const purpose = document.getElementById("map-purpose");
  const organism = document.getElementById("map-organism");
  function filterMap() {
    const values = select => [...select.selectedOptions].some(option => option.value === "all") ? [] : [...select.selectedOptions].map(option => option.value);
    const purposes = values(purpose), organisms = values(organism);
    document.getElementById("map-selected").textContent = `Selected colors: ${purposes.join(", ") || "all"} · organisms: ${organisms.join(", ") || "all"}`;
    let observations = 0, listings = 0;
    for (const marker of document.querySelectorAll("#map .demo-card")) {
      marker.hidden = (purposes.length > 0 && !purposes.includes(marker.dataset.purpose))
        || (organisms.length > 0 && !organisms.includes(marker.dataset.category));
      if (!marker.hidden) {
        if (marker.dataset.purpose === "sale") listings++;
        else observations++;
      }
    }
    document.getElementById("map-results").textContent = `${observations} observation markers and ${listings} for-sale listings shown · fictional results only.`;
    document.getElementById("map-empty").hidden = observations + listings > 0;
  }
  purpose.addEventListener("change", filterMap);
  organism.addEventListener("change", filterMap);
  document.getElementById("map-reset").addEventListener("click", () => {
    purpose.value = organism.value = "all";
    filterMap();
  });
  filterMap();

})();
