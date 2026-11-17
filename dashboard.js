"use strict";

// Dashboard (Profile): one data set, two views.
// Citizen: your field life — level, streak, species, groups, monthly activity, favourites.
// Professional: data quality and project readiness — identification, location, notes, photos,
// date coverage, per-project completeness and a GBIF/agency readiness checklist.
// summary() is pure; render() draws it. The chosen view is a per-browser preference.
const TerraDashboard = (() => {
  const MODE_KEY = "terra.workspace.v1";
  const GROUPS = { plant: "Plants", fungus: "Fungi", insect: "Insects", mammal: "Mammals", bird: "Birds", fish: "Fish", reptile: "Reptiles & amphibians", other: "Other" };
  const words = t => String(t ?? "").trim().split(/\s+/).filter(Boolean).length;
  const unknown = n => typeof n !== "string" || !n.trim() || n.trim().toLowerCase() === "unknown";
  const located = r => Boolean(r.location && r.location.kind !== "withheld" && r.location.space === "terra-geo-v1");
  const ratio = (n, d) => d ? n / d : 0;
  const monthKey = d => d.slice(0, 7);
  const speciesKeyFor = records => (typeof TerraXP !== "undefined" ? TerraXP : require("./xp.js")).speciesKey(records);

  function summary(records, projects, { matches = () => true, photoCounts = new Map(), today } = {}) {
    const active = records.filter(r => !r.deletedAt);
    const n = active.length;
    const species = new Map(), keyOf = speciesKeyFor(active);
    for (const r of active) {
      const k = keyOf(r);
      if (!k) continue;
      const prev = species.get(k);
      species.set(k, { name: prev?.name ?? (unknown(r.name) ? r.taxon.scientificName : r.name.trim()), scientific: prev?.scientific || r.taxon?.scientificName || "", count: (prev?.count ?? 0) + 1 });
    }
    const groups = Object.entries(GROUPS).map(([id, label]) => ({ id, label, count: active.filter(r => r.type === id).length })).filter(g => g.count).sort((a, b) => b.count - a.count);
    // The last 12 months, oldest first, ending with this month.
    const end = today ?? new Date().toLocaleDateString("en-CA");
    const months = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1 - i, 1)); months.push(d.toISOString().slice(0, 7)); }
    const perMonth = months.map(m => ({ month: m, count: active.filter(r => monthKey(r.date) === m).length }));
    const dates = active.map(r => r.date).sort();
    const quality = {
      total: n,
      identified: active.filter(r => r.taxon).length,
      named: active.filter(r => !unknown(r.name)).length,
      located: active.filter(located).length,
      exact: active.filter(r => r.privacy === "exact").length,
      approximate: active.filter(r => r.privacy === "approximate").length,
      hidden: active.filter(r => r.privacy === "hidden").length,
      notes: active.filter(r => words(r.notes) >= 15).length,
      photos: active.filter(r => (photoCounts.get(r.id) ?? 0) > 0).length,
      first: dates[0] ?? null, last: dates[dates.length - 1] ?? null
    };
    const byId = new Map(active.map(r => [r.id, r]));
    const projectRows = projects.map(p => {
      const members = p.observationIds.map(id => byId.get(id)).filter(r => r && matches(p, r));
      return {
        id: p.id, title: p.title, complete: Boolean(p.complete), counted: members.length, missing: p.observationIds.length - members.length,
        start: p.date || null, end: p.endDate || p.date || null,
        identified: ratio(members.filter(r => r.taxon).length, members.length), located: ratio(members.filter(located).length, members.length)
      };
    });
    // Readiness for GBIF / agency submission: what a data manager will ask about first.
    const checks = [
      { id: "records", ok: n >= 1, label: "Has observations", detail: `${n} active observation${n === 1 ? "" : "s"}` },
      { id: "identified", ok: n > 0 && ratio(quality.identified, n) >= 0.8, label: "Scientific names on 80%+", detail: `${Math.round(ratio(quality.identified, n) * 100)}% have a scientific name (use the TERRA agent or Species info)` },
      { id: "located", ok: n > 0 && ratio(quality.located, n) >= 0.8, label: "Map locations on 80%+", detail: `${Math.round(ratio(quality.located, n) * 100)}% have a map location; Hidden records are exported without one` },
      { id: "notes", ok: n > 0 && ratio(quality.notes, n) >= 0.5, label: "Field notes on half", detail: `${Math.round(ratio(quality.notes, n) * 100)}% have 15+ words of notes (habitat, behaviour, count)` },
      { id: "projects", ok: projectRows.every(p => !p.missing), label: "No missing project references", detail: projectRows.some(p => p.missing) ? `${projectRows.reduce((s, p) => s + p.missing, 0)} project reference(s) point to deleted or out-of-scope records` : "All project references resolve" }
    ];
    return { n, species: species.size, top: [...species.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5), groups, perMonth, quality, projects: projectRows, checks, days: new Set(active.map(r => r.date)).size };
  }

  // ---- rendering ----
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const pct = x => `${Math.round(x * 100)}%`;
  const MONTH = m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en", { month: "short", timeZone: "UTC" });
  function tile(label, value, sub) {
    const t = el("div", "dash-tile");
    t.append(el("span", "dash-label", label), el("strong", "dash-value", value));
    if (sub) t.append(el("small", "", sub));
    return t;
  }
  // Horizontal bars, one hue; each bar is labelled with its value (no colour-only reading).
  function bars(rows, title) {
    const wrap = el("figure", "dash-bars");
    wrap.append(el("figcaption", "", title));
    const max = Math.max(1, ...rows.map(r => r.value));
    const list = el("ul");
    for (const r of rows) {
      const li = el("li");
      li.title = `${r.label}: ${r.value}`;
      const bar = el("span", "dash-bar"); bar.style.setProperty("--w", `${(r.value / max) * 100}%`);
      li.append(el("span", "dash-bar-label", r.label), bar, el("span", "dash-bar-value", String(r.value)));
      list.append(li);
    }
    wrap.append(list);
    return wrap;
  }
  // Monthly activity: 12 columns, one hue, value on hover and in the accessible table.
  function months(perMonth) {
    const fig = el("figure", "dash-months");
    fig.append(el("figcaption", "", "Observations per month (last 12 months)"));
    const max = Math.max(1, ...perMonth.map(m => m.count));
    const plot = el("div", "dash-month-plot"); plot.setAttribute("aria-hidden", "true");
    for (const m of perMonth) {
      const col = el("span", "dash-month");
      col.title = `${MONTH(m.month)} ${m.month.slice(0, 4)}: ${m.count}`;
      const bar = el("span", "dash-month-bar"); bar.style.setProperty("--h", `${(m.count / max) * 100}%`);
      if (!m.count) bar.classList.add("empty");
      col.append(bar, el("span", "dash-month-label", MONTH(m.month)[0]));
      plot.append(col);
    }
    const table = el("table", "visually-hidden");
    const head = el("tr"); head.append(el("th", "", "Month"), el("th", "", "Observations"));
    table.append(head, ...perMonth.map(m => { const tr = el("tr"); tr.append(el("td", "", m.month), el("td", "", String(m.count))); return tr; }));
    fig.append(plot, table);
    return fig;
  }

  function citizen(s, p) {
    const box = el("div", "dash-view");
    const tiles = el("div", "dash-tiles");
    tiles.append(
      tile("Level", `${p.xp.icon} ${p.xp.level}`, p.xp.name),
      tile("Field XP", String(p.xp.xp), p.xp.next ? `${p.xp.toNext} to ${p.xp.next.name}` : "Top level"),
      tile("Streak", `${p.streak.current} day${p.streak.current === 1 ? "" : "s"}`, `Best ${p.streak.longest}`),
      tile("Species", String(s.species), `${s.n} observation${s.n === 1 ? "" : "s"} on ${s.days} day${s.days === 1 ? "" : "s"}`)
    );
    box.append(tiles);
    if (s.groups.length) box.append(bars(s.groups.map(g => ({ label: g.label, value: g.count })), "What you've observed"));
    box.append(months(s.perMonth));
    if (s.top.length) {
      const fav = el("section", "dash-top");
      fav.append(el("h4", "", "Most observed"));
      const ol = el("ol");
      for (const t of s.top) { const li = el("li"); li.append(el("span", "", t.name)); if (t.scientific) li.append(el("em", "", ` ${t.scientific}`)); li.append(el("small", "", ` × ${t.count}`)); ol.append(li); }
      fav.append(ol);
      box.append(fav);
    }
    const xp = el("details", "dash-xp");
    xp.append(el("summary", "", "Where your XP comes from"));
    const table = el("table");
    for (const b of p.xp.breakdown.filter(b => b.count)) { const tr = el("tr"); tr.append(el("td", "", b.label), el("td", "", String(b.count)), el("td", "", `${b.xp} XP`)); table.append(tr); }
    xp.append(table);
    box.append(xp);
    return box;
  }

  function professional(s) {
    const box = el("div", "dash-view");
    const q = s.quality;
    const tiles = el("div", "dash-tiles");
    tiles.append(
      tile("Records", String(q.total), q.first ? `${q.first} → ${q.last}` : "No dates yet"),
      tile("Scientific names", pct(q.total ? q.identified / q.total : 0), `${q.identified} of ${q.total}`),
      tile("Map locations", pct(q.total ? q.located / q.total : 0), `Exact ${q.exact} · Approx ${q.approximate} · Hidden ${q.hidden}`),
      tile("Notes 15+ words", pct(q.total ? q.notes / q.total : 0), `${q.photos} with photos`)
    );
    box.append(tiles);
    const ready = el("section", "dash-checks");
    ready.append(el("h4", "", "Ready for GBIF or an agency portal?"));
    const ul = el("ul");
    for (const c of s.checks) {
      const li = el("li", c.ok ? "ok" : "todo");
      li.append(el("span", "dash-check-mark", c.ok ? "✓" : "!"), el("strong", "", c.label), el("small", "", c.detail));
      li.setAttribute("aria-label", `${c.ok ? "Done" : "To do"}: ${c.label}. ${c.detail}`);
      ul.append(li);
    }
    ready.append(ul);
    box.append(ready);
    const table = el("table", "dash-projects");
    const caption = el("caption", "", s.projects.length ? "Projects" : "No projects yet");
    const head = el("tr");
    for (const h of ["Project", "Status", "Dates", "Records", "Missing", "Named", "Located"]) head.append(el("th", "", h));
    table.append(caption, head);
    for (const pr of s.projects) {
      const tr = el("tr");
      tr.append(el("td", "", pr.title), el("td", "", pr.complete ? "Complete" : "Open"), el("td", "", pr.start ? `${pr.start} → ${pr.end}` : "–"),
        el("td", "", String(pr.counted)), el("td", pr.missing ? "warn" : "", String(pr.missing)), el("td", "", pr.counted ? pct(pr.identified) : "–"), el("td", "", pr.counted ? pct(pr.located) : "–"));
      table.append(tr);
    }
    if (s.projects.length) { const scroll = el("div", "dash-table-scroll"); scroll.append(table); box.append(scroll); }
    else box.append(el("p", "dash-note", "No projects yet. Projects group observations for a survey, site or species and show their completeness here."));
    const actions = el("p", "dash-actions");
    const exp = el("button", "secondary-button", "Export data (Excel, Google Sheets, Darwin Core)");
    exp.type = "button"; exp.dataset.sheetExport = ""; exp.id = "dash-export";
    exp.addEventListener("click", () => document.getElementById("sheet-export-open")?.click());
    actions.append(exp);
    box.append(actions);
    box.append(el("p", "dash-note", "Professional view shows your own data. Organization workspaces with shared projects, roles and release rules come with accounts."));
    return box;
  }

  const readMode = () => { try { return JSON.parse(localStorage.getItem(MODE_KEY))?.mode === "professional" ? "professional" : "citizen"; } catch { return "citizen"; } };
  const writeMode = mode => { try { localStorage.setItem(MODE_KEY, JSON.stringify({ version: 1, mode })); } catch { /* Preference only. */ } };
  let last = null;
  function render(records, projects, p, options) {
    const root = document.getElementById("dashboard-view");
    if (!root) return;
    last = { records, projects, p, options };
    const mode = readMode();
    for (const b of document.querySelectorAll("[data-dashboard-mode]")) b.setAttribute("aria-pressed", String(b.dataset.dashboardMode === mode));
    const s = summary(records, projects, options);
    root.replaceChildren(mode === "professional" ? professional(s) : citizen(s, p));
    document.body.dataset.workspace = mode;
    return s;
  }
  if (typeof document !== "undefined") for (const b of document.querySelectorAll("[data-dashboard-mode]")) b.addEventListener("click", () => {
    writeMode(b.dataset.dashboardMode);
    if (last) render(last.records, last.projects, last.p, last.options);
    document.dispatchEvent(new CustomEvent("terra:workspace-changed"));
  });
  return Object.freeze({ summary, render, readMode, MODE_KEY });
})();
if (typeof module !== "undefined") module.exports = TerraDashboard;
