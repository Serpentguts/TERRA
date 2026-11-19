"use strict";

// "Export spreadsheet" buttons on the Journal and Projects screens.
(() => {
  const $ = id => document.getElementById(id);
  const dialog = $("sheet-export"), status = $("sheet-status");
  let opener = null;
  // Archive-only fields and the right button label for the chosen format.
  const licenseSelect = $("dwca-license");
  for (const l of TerraSheetExport.LICENSES) licenseSelect.append(new Option(l.label, l.id));
  const style = () => { const v = dialog.querySelector('input[name="sheet-style"]:checked')?.value; return ["dwc", "dwca"].includes(v) ? v : "terra"; };
  function syncFormat() {
    const archive = style() === "dwca";
    $("dwca-options").hidden = !archive; $("dwca-help").hidden = !archive;
    $("sheet-google-help").hidden = archive;
    $("sheet-download").textContent = archive ? "Download .zip" : "Download .xlsx";
    status.textContent = "";
  }
  for (const radio of dialog.querySelectorAll('input[name="sheet-style"]')) radio.addEventListener("change", syncFormat);
  for (const button of document.querySelectorAll("[data-sheet-export]")) button.addEventListener("click", () => {
    opener = button; status.textContent = "";
    if (!dialog.open) dialog.showModal();
  });
  dialog.addEventListener("close", () => opener?.focus());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  $("sheet-download").addEventListener("click", async () => {
    const format = style();
    const exact = $("sheet-exact").checked;
    let records, projects;
    try {
      records = readObservations();
      projects = FieldSummary.parse(localStorage.getItem(FieldSummary.KEY));
    } catch { status.textContent = "Your journal or projects couldn't be read, so nothing was exported. Your data is unchanged."; return; }
    if (!records.some(r => !r.deletedAt) && !projects.length) { status.textContent = "Nothing to export yet. Record an observation first."; return; }
    let photoCounts = new Map();
    try { if (typeof TerraPhotos !== "undefined") photoCounts = await TerraPhotos.counts(); } catch { /* Photo counts are optional. */ }
    const save = (bytes, type, name) => {
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      const link = document.createElement("a");
      link.href = url; link.download = name;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const base = { exact, photoCounts, geo: TerraData.GEO, cell: TerraData.GEO_CELL };
    const keepPrivate = exact ? ", with exact locations. Keep this file private." : ".";
    try {
      if (format === "dwca") {
        const archive = TerraSheetExport.archive(records, { ...base, license: licenseSelect.value, recordedBy: $("dwca-recorded-by").value, title: $("dwca-title").value });
        if (!archive.count) { status.textContent = "Nothing to export yet. Record an observation first."; return; }
        save(TerraXlsx.zipText(archive.files), "application/zip", TerraSheetExport.filename("dwca", TerraData.today()));
        status.textContent = `Downloaded a Darwin Core Archive with ${archive.count} occurrence${archive.count === 1 ? "" : "s"} (${archive.located} with coordinates)${keepPrivate}`;
        return;
      }
      const sheets = TerraSheetExport.sheets(records, projects, { ...base, style: format, matches: FieldSummary.matches });
      save(TerraXlsx.build(sheets, { title: "TERRA field journal" }), TerraXlsx.MIME, TerraSheetExport.filename(format, TerraData.today()));
      const count = sheets[0].rows.length;
      status.textContent = `Downloaded ${count} observation${count === 1 ? "" : "s"} and ${projects.length} project${projects.length === 1 ? "" : "s"}${exact ? ", with exact locations. Keep this file private." : "."} Open it in Excel, or import it into Google Sheets.`;
    } catch { status.textContent = "The file couldn't be created. Your data is unchanged; please try again."; }
  });
})();
