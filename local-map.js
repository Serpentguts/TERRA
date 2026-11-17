"use strict";
// Location pickers on a real map (observation location and project site boundary).
// Exact drops a pin; Approximate and Hidden draw a region (two opposite corners) that snaps
// outward to 0.1° cells; project sites keep the rectangle as drawn. Hidden keeps nothing on save.
// No GPS, geocoding or photo metadata. Coordinates: x = longitude, y = latitude (WGS84).
const TerraMaps = (() => {
  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  const clampLng = n => Math.max(-180, Math.min(180, n));
  const clampLat = n => Math.max(-90, Math.min(90, n));
  let lastView = null; // Pickers open where you last picked, for this visit only.

  function create(host, mode) {
    let value = null, first = null, map = null, shape = null, cornerMarker = null;
    const note = document.createElement("p");
    note.className = "picker-note";
    note.textContent = "Tap the map to drop a pin (Exact), or tap two opposite corners to mark an area (Approximate / Hidden / project sites). Zoom in for accuracy. You can also type coordinates below.";
    const view = document.createElement("div");
    view.className = "picker-map";
    view.setAttribute("role", "application");
    view.setAttribute("aria-label", "Map for choosing a location. Coordinate fields below are the keyboard alternative.");
    const mapNote = document.createElement("small");
    mapNote.className = "picker-map-note";
    const controls = document.createElement("div"); controls.className = "map-coordinates";
    const inputs = {};
    const labels = { x1: "Longitude", y1: "Latitude", x2: "Corner 2 longitude", y2: "Corner 2 latitude" };
    for (const key of ["x1", "y1", "x2", "y2"]) {
      const label = document.createElement("label"); label.textContent = labels[key];
      const input = document.createElement("input");
      input.type = "number"; input.step = "any"; input.inputMode = "decimal";
      input.min = key.startsWith("x") ? -180 : -90; input.max = key.startsWith("x") ? 180 : 90;
      input.id = `${host.id}-${key}`; label.htmlFor = input.id;
      inputs[key] = input; label.append(input); controls.append(label);
    }
    const apply = document.createElement("button"); apply.type = "button"; apply.className = "secondary-button"; apply.textContent = "Apply map selection";
    const clear = document.createElement("button"); clear.type = "button"; clear.className = "text-button"; clear.textContent = "Clear map selection";
    const status = document.createElement("p"); status.setAttribute("role", "status");
    host.append(note, view, mapNote, controls, apply, clear, status);

    const fmt = (n, d = 5) => `${Math.abs(n).toFixed(d).replace(/\.?0+$/, "")}°`;
    const describePoint = (x, y) => `${fmt(y)} ${y >= 0 ? "N" : "S"}, ${fmt(x)} ${x >= 0 ? "E" : "W"}`;
    function drawShape() {
      if (!map) return;
      if (shape) { map.removeLayer(shape); shape = null; }
      if (cornerMarker && !first) { map.removeLayer(cornerMarker); cornerMarker = null; }
      if (!value) return;
      shape = value.kind === "point"
        ? L.circleMarker([value.y, value.x], { radius: 8, color: "#fff", weight: 3, fillColor: "#214c3c", fillOpacity: 1 }).addTo(map)
        : L.rectangle([[value.y1, value.x1], [value.y2, value.x2]], { color: "#214f43", weight: 2, fillColor: "#386d5d", fillOpacity: 0.25 }).addTo(map);
    }
    function draw() {
      const point = mode() === "exact";
      for (const key of ["x2", "y2"]) inputs[key].parentElement.hidden = point;
      inputs.x1.parentElement.firstChild.textContent = point ? "Longitude" : "Corner 1 longitude";
      inputs.y1.parentElement.firstChild.textContent = point ? "Latitude" : "Corner 1 latitude";
      drawShape();
      if (!value) { status.textContent = legacy ? legacy : "Location required: no selection yet."; return; }
      if (value.kind === "point") { status.textContent = `Pin: ${describePoint(value.x, value.y)}.`; return; }
      const area = `${describePoint(value.x1, value.y1)} to ${describePoint(value.x2, value.y2)}`;
      status.textContent = mode() === "boundary" ? `Site area: ${area}.`
        : `Area: ${area}.${mode() === "hidden" ? " Hidden: this area is discarded on save; no location is kept, so it can't prove a project site." : " Only this snapped area is kept, never the points you tapped."}`;
    }
    let legacy = "";
    function set(next) {
      first = null; legacy = "";
      if (next && next.space === TerraData.SPACE) {
        // An older site drawn on the imaginary practice grid can't be shown on a real map.
        legacy = "This site was drawn on the earlier practice grid. Draw it again on the map to update it; until then the old area is kept.";
        next = null;
      }
      value = next ? { ...next } : null;
      for (const key of Object.keys(inputs)) inputs[key].value = value ? (value[key] ?? value[key === "x1" ? "x" : "y"] ?? "") : "";
      draw(); host.dispatchEvent(new Event("terra:map-changed"));
      if (value && map) map.fitBounds(value.kind === "point" ? L.latLng(value.y, value.x).toBounds(2000) : [[value.y1, value.x1], [value.y2, value.x2]], { maxZoom: 13, padding: [24, 24] });
    }
    function select(x1, y1, x2, y2) {
      const okLng = n => Number.isFinite(n) && n >= -180 && n <= 180, okLat = n => Number.isFinite(n) && n >= -90 && n <= 90;
      if (!okLng(x1) || !okLat(y1)) { status.textContent = "Use a longitude from -180 to 180 and a latitude from -90 to 90."; return; }
      const base = { version: 1, space: TerraData.GEO };
      if (mode() === "exact") { set({ ...base, kind: "point", x: round(x1, 5), y: round(y1, 5) }); return; }
      if (!okLng(x2) || !okLat(y2)) { status.textContent = "Enter both opposite corners (longitude -180 to 180, latitude -90 to 90)."; return; }
      let r = { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
      if (mode() === "boundary") {
        r = { x1: round(r.x1, 5), y1: round(r.y1, 5), x2: round(r.x2, 5), y2: round(r.y2, 5) };
      } else {
        const cell = TerraData.GEO_CELL, cells = mode() === "hidden" ? 4 : 2;
        r = { x1: round(Math.floor(round(r.x1 / cell, 6)) * cell, 1), y1: round(Math.floor(round(r.y1 / cell, 6)) * cell, 1),
          x2: round(Math.ceil(round(r.x2 / cell, 6)) * cell, 1), y2: round(Math.ceil(round(r.y2 / cell, 6)) * cell, 1) };
        for (const [a, b, clamp] of [["x1", "x2", clampLng], ["y1", "y2", clampLat]]) {
          if (round(r[b] - r[a], 1) < cells * cell) { r[b] = round(clamp(r[a] + cells * cell), 1); r[a] = round(clamp(r[b] - cells * cell), 1); }
        }
      }
      if (!TerraData.boundary({ ...base, ...r })) { status.textContent = "The area needs some width and height."; return; }
      set({ ...base, kind: "region", ...r });
    }
    controls.addEventListener("input", () => {
      // Typed, unapplied edits must never silently reuse the previous pin/region.
      value = null; first = null; legacy = ""; draw(); host.dispatchEvent(new Event("terra:map-changed"));
    });
    apply.addEventListener("click", () => {
      const nums = Object.keys(inputs).map(k => inputs[k].value === "" ? NaN : Number(inputs[k].value)); select(...nums);
    });
    clear.addEventListener("click", () => set(null));

    // The Leaflet map is built once the picker is on screen and has a size.
    function build() {
      // Wait until the screen router has run and this picker is really on screen.
      if (map || typeof L === "undefined" || !view.clientWidth || !document.documentElement.classList.contains("screens") || !view.checkVisibility()) return;
      map = L.map(view, { worldCopyJump: true });
      if (value) drawShape();
      if (value) map.fitBounds(value.kind === "point" ? L.latLng(value.y, value.x).toBounds(2000) : [[value.y1, value.x1], [value.y2, value.x2]], { maxZoom: 13 });
      else if (lastView) map.setView(lastView.center, lastView.zoom); else map.setView([25, -40], 2);
      if (typeof TerraBasemap !== "undefined") TerraBasemap.attach(map, { onNote: text => { mapNote.textContent = text; } });
      map.on("moveend", () => { lastView = { center: map.getCenter(), zoom: map.getZoom() }; });
      map.on("click", event => {
        const { lat, lng } = event.latlng.wrap();
        if (mode() === "exact") { select(lng, lat); return; }
        if (!first) {
          first = [lng, lat];
          cornerMarker = L.circleMarker(event.latlng, { radius: 6, color: "#214f43", fillColor: "#fff", fillOpacity: 1 }).addTo(map);
          status.textContent = "First corner set. Tap the opposite corner.";
        } else {
          const [fx, fy] = first; first = null;
          if (cornerMarker) { map.removeLayer(cornerMarker); cornerMarker = null; }
          select(fx, fy, lng, lat);
        }
      });
    }
    new ResizeObserver(() => { if (!map) build(); else map.invalidateSize(); }).observe(view);
    draw();
    return {
      set, select, clear: () => set(null),
      read() {
        if (!value) return null;
        if (mode() === "hidden") return { version: 1, space: TerraData.GEO, kind: "withheld" };
        if (mode() === "boundary") { const { kind, ...b } = value; return b; }
        return { ...value };
      }
    };
  }
  const privacy = document.getElementById("privacy");
  const observation = create(document.getElementById("observation-map"), () => privacy.value);
  const project = create(document.getElementById("project-map"), () => "boundary");
  const sites = document.getElementById("location-project-site");
  function refreshSites() {
    sites.replaceChildren(new Option("Or select a saved project site", ""));
    try {
      for (const p of FieldSummary.parse(localStorage.getItem(FieldSummary.KEY))) if (p.boundary?.space === TerraData.GEO) sites.add(new Option(p.title, p.id));
    } catch { /* Existing project error explains unreadable storage. */ }
  }
  sites.addEventListener("change", () => {
    try {
      const p = FieldSummary.parse(localStorage.getItem(FieldSummary.KEY)).find(p => p.id === sites.value);
      if (p?.boundary && privacy.value !== "exact") { const b = p.boundary; observation.select(b.x1, b.y1, b.x2, b.y2); }
      else observation.clear();
    } catch { observation.clear(); }
  });
  function resetObservation() {
    observation.clear(); sites.disabled = privacy.value === "exact"; sites.value = "";
  }
  privacy.addEventListener("change", resetObservation);
  document.addEventListener("terra:projects-rendered", refreshSites);
  return { observation, project, resetObservation };
})();
