"use strict";

// "Export spreadsheet" buttons on the Journal and Projects screens.
(() => {
  const $ = id => document.getElementById(id);
  const dialog = $("sheet-export"), status = $("sheet-status");
  let opener = null;
  for (const button of document.querySelectorAll("[data-sheet-export]")) button.addEventListener("click", () => {
    opener = button; status.textContent = "";
    if (!dialog.open) dialog.showModal();
  });
  dialog.addEventListener("close", () => opener?.focus());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  $("sheet-download").addEventListener("click", async () => {
    const style = dialog.querySelector('input[name="sheet-style"]:checked')?.value === "dwc" ? "dwc" : "terra";
    const exact = $("sheet-exact").checked;
    let records, projects;
    try {
      records = readObservations();
      projects = FieldSummary.parse(localStorage.getItem(FieldSummary.KEY));
    } catch { status.textContent = "Your journal or projects couldn't be read, so nothing was exported. Your data is unchanged."; return; }
    if (!records.some(r => !r.deletedAt) && !projects.length) { status.textContent = "Nothing to export yet. Record an observation first."; return; }
    let photoCounts = new Map();
    try { if (typeof TerraPhotos !== "undefined") photoCounts = await TerraPhotos.counts(); } catch { /* Photo counts are optional. */ }
    try {
      const sheets = TerraSheetExport.sheets(records, projects, { style, exact, photoCounts, matches: FieldSummary.matches, geo: TerraData.GEO, cell: TerraData.GEO_CELL });
      const bytes = TerraXlsx.build(sheets, { title: "TERRA field journal" });
      const url = URL.createObjectURL(new Blob([bytes], { type: TerraXlsx.MIME }));
      const link = document.createElement("a");
      link.href = url; link.download = TerraSheetExport.filename(style, TerraData.today());
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const count = sheets[0].rows.length;
      status.textContent = `Downloaded ${count} observation${count === 1 ? "" : "s"} and ${projects.length} project${projects.length === 1 ? "" : "s"}${exact ? ", with exact locations. Keep this file private." : "."} Open it in Excel, or import it into Google Sheets.`;
    } catch { status.textContent = "The spreadsheet couldn't be created. Your data is unchanged; please try again."; }
  });
})();
