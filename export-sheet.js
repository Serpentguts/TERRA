"use strict";

// Spreadsheet export: your journal and projects as one workbook for Excel or Google Sheets.
// Pure building logic (sheets()) plus a small UI hook (TerraSheetExport.download()).
// Locations follow each observation's privacy setting:
//   Hidden       → no location at all.
//   Approximate  → only the saved area (a box), never a point.
//   Exact        → a ~0.1° box by default; the precise point only if you tick "include exact locations".
// Old schematic (non-geographic) locations are labelled as such, with no coordinates.
// A readable report, not a restore file: the JSON backup is still the way to restore.
const TerraSheetExport = (() => {
  const GROUPS = { plant: "Plant", fungus: "Fungus", insect: "Insect", mammal: "Mammal", bird: "Bird", fish: "Fish", reptile: "Reptile/amphibian", other: "Other" };
  // Broad Darwin Core classification from TERRA's groups (no guessing below the group).
  const DWC_RANKS = {
    plant: { kingdom: "Plantae" }, fungus: { kingdom: "Fungi" }, insect: { kingdom: "Animalia", phylum: "Arthropoda", class: "Insecta" },
    mammal: { kingdom: "Animalia", phylum: "Chordata", class: "Mammalia" }, bird: { kingdom: "Animalia", phylum: "Chordata", class: "Aves" },
    fish: { kingdom: "Animalia", phylum: "Chordata" }, reptile: { kingdom: "Animalia", phylum: "Chordata" }, other: {}
  };
  const unknown = name => !String(name ?? "").trim() || String(name).trim().toLowerCase() === "unknown";
  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  // Half the diagonal of a lat/lon box, in metres (Darwin Core coordinateUncertaintyInMeters).
  function uncertainty(x1, y1, x2, y2) {
    const lat = ((y1 + y2) / 2) * Math.PI / 180, dy = (y2 - y1) * 111320, dx = (x2 - x1) * 111320 * Math.cos(lat);
    return Math.max(1, Math.round(Math.hypot(dx, dy) / 2));
  }
  // What a record's location becomes in the export.
  function place(record, { exact = false, geo = "terra-geo-v1", cell = 0.1 } = {}) {
    const l = record.location;
    if (record.privacy === "hidden" || !l || l.kind === "withheld") return { shown: "Hidden", note: "Location withheld by observer" };
    if (l.space !== geo) return { shown: "Schematic map (not geographic)", note: "Recorded on an old schematic map; no real coordinates" };
    if (l.kind === "point" && exact) return { shown: "Exact", lat: l.y, lon: l.x, uncertainty: 10 };
    let box;
    if (l.kind === "point") {
      const snap = v => Math.floor(v / cell) * cell;
      box = { x1: round(snap(l.x), 4), y1: round(snap(l.y), 4), x2: round(snap(l.x) + cell, 4), y2: round(snap(l.y) + cell, 4) };
    } else box = { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 };
    return {
      shown: l.kind === "point" ? "Generalized (exact not included)" : "Approximate area", box,
      lat: round((box.y1 + box.y2) / 2, 4), lon: round((box.x1 + box.x2) / 2, 4), uncertainty: uncertainty(box.x1, box.y1, box.x2, box.y2),
      note: l.kind === "point" ? "Exact point generalized to a 0.1° area for this export" : "Observer shared an approximate area only"
    };
  }

  // Build the workbook's sheets. records: journal entries; projects: FieldSummary projects.
  function sheets(records, projects, { style = "terra", exact = false, photoCounts = new Map(), now = new Date(), matches = () => true, geo, cell } = {}) {
    const active = records.filter(r => !r.deletedAt).sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const byId = new Map(active.map(r => [r.id, r]));
    const inProjects = new Map();
    for (const p of projects) for (const id of p.observationIds) if (byId.has(id) && matches(p, byId.get(id))) inProjects.set(id, [...(inProjects.get(id) ?? []), p.title]);
    const geoOpts = { exact, ...(geo ? { geo } : {}), ...(cell ? { cell } : {}) };

    const observations = style === "dwc"
      ? {
        name: "Occurrences",
        columns: [
          { header: "occurrenceID", width: 30 }, { header: "basisOfRecord", width: 18 }, { header: "eventDate", type: "date", width: 12 },
          { header: "verbatimIdentification", width: 26 }, { header: "vernacularName", width: 22 }, { header: "kingdom", width: 10 }, { header: "phylum", width: 12 }, { header: "class", width: 10 },
          { header: "occurrenceRemarks", type: "wrap", width: 40 }, { header: "decimalLatitude", type: "number", width: 14 }, { header: "decimalLongitude", type: "number", width: 14 },
          { header: "geodeticDatum", width: 12 }, { header: "coordinateUncertaintyInMeters", type: "number", width: 14 },
          { header: "informationWithheld", width: 30 }, { header: "dataGeneralizations", width: 34 }, { header: "associatedMedia", width: 16 }, { header: "datasetName", width: 22 }
        ],
        rows: active.map(r => {
          const p = place(r, geoOpts), ranks = DWC_RANKS[r.type] ?? {}, photos = photoCounts.get(r.id) ?? 0;
          return [r.id, "HumanObservation", r.date, unknown(r.name) ? "" : r.name.trim(), unknown(r.name) ? "" : r.name.trim(), ranks.kingdom ?? "", ranks.phylum ?? "", ranks.class ?? "",
            r.notes, p.lat ?? "", p.lon ?? "", p.lat === undefined ? "" : "WGS84", p.lat === undefined ? "" : p.uncertainty,
            p.lat === undefined ? p.note : "", p.box ? p.note : "", photos ? `${photos} photo${photos === 1 ? "" : "s"} kept by observer` : "", "TERRA field journal"];
        })
      }
      : {
        name: "Observations",
        columns: [
          { header: "Observation ID", width: 30 }, { header: "Date", type: "date", width: 12 }, { header: "Name", width: 26 }, { header: "Group", width: 16 },
          { header: "Notes", type: "wrap", width: 44 }, { header: "Privacy setting", width: 14 }, { header: "Location in this export", width: 30 },
          { header: "Latitude", type: "number", width: 11 }, { header: "Longitude", type: "number", width: 11 }, { header: "Uncertainty (m)", type: "number", width: 14 },
          { header: "Area south", type: "number", width: 11 }, { header: "Area north", type: "number", width: 11 }, { header: "Area west", type: "number", width: 11 }, { header: "Area east", type: "number", width: 11 },
          { header: "Photos", type: "number", width: 8 }, { header: "Projects", type: "wrap", width: 30 }
        ],
        rows: active.map(r => {
          const p = place(r, geoOpts);
          return [r.id, r.date, r.name, GROUPS[r.type] ?? r.type, r.notes, r.privacy[0].toUpperCase() + r.privacy.slice(1), p.shown,
            p.lat ?? "", p.lon ?? "", p.lat === undefined ? "" : p.uncertainty, p.box?.y1 ?? "", p.box?.y2 ?? "", p.box?.x1 ?? "", p.box?.x2 ?? "",
            photoCounts.get(r.id) ?? 0, (inProjects.get(r.id) ?? []).join("; ")];
        })
      };

    const projectRows = projects.map(p => {
      const included = p.observationIds.filter(id => byId.has(id) && matches(p, byId.get(id)));
      return [p.id, p.title, { custom: "Custom", day: "Day", species: "Species", site: "Site" }[p.type] ?? p.type, p.date || "", p.endDate || p.date || "",
        p.species || "", p.site || "", p.notes, p.complete ? "Complete" : "Open", included.length, p.observationIds.length - included.length, p.boundary ? "Yes" : "No"];
    });
    const memberRows = projects.flatMap(p => p.observationIds.map(id => {
      const r = byId.get(id), ok = r && matches(p, r);
      return [p.id, p.title, id, ok ? r.date : "", ok ? r.name : "", ok ? "Included" : "Missing or out of scope (not counted)"];
    }));
    const located = active.filter(r => place(r, geoOpts).lat !== undefined).length;
    const about = [
      ["Exported", now.toISOString()],
      ["From", "TERRA field journal (browser-only; nothing was uploaded to make this file)"],
      ["Column style", style === "dwc" ? "Darwin Core (GBIF / biodiversity data standard)" : "TERRA (plain-language columns)"],
      ["Observations", active.length],
      ["With coordinates in this export", located],
      ["Projects", projects.length],
      ["Locations", exact ? "Exact points included where the observer chose Exact. Treat this file as sensitive." : "No exact points. Exact locations are generalized to a 0.1° area (about 11 km); Approximate shows only the saved area; Hidden has no location."],
      ["Not included", "Deleted (Trash) observations, photos themselves (only a count), profile and terrarium data."],
      ["Restoring", "This is a readable report, not a backup. To restore TERRA, use Export JSON in the Journal."],
      ["Formulas", "Every text cell is stored as plain text, so nothing in this file runs as a formula."],
      ["Google Sheets", "Open sheets.google.com → File → Import → Upload this file, or drop it into Google Drive and open it with Google Sheets."],
      ["Excel", "Open the file directly. Filters are on, and the header row stays frozen while you scroll."],
      ["Identifications", "Names are the observer's own labels, not verified identifications."]
    ];
    return [
      observations,
      { name: "Projects", columns: [{ header: "Project ID", width: 30 }, { header: "Title", width: 26 }, { header: "Type", width: 10 }, { header: "Start", type: "date", width: 12 }, { header: "End", type: "date", width: 12 },
        { header: "Species/name", width: 20 }, { header: "Site label", width: 20 }, { header: "Notes", type: "wrap", width: 40 }, { header: "Status", width: 10 },
        { header: "Observations counted", type: "number", width: 12 }, { header: "Missing references", type: "number", width: 12 }, { header: "Site boundary", width: 10 }], rows: projectRows },
      { name: "Project members", columns: [{ header: "Project ID", width: 30 }, { header: "Project", width: 26 }, { header: "Observation ID", width: 30 }, { header: "Date", type: "date", width: 12 },
        { header: "Name", width: 26 }, { header: "Status", width: 34 }], rows: memberRows },
      { name: "About", columns: [{ header: "About this export", width: 30 }, { header: "", type: "wrap", width: 90 }], rows: about, filter: false }
    ];
  }
  const filename = (style, today) => `terra-${style === "dwc" ? "darwin-core" : "journal"}-${today}.xlsx`;
  return Object.freeze({ sheets, place, filename, GROUPS });
})();
if (typeof module !== "undefined") module.exports = TerraSheetExport;
