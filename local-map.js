"use strict";
// Deliberately local schematic. No GPS, tiles, geocoder, or photo metadata.
const TerraMaps = (() => {
  const svgNS = "http://www.w3.org/2000/svg";
  function create(host, mode) {
    let value = null, first = null;
    const note = document.createElement("p");
    note.textContent = "LOCAL / DEMO schematic · shared 0–100 grid, NOT real geography. Use the same imagined grid for observations and sites. No GPS or external services. Click for a pin (Exact), or two opposite corners for a rectangle. Keyboard alternative: enter grid values and Apply.";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Local schematic location selection; numeric controls below provide keyboard access");
    svg.classList.add("local-map");
    const bg = document.createElementNS(svgNS, "rect");
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: 100, height: 100, fill: "#edf2e6" })) bg.setAttribute(k, v);
    svg.append(bg);
    for (let i = 10; i < 100; i += 10) {
      const path = document.createElementNS(svgNS, "path"); path.setAttribute("d", `M ${i} 0 V 100 M 0 ${i} H 100`); path.setAttribute("stroke", "#b8c9b2"); path.setAttribute("stroke-width", ".3"); svg.append(path);
    }
    const shape = document.createElementNS(svgNS, "path"); shape.setAttribute("fill", "#386d5d55"); shape.setAttribute("stroke", "#214f43"); shape.setAttribute("stroke-width", "1"); svg.append(shape);
    const controls = document.createElement("div"); controls.className = "map-coordinates";
    const inputs = {};
    for (const key of ["x1", "y1", "x2", "y2"]) {
      const label = document.createElement("label"); label.textContent = key;
      const input = document.createElement("input"); input.type = "number"; input.min = 0; input.max = 100; input.step = 1; input.id = `${host.id}-${key}`; label.htmlFor = input.id;
      inputs[key] = input; label.append(input); controls.append(label);
    }
    const apply = document.createElement("button"); apply.type = "button"; apply.className = "secondary-button"; apply.textContent = "Apply map selection";
    const clear = document.createElement("button"); clear.type = "button"; clear.className = "text-button"; clear.textContent = "Clear map selection";
    const status = document.createElement("p"); status.setAttribute("role", "status");
    host.append(note, svg, controls, apply, clear, status);
    function draw() {
      const point = mode() === "exact";
      for (const key of ["x2", "y2"]) inputs[key].parentElement.hidden = point;
      if (!value) { shape.setAttribute("d", ""); status.textContent = "Location required: no selection yet."; return; }
      shape.setAttribute("d", value.kind === "point" ? `M ${value.x - 2} ${value.y} h 4 M ${value.x} ${value.y - 2} v 4` : `M ${value.x1} ${value.y1} H ${value.x2} V ${value.y2} H ${value.x1} Z`);
      status.textContent = point ? `Local pin: ${value.x}, ${value.y}. Not geographic coordinates.` : `Local region: ${value.x1}–${value.x2}, ${value.y1}–${value.y2}.${mode() === "hidden" ? " Hidden: selection will be discarded; no location retained. Cannot prove site inclusion." : " Only this region is retained, never the clicked points."}`;
    }
    function set(next) {
      value = next ? { ...next } : null; first = null;
      for (const key of Object.keys(inputs)) inputs[key].value = value ? (value[key] ?? value[key === "x1" ? "x" : "y"] ?? "") : "";
      draw(); host.dispatchEvent(new Event("terra:map-changed"));
    }
    function select(x1, y1, x2, y2) {
      if (![x1, y1].every(n => Number.isInteger(n) && n >= 0 && n <= 100)) { status.textContent = "Use whole grid values from 0 to 100."; return; }
      const base = { version: 1, space: TerraData.SPACE };
      if (mode() === "exact") { set({ ...base, kind: "point", x: x1, y: y1 }); return; }
      if (![x2, y2].every(n => Number.isInteger(n) && n >= 0 && n <= 100)) { status.textContent = "Enter both opposite corners (0–100)."; return; }
      let r = { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
      if (mode() !== "boundary") {
        r = { x1: Math.floor(r.x1 / 10) * 10, y1: Math.floor(r.y1 / 10) * 10, x2: Math.ceil(r.x2 / 10) * 10, y2: Math.ceil(r.y2 / 10) * 10 };
        const min = mode() === "hidden" ? 40 : 20;
        for (const [a, b] of [["x1", "x2"], ["y1", "y2"]]) if (r[b] - r[a] < min) { r[b] = Math.min(100, r[a] + min); r[a] = Math.max(0, r[b] - min); }
      }
      if (!TerraData.boundary({ ...base, ...r })) { status.textContent = "Region needs positive width and height."; return; }
      set({ ...base, kind: "region", ...r });
    }
    apply.addEventListener("click", () => {
      const nums = Object.keys(inputs).map(k => inputs[k].value === "" ? NaN : Number(inputs[k].value)); select(...nums);
    });
    svg.addEventListener("click", event => {
      const b = svg.getBoundingClientRect();
      const p = [Math.max(0, Math.min(100, Math.round((event.clientX - b.left) / b.width * 100))), Math.max(0, Math.min(100, Math.round((event.clientY - b.top) / b.height * 100)))];
      if (mode() === "exact") select(...p);
      else if (!first) { first = p; status.textContent = "First corner selected. Choose the opposite corner."; }
      else select(...first, ...p);
    });
    clear.addEventListener("click", () => set(null)); draw();
    return {
      set, select, clear: () => set(null),
      read() {
        if (!value) return null;
        if (mode() === "hidden") return { version: 1, space: TerraData.SPACE, kind: "withheld" };
        if (mode() === "boundary") { const { kind, ...b } = value; return b; }
        return { ...value };
      }
    };
  }
  const privacy = document.getElementById("privacy");
  const observation = create(document.getElementById("observation-map"), () => privacy.value);
  privacy.addEventListener("change", () => observation.clear());
  const project = create(document.getElementById("project-map"), () => "boundary");
  const sites = document.getElementById("location-project-site");
  function refreshSites() {
    sites.replaceChildren(new Option("Or select a saved project boundary", ""));
    try { for (const p of FieldSummary.parse(localStorage.getItem(FieldSummary.KEY))) if (p.boundary) sites.add(new Option(p.title, p.id)); } catch { /* Existing project error explains unreadable storage. */ }
  }
  sites.addEventListener("change", () => {
    try {
      const p = FieldSummary.parse(localStorage.getItem(FieldSummary.KEY)).find(p => p.id === sites.value);
      if (p?.boundary && privacy.value !== "exact") { const b = p.boundary; observation.select(b.x1, b.y1, b.x2, b.y2); }
      else observation.clear();
    } catch { observation.clear(); }
  });
  privacy.addEventListener("change", () => { sites.disabled = privacy.value === "exact"; sites.value = ""; });
  document.addEventListener("terra:projects-rendered", refreshSites);
  return { observation, project };
})();
