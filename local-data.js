"use strict";
// Shared pure rules for journal records and project sites.
// Two location spaces:
// - "terra-geo-v1": real places. x = longitude, y = latitude (WGS84 degrees). New records use this.
// - "terra-local-grid-v1": the earlier imaginary 0–100 grid. Still valid for older records and projects.
// Privacy is the same in both: Exact keeps a point; Approximate keeps only a region snapped outward
// to coarse cells (0.1° geo / 10 grid units, at least 2 cells each way); Hidden keeps nothing.
const TerraData = (() => {
  const SPACE = "terra-local-grid-v1";
  const GEO = "terra-geo-v1";
  const GEO_CELL = 0.1, GEO_EXACT_DECIMALS = 5;
  const RETENTION = 3 * 24 * 60 * 60 * 1000;
  function today(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  function date(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000") &&
      Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  }
  const observationDate = value => date(value) && value <= today();
  const unit = n => Number.isInteger(n) && n >= 0 && n <= 100;
  const rect = r => r && [r.x1, r.y1, r.x2, r.y2].every(unit) && r.x1 < r.x2 && r.y1 < r.y2;
  const places = (n, d) => Math.abs(n * 10 ** d - Math.round(n * 10 ** d)) < 1e-6;
  const lng = n => typeof n === "number" && Number.isFinite(n) && n >= -180 && n <= 180 && places(n, GEO_EXACT_DECIMALS);
  const lat = n => typeof n === "number" && Number.isFinite(n) && n >= -90 && n <= 90 && places(n, GEO_EXACT_DECIMALS);
  const geoRect = r => r && lng(r.x1) && lng(r.x2) && lat(r.y1) && lat(r.y2) && r.x1 < r.x2 && r.y1 < r.y2;
  const boundary = b => b && b.version === 1 && ((b.space === SPACE && rect(b)) || (b.space === GEO && geoRect(b)));
  function location(l, privacy) {
    if (!l || l.version !== 1 || (l.space !== SPACE && l.space !== GEO)) return false;
    const keys = Object.keys(l).sort().join(",");
    if (privacy === "hidden") return l.kind === "withheld" && keys === "kind,space,version";
    if (l.space === GEO) {
      if (privacy === "exact") return l.kind === "point" && lng(l.x) && lat(l.y) && keys === "kind,space,version,x,y";
      return privacy === "approximate" && l.kind === "region" && geoRect(l) && [l.x1, l.y1, l.x2, l.y2].every(n => places(n, 1)) &&
        l.x2 - l.x1 >= 2 * GEO_CELL - 1e-9 && l.y2 - l.y1 >= 2 * GEO_CELL - 1e-9 && keys === "kind,space,version,x1,x2,y1,y2";
    }
    if (privacy === "exact") return l.kind === "point" && unit(l.x) && unit(l.y) && keys === "kind,space,version,x,y";
    return privacy === "approximate" && l.kind === "region" && rect(l) &&
      [l.x1, l.y1, l.x2, l.y2].every(n => n % 10 === 0) && l.x2 - l.x1 >= 20 && l.y2 - l.y1 >= 20 && keys === "kind,space,version,x1,x2,y1,y2";
  }
  function inside(b, l) {
    if (!boundary(b) || !l || l.space !== b.space) return false;
    if (l.kind === "point") return location(l, "exact") && l.x >= b.x1 && l.x <= b.x2 && l.y >= b.y1 && l.y <= b.y2;
    return location(l, "approximate") && l.x1 >= b.x1 && l.x2 <= b.x2 && l.y1 >= b.y1 && l.y2 <= b.y2;
  }
  const timestamp = v => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  const expired = (r, now = Date.now()) => Boolean(r.deletedAt && now >= Date.parse(r.deletedAt) + RETENTION);
  const active = records => records.filter(r => !r.deletedAt);
  const retain = (records, now = Date.now()) => records.filter(r => !expired(r, now));
  function optional(r) {
    return (!Object.hasOwn(r, "location") || location(r.location, r.privacy)) &&
      (!Object.hasOwn(r, "deletedAt") || timestamp(r.deletedAt));
  }
  function pick(r) {
    const { id, type, name, notes, date, privacy } = r;
    return { id, type, name, notes, date, privacy, ...(r.location ? { location: { ...r.location } } : {}), ...(r.deletedAt ? { deletedAt: r.deletedAt } : {}) };
  }
  return { SPACE, GEO, GEO_CELL, RETENTION, today, date, observationDate, boundary, location, inside, timestamp, expired, active, retain, optional, pick };
})();
if (typeof module !== "undefined") module.exports = TerraData;
