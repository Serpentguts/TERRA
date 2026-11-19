"use strict";

// Map screen: example observations on a real, zoomable map, with an iNaturalist-style
// search bar and filters. Basemaps (Streets / Terrain / Outline) come from basemap.js.
// Nothing here reads or writes the journal.
const TerraMap = (() => {
  const $ = id => document.getElementById(id);

  // Example entries only, clearly separate from the private journal.
  const EXAMPLES = Object.freeze([
    { category: "fungus", icon: "🍄", type: "Mushroom", name: "Woodland mushroom", setting: "natural", note: "A cap among fallen redwood needles.", place: "Muir Woods", lat: 37.8970, lng: -122.5811 },
    { category: "plant", icon: "🌿", type: "Plant", name: "Garden seedling", setting: "cultivated", note: "New leaves in a botanical garden bed.", place: "San Francisco Botanical Garden", lat: 37.7669, lng: -122.4686 },
    { category: "bird", icon: "🐦", type: "Bird", name: "Woodland bird", setting: "natural", note: "A small bird resting on a branch.", place: "Point Reyes", lat: 38.0690, lng: -122.8069 },
    { category: "reptile", icon: "🐍", type: "Snake / reptile", name: "Grass snake", setting: "natural", note: "Observed from a safe distance in a meadow.", place: "Mount Tamalpais", lat: 37.9235, lng: -122.5965 },
    { category: "mammal", icon: "🐁", type: "Mouse / mammal", name: "Field mouse", setting: "natural", note: "A brief glimpse near a hedgerow.", place: "Tilden Regional Park", lat: 37.8977, lng: -122.2443 },
    { category: "insect", icon: "🐞", type: "Bug / insect", name: "Garden ladybird", setting: "cultivated", note: "A bug on a cultivated plant.", place: "Golden Gate Park", lat: 37.7720, lng: -122.4540 },
    { category: "plant", icon: "🌿", type: "Plant", name: "Seed packet example", setting: "sale", sale: true, note: "Example seeds listing. Not available to buy; no transaction or posting.", place: "Oakland", lat: 37.8044, lng: -122.2712 }
  ].map(Object.freeze));
  const SETTING_LABELS = { natural: "Natural setting", cultivated: "Cultivated / garden setting", sale: "For-sale listing · not an observation" };

  const query = $("map-query");
  const panel = $("map-filter-panel");
  const toggleFilters = $("map-filters-toggle");
  const checks = name => [...panel.querySelectorAll(`input[name="${name}"]`)];
  const chosen = name => checks(name).filter(input => input.checked).map(input => input.value);
  const labelOf = input => input.closest("label").textContent.trim();

  // List cards, also used as popup content.
  function card(entry) {
    const li = document.createElement("li");
    li.className = `demo-card ${entry.sale ? "sale" : entry.setting}`;
    li.dataset.purpose = entry.sale ? "sale" : entry.setting;
    li.dataset.category = entry.category;
    const icon = document.createElement("span");
    icon.className = "organism-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = entry.icon;
    const title = document.createElement("h4");
    title.textContent = `${entry.type} · ${entry.name}`;
    const purpose = document.createElement("p");
    purpose.className = "demo-purpose";
    purpose.textContent = entry.sale ? "DEMO FOR-SALE LISTING · NOT AN OBSERVATION" : `DEMO OBSERVATION · ${entry.setting === "natural" ? "Natural / wild setting" : "Cultivated / garden setting"}`;
    const where = document.createElement("p");
    where.className = "demo-place";
    where.textContent = `Near ${entry.place}`;
    const note = document.createElement("p");
    note.textContent = entry.note;
    li.append(icon, title, purpose, where, note);
    return li;
  }
  const items = EXAMPLES.map(entry => ({ entry, card: card(entry), marker: null }));
  for (const item of items) $(item.entry.sale ? "demo-listings" : "demo-map").append(item.card);

  const matches = (entry, organisms, purposes, text) =>
    (!organisms.length || organisms.includes(entry.category)) &&
    (!purposes.length || purposes.includes(entry.sale ? "sale" : entry.setting)) &&
    (!text || [entry.name, entry.type, entry.category, entry.place].some(value => value.toLowerCase().includes(text)));

  function renderActive(organisms, purposes, text) {
    const row = $("map-active");
    row.replaceChildren();
    const chip = (label, remove) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "active-chip";
      button.setAttribute("aria-label", `Remove filter: ${label}`);
      button.append(label, Object.assign(document.createElement("span"), { textContent: "×", ariaHidden: "true" }));
      button.addEventListener("click", () => { remove(); apply(); query.focus(); });
      row.append(button);
    };
    if (text) chip(`“${query.value.trim()}”`, () => { query.value = ""; });
    for (const input of [...checks("map-organism"), ...checks("map-purpose")].filter(i => i.checked)) chip(labelOf(input), () => { input.checked = false; });
    row.hidden = !row.children.length;
    const count = organisms.length + purposes.length;
    $("map-filter-count").textContent = count;
    $("map-filter-count").hidden = !count;
  }
  function apply() {
    const organisms = chosen("map-organism"), purposes = chosen("map-purpose");
    const text = query.value.trim().toLowerCase();
    let observations = 0, listings = 0;
    for (const item of items) {
      const show = matches(item.entry, organisms, purposes, text);
      item.card.hidden = !show;
      if (show) item.entry.sale ? listings++ : observations++;
      if (item.marker && map) {
        if (show && !map.hasLayer(item.marker)) item.marker.addTo(markers);
        if (!show) markers.removeLayer(item.marker);
      }
    }
    renderActive(organisms, purposes, text);
    $("map-selected").textContent = `Filters: ${purposes.join(", ") || "all settings"} · organisms: ${organisms.join(", ") || "all"}${text ? ` · search: ${query.value.trim()}` : ""}`;
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    $("map-results").textContent = `${plural(observations, "example observation")} and ${plural(listings, "for-sale listing")} shown`;
    $("map-empty").hidden = observations + listings > 0;
  }
  function reset() {
    for (const input of [...checks("map-organism"), ...checks("map-purpose")]) input.checked = false;
    query.value = "";
    apply();
  }

  // Filters popover
  function setPanel(open) {
    panel.hidden = !open;
    toggleFilters.setAttribute("aria-expanded", String(open));
    if (open) panel.querySelector("input").focus();
  }
  toggleFilters.addEventListener("click", () => setPanel(panel.hidden));
  $("map-filters-done").addEventListener("click", () => { setPanel(false); toggleFilters.focus(); });
  panel.addEventListener("keydown", event => { if (event.key === "Escape") { setPanel(false); toggleFilters.focus(); } });
  panel.addEventListener("change", apply);
  query.addEventListener("input", apply);
  $("map-search").addEventListener("submit", event => { event.preventDefault(); apply(); });
  $("map-reset").addEventListener("click", reset);
  document.querySelector("[data-map-reset]").addEventListener("click", () => { reset(); query.focus(); });

  // The map itself. Built the first time the Map screen is shown, so it has a size.
  let map = null, markers = null;
  function popup(entry) {
    const box = document.createElement("div");
    box.className = "map-popup";
    const title = document.createElement("strong");
    title.textContent = `${entry.icon} ${entry.name}`;
    const meta = document.createElement("small");
    meta.textContent = `${entry.type} · ${SETTING_LABELS[entry.sale ? "sale" : entry.setting]}`;
    const place = document.createElement("p");
    place.textContent = `Near ${entry.place}. ${entry.note}`;
    box.append(title, meta, place);
    return box;
  }
  function build() {
    if (map || typeof L === "undefined") return;
    map = L.map("map-view", { zoomControl: true, worldCopyJump: true, attributionControl: true });
    TerraBasemap.attach(map, { onNote: text => { $("map-street-note").textContent = text; } });
    markers = L.layerGroup().addTo(map);
    for (const item of items) {
      const { entry } = item;
      const purpose = entry.sale ? "sale" : entry.setting;
      const icon = L.divIcon({ className: "", html: `<span class="map-pin ${purpose}" aria-hidden="true">${entry.icon}</span>`, iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -16] });
      item.marker = L.marker([entry.lat, entry.lng], { icon, title: `${entry.name}, ${entry.type}`, alt: entry.name, keyboard: true, riseOnHover: true })
        .bindPopup(() => popup(entry));
      item.marker.on("add", () => { const el = item.marker.getElement(); el.setAttribute("role", "button"); el.setAttribute("aria-label", `${entry.name}, ${entry.type}, near ${entry.place}`); });
    }
    map.fitBounds(L.latLngBounds(EXAMPLES.map(e => [e.lat, e.lng])), { padding: [36, 36], maxZoom: 11 });
    apply();
  }
  document.addEventListener("terra:screen-shown", event => {
    if (event.detail.screen !== "map") return;
    if (!map) build(); else map.invalidateSize();
  });
  if (!$("map").hidden) build();
  apply();
  return Object.freeze({ EXAMPLES, apply, reset, get map() { return map; } });
})();
