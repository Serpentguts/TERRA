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

  // Licences a Darwin Core dataset can carry (the three GBIF accepts).
  const LICENSES = Object.freeze([
    { id: "CC-BY-4.0", label: "CC BY 4.0 (credit me)", url: "http://creativecommons.org/licenses/by/4.0/legalcode", name: "Creative Commons Attribution (CC-BY) 4.0" },
    { id: "CC0-1.0", label: "CC0 (no rights reserved)", url: "http://creativecommons.org/publicdomain/zero/1.0/legalcode", name: "Public Domain (CC0 1.0)" },
    { id: "CC-BY-NC-4.0", label: "CC BY-NC 4.0 (credit me, non-commercial)", url: "http://creativecommons.org/licenses/by-nc/4.0/legalcode", name: "Creative Commons Attribution Non Commercial (CC-BY-NC) 4.0" }
  ].map(Object.freeze));
  const licenseFor = id => LICENSES.find(l => l.id === id) ?? LICENSES[0];
  const DWC = "http://rs.tdwg.org/dwc/terms/", DCT = "http://purl.org/dc/terms/";
  // Darwin Core occurrence rows, shared by the spreadsheet and the archive. records: active, sorted.
  function occurrences(records, { exact = false, photoCounts = new Map(), geo, cell, license = LICENSES[0].id, recordedBy = "" } = {}) {
    const geoOpts = { exact, ...(geo ? { geo } : {}), ...(cell ? { cell } : {}) }, lic = licenseFor(license), who = String(recordedBy).trim().slice(0, 200);
    const terms = [
      ["occurrenceID", DWC, 30], ["basisOfRecord", DWC, 18], ["occurrenceStatus", DWC, 14], ["eventDate", DWC, 12, "date"],
      ["verbatimIdentification", DWC, 26], ["vernacularName", DWC, 22], ["kingdom", DWC, 10], ["phylum", DWC, 12], ["class", DWC, 10],
      ["occurrenceRemarks", DWC, 40, "wrap"], ["decimalLatitude", DWC, 14, "number"], ["decimalLongitude", DWC, 14, "number"],
      ["geodeticDatum", DWC, 12], ["coordinateUncertaintyInMeters", DWC, 14, "number"], ["informationWithheld", DWC, 30], ["dataGeneralizations", DWC, 34],
      ["associatedMedia", DWC, 16], ["recordedBy", DWC, 18], ["license", DCT, 40], ["rightsHolder", DCT, 18], ["datasetName", DWC, 22]
    ].map(([term, ns, width, type]) => ({ term, uri: ns + term, width, type }));
    const rows = records.map(r => {
      const p = place(r, geoOpts), ranks = DWC_RANKS[r.type] ?? {}, photos = photoCounts.get(r.id) ?? 0, name = unknown(r.name) ? "" : r.name.trim();
      return [r.id, "HumanObservation", "present", r.date, name, name, ranks.kingdom ?? "", ranks.phylum ?? "", ranks.class ?? "",
        r.notes, p.lat ?? "", p.lon ?? "", p.lat === undefined ? "" : "WGS84", p.lat === undefined ? "" : p.uncertainty,
        p.lat === undefined ? p.note : "", p.box ? p.note : "", photos ? `${photos} photo${photos === 1 ? "" : "s"} kept by observer` : "",
        who, lic.url, who, "TERRA field journal"];
    });
    return { terms, rows };
  }

  // Darwin Core Archive (DwC-A): occurrence.txt (tab-separated) + meta.xml + eml.xml, ready for GBIF's
  // IPT or an agency portal. Returns [[path, text], ...]; zip it with TerraXlsx.zipText().
  const xml = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // fieldsEnclosedBy="" means no quoting, so tabs and line breaks inside values become spaces.
  const tsv = v => v === null || v === undefined ? "" : String(v).replace(/[\t\r\n]+/g, " ").trim();
  function archive(records, { exact = false, photoCounts = new Map(), geo, cell, license = LICENSES[0].id, recordedBy = "", title = "", now = new Date(), packageId } = {}) {
    const active = records.filter(r => !r.deletedAt).sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const { terms, rows } = occurrences(active, { exact, photoCounts, geo, cell, license, recordedBy });
    const lic = licenseFor(license), who = String(recordedBy).trim().slice(0, 200), today = now.toISOString().slice(0, 10);
    const dates = active.map(r => r.date).sort();
    const name = String(title).trim().slice(0, 200) || `TERRA field observations${who ? ` by ${who}` : ""}`;
    const occurrence = [terms.map(t => t.term).join("\t"), ...rows.map(r => r.map(tsv).join("\t"))].join("\n") + "\n";
    const meta = `<?xml version="1.0" encoding="UTF-8"?>
<archive xmlns="http://rs.tdwg.org/dwc/text/" metadata="eml.xml">
  <core encoding="UTF-8" fieldsTerminatedBy="\\t" linesTerminatedBy="\\n" fieldsEnclosedBy="" ignoreHeaderLines="1" rowType="http://rs.tdwg.org/dwc/terms/Occurrence">
    <files><location>occurrence.txt</location></files>
    <id index="0"/>
${terms.map((t, i) => `    <field index="${i}" term="${t.uri}"/>`).join("\n")}
  </core>
</archive>
`;
    const party = who ? `<individualName><surName>${xml(who)}</surName></individualName>` : "<organizationName>TERRA user</organizationName>";
    const located = rows.filter(r => r[10] !== "").map(r => [r[10], r[11]]);
    const bounds = located.length && {
      w: Math.min(...located.map(l => l[1])), e: Math.max(...located.map(l => l[1])), s: Math.min(...located.map(l => l[0])), n: Math.max(...located.map(l => l[0]))
    };
    const eml = `<?xml version="1.0" encoding="UTF-8"?>
<eml:eml xmlns:eml="eml://ecoinformatics.org/eml-2.1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="eml://ecoinformatics.org/eml-2.1.1 http://rs.gbif.org/schema/eml-gbif-profile/1.1/eml.xsd" packageId="${xml(packageId ?? `terra-${today}`)}" system="TERRA" scope="system" xml:lang="en">
  <dataset>
    <title xml:lang="en">${xml(name)}</title>
    <creator>${party}</creator>
    <metadataProvider>${party}</metadataProvider>
    <pubDate>${today}</pubDate>
    <language>en</language>
    <abstract><para>${xml(`Field observations recorded with the TERRA field journal (${rows.length} occurrence${rows.length === 1 ? "" : "s"}${dates.length ? `, ${dates[0]} to ${dates[dates.length - 1]}` : ""}). Identifications are the observer's own labels and have not been verified. Locations follow each observation's privacy setting: some are withheld or generalized, as stated in informationWithheld and dataGeneralizations.`)}</para></abstract>
    <intellectualRights><para>This work is licensed under a <ulink url="${lic.url}"><citetitle>${xml(lic.name)}</citetitle></ulink>.</para></intellectualRights>
${bounds || dates.length ? `    <coverage>
${bounds ? `      <geographicCoverage><geographicDescription>Bounding box of the observations with coordinates in this archive.</geographicDescription><boundingCoordinates><westBoundingCoordinate>${bounds.w}</westBoundingCoordinate><eastBoundingCoordinate>${bounds.e}</eastBoundingCoordinate><northBoundingCoordinate>${bounds.n}</northBoundingCoordinate><southBoundingCoordinate>${bounds.s}</southBoundingCoordinate></boundingCoordinates></geographicCoverage>
` : ""}${dates.length ? `      <temporalCoverage><rangeOfDates><beginDate><calendarDate>${dates[0]}</calendarDate></beginDate><endDate><calendarDate>${dates[dates.length - 1]}</calendarDate></endDate></rangeOfDates></temporalCoverage>
` : ""}    </coverage>
` : ""}    <maintenance><description><para>Exported from TERRA on ${today}. Re-export to update.</para></description></maintenance>
    <contact>${party}</contact>
    <methods><methodStep><description><para>Opportunistic observations (no fixed survey protocol) entered by the observer in TERRA. Names are free text; organism groups map to broad Darwin Core ranks (kingdom, phylum, class).</para></description></methodStep></methods>
  </dataset>
</eml:eml>
`;
    return { files: [["occurrence.txt", occurrence], ["meta.xml", meta], ["eml.xml", eml]], count: rows.length, located: located.length };
  }

  // Build the workbook's sheets. records: journal entries; projects: FieldSummary projects.
  function sheets(records, projects, { style = "terra", exact = false, photoCounts = new Map(), now = new Date(), matches = () => true, geo, cell, license = LICENSES[0].id, recordedBy = "" } = {}) {
    const active = records.filter(r => !r.deletedAt).sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const byId = new Map(active.map(r => [r.id, r]));
    const inProjects = new Map();
    for (const p of projects) for (const id of p.observationIds) if (byId.has(id) && matches(p, byId.get(id))) inProjects.set(id, [...(inProjects.get(id) ?? []), p.title]);
    const geoOpts = { exact, ...(geo ? { geo } : {}), ...(cell ? { cell } : {}) };

    const observations = style === "dwc"
      ? (o => ({ name: "Occurrences", columns: o.terms.map(t => ({ header: t.term, type: t.type, width: t.width })), rows: o.rows }))(occurrences(active, { exact, photoCounts, geo, cell, license, recordedBy }))
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
  const filename = (style, today) => style === "dwca" ? `terra-dwca-${today}.zip` : `terra-${style === "dwc" ? "darwin-core" : "journal"}-${today}.xlsx`;
  return Object.freeze({ sheets, place, occurrences, archive, filename, GROUPS, LICENSES });
})();
if (typeof module !== "undefined") module.exports = TerraSheetExport;
