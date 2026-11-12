"use strict";

// Shared basemaps for every map in TERRA (the Map screen and the location pickers).
// - Streets: OpenStreetMap tiles with states, cities, roads and place names.
// - Terrain: OpenTopoMap tiles with contour lines and hill shading.
// - Outline: country outlines bundled with the app (Natural Earth), no network at all.
// Tile servers see which area you're looking at, so Outline is offered for sensitive sites.
// If tiles can't load (offline, blocked), the outline stays visible underneath.
const TerraBasemap = (() => {
  const PREF_KEY = "terra.map.v1";
  const BASES = Object.freeze({
    streets: { label: "Streets", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19,
      attribution: "© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors" },
    terrain: { label: "Terrain", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", maxZoom: 17, subdomains: "abc",
      attribution: "© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors, SRTM · style © <a href=\"https://opentopomap.org\">OpenTopoMap</a> (CC-BY-SA)" },
    outline: { label: "Outline", attribution: "Outline: Natural Earth" }
  });
  const TILE_HOSTS = /^https:\/\/([abc]\.)?tile\.(openstreetmap|opentopomap)\.org\//;

  function readPrefs() {
    try {
      const prefs = JSON.parse(localStorage.getItem(PREF_KEY)) || {};
      // Earlier versions stored only an on/off street map switch.
      if (!prefs.base && typeof prefs.street === "boolean") prefs.base = prefs.street ? "streets" : "outline";
      return Object.hasOwn(BASES, prefs.base) ? prefs : { ...prefs, base: "streets" };
    } catch { return { base: "streets" }; }
  }
  function savePrefs(prefs) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ base: prefs.base })); } catch { /* Per-browser convenience only. */ }
  }

  // Outline data is a script file (never fetched) so the app makes no fetch/XHR calls.
  let outlineData = null;
  const loadOutline = () => outlineData ?? (outlineData = window.TerraWorldOutline ? Promise.resolve(window.TerraWorldOutline) : new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "data/world-outline.js";
    script.onload = () => window.TerraWorldOutline ? resolve(window.TerraWorldOutline) : reject(Error("empty"));
    script.onerror = reject;
    document.head.append(script);
  }));

  // Adds the basemap and a Streets / Terrain / Outline switch to a Leaflet map.
  // onNote(text) receives short status messages (e.g. tiles couldn't load).
  function attach(map, { onNote = () => {} } = {}) {
    const prefs = readPrefs();
    let outline = null, tiles = null, loaded = false, current = null;
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    loadOutline().then(world => {
      outline = L.geoJSON(topojson.feature(world, world.objects.countries), { interactive: false,
        style: { color: "#a9b9a2", weight: 1, fillColor: "#e6ecdc", fillOpacity: 1 } }).addTo(map).bringToBack();
      map.attributionControl.addAttribution(BASES.outline.attribution);
      if (loaded) map.removeLayer(outline);
    }).catch(() => onNote("The outline map couldn't load."));

    function use(base, remember = true) {
      if (!Object.hasOwn(BASES, base) || base === current) return;
      current = base;
      if (remember) { prefs.base = base; savePrefs(prefs); }
      if (tiles) { map.removeLayer(tiles); tiles = null; }
      loaded = false;
      for (const button of control.getContainer().querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.base === base));
      if (base === "outline") {
        if (outline && !map.hasLayer(outline)) outline.addTo(map).bringToBack();
        onNote("Outline map: works offline and sends nothing.");
        return;
      }
      const spec = BASES[base];
      tiles = L.tileLayer(spec.url, { maxZoom: spec.maxZoom, subdomains: spec.subdomains ?? "abc", attribution: spec.attribution }).addTo(map);
      let failures = 0;
      const layer = tiles;
      layer.on("tileload", () => {
        if (layer !== tiles) return;
        if (!loaded) { loaded = true; onNote(`${spec.label} map from ${base === "terrain" ? "OpenTopoMap" : "OpenStreetMap"}.`); }
        if (outline && map.hasLayer(outline)) map.removeLayer(outline);
      });
      layer.on("tileerror", () => {
        if (layer !== tiles || loaded || ++failures < 4) return;
        onNote(`The ${spec.label.toLowerCase()} map couldn't load here (offline or blocked), so the outline map is showing.`);
        if (outline && !map.hasLayer(outline)) outline.addTo(map).bringToBack();
      });
      onNote(`Loading the ${spec.label.toLowerCase()} map…`);
    }

    const Switch = L.Control.extend({
      onAdd() {
        const box = L.DomUtil.create("div", "basemap-switch leaflet-bar");
        box.setAttribute("role", "group");
        box.setAttribute("aria-label", "Map style");
        for (const [base, spec] of Object.entries(BASES)) {
          const button = L.DomUtil.create("button", "", box);
          button.type = "button"; button.dataset.base = base; button.textContent = spec.label;
          button.setAttribute("aria-pressed", "false");
          L.DomEvent.on(button, "click", event => { L.DomEvent.stop(event); use(base); });
        }
        L.DomEvent.disableClickPropagation(box);
        return box;
      }
    });
    const control = new Switch({ position: "topright" }).addTo(map);
    use(prefs.base, false);
    return { use, get base() { return current; } };
  }
  return Object.freeze({ BASES, TILE_HOSTS, PREF_KEY, attach, readPrefs });
})();
