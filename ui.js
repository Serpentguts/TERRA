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

// One screen at a time. Screens are groups of [data-screen] elements; the URL hash picks
// the screen, so links, deep links, reloads and the browser's back button all work.
// Switching screens only hides content: drafts, previews and saved data are untouched.
const TerraScreens = (() => {
  const toggle = document.getElementById("navigation-toggle");
  const nav = document.getElementById("site-navigation");
  const bottomNav = document.getElementById("bottom-navigation");
  const bar = document.getElementById("screen-bar");
  const back = document.getElementById("screen-back");
  const announcer = document.getElementById("view-stack-status");
  // Reserve the actual bar height, including wrapped labels, zoom and safe area.
  const reserveNavigationSpace = () => document.documentElement.style.setProperty("--bottom-nav-height", `${bottomNav.getBoundingClientRect().height}px`);
  new ResizeObserver(reserveNavigationSpace).observe(bottomNav);
  reserveNavigationSpace();

  // name: [title, bottom tab, parent screen for the back link]
  const SCREENS = {
    home: ["Home", "home", null],
    journal: ["Journal", "journal", "home"],
    projects: ["Projects", "journal", "journal"],
    record: ["Record a discovery", "record", "home"],
    photo: ["Explore a photo", "record", "record"],
    map: ["Map", "map", "home"],
    profile: ["Profile", "profile", "home"],
    feed: ["Feed", null, "home"],
    genetics: ["Genetic data", null, "home"]
  };
  // Short names and older links (e.g. #form-title) keep working.
  const ALIASES = { terrarium: "profile", discover: "home", workspace: "home", "genetic-data": "genetics" };
  const parts = [...document.querySelectorAll("[data-screen]")];
  document.documentElement.classList.add("screens");
  let current = null;
  const trail = []; // In-app history, so the back link can mirror the browser's back button.

  function resolve(hash) {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    if (!id) return { screen: "home" };
    if (Object.hasOwn(SCREENS, id)) return { screen: id };
    if (Object.hasOwn(ALIASES, id)) return { screen: ALIASES[id], alias: id };
    const target = document.getElementById(id);
    const screen = target?.closest("[data-screen]")?.dataset.screen;
    return screen ? { screen, target } : null;
  }
  function show(screen) {
    if (!Object.hasOwn(SCREENS, screen)) return false;
    const changed = screen !== current;
    current = screen;
    for (const part of parts) part.hidden = part.dataset.screen !== screen;
    const [title, tab, parent] = SCREENS[screen];
    for (const link of bottomNav.querySelectorAll("a")) {
      if (link.hash === `#${tab}`) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    for (const link of nav.querySelectorAll("a")) {
      if (link.hash === `#${screen}`) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    bar.hidden = !parent;
    if (parent) {
      back.href = `#${parent}`;
      document.getElementById("screen-back-label").textContent = SCREENS[parent][0];
    }
    document.title = screen === "home" ? "TERRA · Your field journal" : `${title} · TERRA`;
    if (changed) document.dispatchEvent(new CustomEvent("terra:screen-shown", { detail: { screen } }));
    return changed;
  }
  function route({ focus = true } = {}) {
    const found = resolve(location.hash) || { screen: "home" };
    const changed = show(found.screen);
    if (found.alias === "terrarium") document.getElementById("awards-tab").click();
    const target = found.target && !found.target.matches("[data-screen]") ? found.target : null;
    if (target) {
      target.scrollIntoView({ block: "start" });
      if (focus) { if (!target.matches("a, button, input, select, textarea, [tabindex]")) target.tabIndex = -1; target.focus({ preventScroll: true }); }
    } else if (changed || focus) {
      window.scrollTo(0, 0);
      if (focus) {
        const heading = document.querySelector(`[data-screen="${found.screen}"]:not([hidden]) :is(h1, h2):not(.visually-hidden)`);
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      }
    }
    if (focus && changed) announcer.textContent = `${SCREENS[found.screen][0]} screen`;
  }
  window.addEventListener("hashchange", () => {
    const hash = location.hash || "#home";
    if (trail.length > 1 && trail[trail.length - 2] === hash) trail.pop(); else trail.push(hash);
    route();
    closeNavigation();
  });
  // Route in-app links right away (hashchange is async), including links to the current hash.
  // Listen on window so feature handlers on document see the click first.
  window.addEventListener("click", event => {
    const link = event.target.closest("a[href^='#']");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link === back && trail.length > 1 && trail[trail.length - 2] === back.hash) {
      event.preventDefault(); history.back(); return;
    }
    if (!resolve(link.hash)) return;
    event.preventDefault();
    if (link.hash !== location.hash) { history.pushState(null, "", link.hash); trail.push(link.hash); }
    route();
    closeNavigation();
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
  // A confirmed photo handoff continues on the Record screen.
  document.addEventListener("terra:prefill-discovery", () => {
    if (current === "record") return;
    // pushState, not a hash change, so the draft's own focus handling isn't overridden.
    history.pushState(null, "", "#record"); trail.push("#record");
    show("record"); window.scrollTo(0, 0);
  });

  // Short confirmation that floats above the tab bar.
  const toastEl = document.getElementById("toast");
  let toastTimer;
  function toast(message, link) {
    toastEl.replaceChildren(document.createTextNode(message));
    if (link) {
      const a = document.createElement("a");
      a.href = link.href; a.textContent = link.label;
      toastEl.append(" ", a);
    }
    toastEl.hidden = false;
    toastEl.classList.remove("leaving");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.classList.add("leaving"); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 250); }, 5000);
  }
  document.addEventListener("terra:observation-saved", event => {
    toast(`Saved “${event.detail.name}” to your journal.`, current === "journal" ? null : { href: "#journal", label: "View journal" });
  });

  trail.push(location.hash || "#home");
  route({ focus: false });
  // Reveal the screen holding an element (used by automated tests that act on any control).
  const reveal = element => { const screen = element?.closest?.("[data-screen]")?.dataset.screen; if (screen && screen !== current) show(screen); };
  return Object.freeze({ show, reveal, toast, get current() { return current; } });
})();

(() => {
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
