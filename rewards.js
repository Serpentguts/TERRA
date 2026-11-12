"use strict";

// Pure, versioned local participation rules. No verification or financial claims.
// Each achievement unlocks one nature item for the profile terrarium, once, ever.
const TerraRewards = (() => {
  const KEY = "terra.rewards.v1";
  // `metric` names a value from progress(); `source: "unavailable"` means TERRA has no
  // genuine evidence for it yet (no accounts, no verification service), so it can be
  // shown as a goal but never unlocked from local data.
  const CATALOG = Object.freeze([
    { id: "first", group: "Field notes", label: "First observation", goal: "Record 1 observation", metric: "observations", target: 1, item: "Sprout", icon: "🌱" },
    { id: "obs5", group: "Field notes", label: "Five observations", goal: "Record 5 observations", metric: "observations", target: 5, item: "Toadstool", icon: "🍄" },
    { id: "obs10", group: "Field notes", label: "Ten observations", goal: "Record 10 observations", metric: "observations", target: 10, item: "Fallen leaves", icon: "🍂" },
    { id: "obs25", group: "Field notes", label: "Twenty-five observations", goal: "Record 25 observations", metric: "observations", target: 25, item: "Wildflower", icon: "🌸" },
    { id: "obs50", group: "Field notes", label: "Fifty observations", goal: "Record 50 observations", metric: "observations", target: 50, item: "Little oak", icon: "🌳" },
    { id: "week", group: "Habits", label: "Seven-day fieldbook", goal: "Observations dated on 7 days in a row", metric: "streak", target: 7, item: "Snail", icon: "🐌" },
    { id: "groups3", group: "Variety", label: "Branching out", goal: "Observe 3 different organism groups", metric: "groups", target: 3, item: "Butterfly", icon: "🦋", layer: "air" },
    { id: "names10", group: "Variety", label: "Ten different names", goal: "Record 10 different named organisms", metric: "names", target: 10, item: "Ladybug", icon: "🐞" },
    { id: "project", group: "Projects", label: "Project completion", goal: "Complete a project with an observation in it", metric: "projects", target: 1, item: "Spiral shell", icon: "🐚", kind: "decoration" },
    { id: "projects3", group: "Projects", label: "Three projects", goal: "Complete 3 projects with observations in them", metric: "projects", target: 3, item: "Stone statue", icon: "🗿", kind: "decoration" },
    { id: "days30", group: "Habits", label: "Thirty field days", goal: "Observe on 30 different days", metric: "days", target: 30, item: "Garden bench", icon: "🪑", kind: "decoration" },
    { id: "groups5", group: "Variety", label: "Five groups", goal: "Observe 5 different organism groups", metric: "groups", target: 5, item: "Mossy rock", icon: "🪨", kind: "decoration" },
    { id: "followers10", group: "Community", label: "Ten followers", goal: "Reach 10 followers", metric: "followers", target: 10, item: "Songbird", icon: "🐦", layer: "air", source: "unavailable", lockedReason: "Coming with real accounts" },
    { id: "verified1", group: "Community", label: "First verified observation", goal: "Get 1 observation verified", metric: "verified", target: 1, item: "Quartz crystal", icon: "💎", kind: "decoration", source: "unavailable", lockedReason: "Coming with identification review" }
  ].map(a => Object.freeze({ kind: "living", ...a })));
  const byId = Object.fromEntries(CATALOG.map(a => [a.id, a]));
  const labels = Object.freeze(Object.fromEntries(CATALOG.map(a => [a.id, a.label])));
  const isUnknown = name => typeof name !== "string" || !name.trim() || name.trim().toLowerCase() === "unknown";

  // Optional saved spot for an item you've moved in the terrarium: fractions of the jar (0–1).
  const fraction = n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  const spot = g => (g.x === undefined && g.y === undefined) || (fraction(g.x) && fraction(g.y));
  function parse(raw) {
    if (raw === null) return { version: 1, grants: [] };
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || !Array.isArray(state.grants) || state.grants.length > CATALOG.length ||
        state.grants.some(g => !g || !Object.hasOwn(byId, g.badge) || byId[g.badge].source === "unavailable" ||
          !/^[a-f0-9]{32}$/.test(g.token) || typeof g.placed !== "boolean" || !spot(g)) ||
        new Set(state.grants.map(g => g.badge)).size !== state.grants.length || new Set(state.grants.map(g => g.token)).size !== state.grants.length) throw Error("Unsupported or damaged rewards data");
    return { version: 1, grants: state.grants.map(({ badge, token, placed, x, y }) => ({ badge, token, placed, ...(x === undefined ? {} : { x, y }) })) };
  }
  // Counts only from active, valid, non-future journal records. Self-reported fields such as
  // `verified` or `followers` on records are ignored: they are not evidence.
  function progress(records, projects, dateOK, matches) {
    const active = records.filter(r => !r.deletedAt && dateOK(r.date));
    const days = [...new Set(active.map(r => r.date))].sort();
    let streak = 0, run = 0, previous = NaN;
    for (const date of days) {
      const day = Date.parse(`${date}T12:00:00Z`) / 86400000;
      run = day === previous + 1 ? run + 1 : 1;
      streak = Math.max(streak, run);
      previous = day;
    }
    return {
      observations: active.length,
      days: days.length,
      streak,
      groups: new Set(active.map(r => r.type).filter(t => t && t !== "other")).size,
      names: new Set(active.filter(r => !isUnknown(r.name)).map(r => r.name.trim())).size,
      projects: projects.filter(p => p.complete && active.some(r => p.observationIds.includes(r.id) && matches(p, r))).length,
      followers: null,
      verified: null
    };
  }
  function eligible(records, projects, dateOK, matches) {
    const counts = progress(records, projects, dateOK, matches);
    return CATALOG.filter(a => a.source !== "unavailable" && counts[a.metric] !== null && counts[a.metric] >= a.target).map(a => a.id);
  }
  function award(state, badges, randomToken) {
    const grants = state.grants.map(g => ({ ...g }));
    for (const badge of new Set(badges)) {
      if (!Object.hasOwn(byId, badge) || byId[badge].source === "unavailable" || grants.some(g => g.badge === badge)) continue;
      // Bounded collision handling; never silently issue a duplicate local collectible.
      let token;
      for (let i = 0; i < 8; i++) {
        const candidate = randomToken();
        if (/^[a-f0-9]{32}$/.test(candidate) && !grants.some(g => g.token === candidate)) { token = candidate; break; }
      }
      if (!token) throw Error("Could not generate a distinct local decoration");
      grants.push({ badge, token, placed: true });
    }
    return { version: 1, grants };
  }
  // Each item is always the same nature object; its serial gives it a unique size, tilt and spot.
  function decoration(grant) {
    const bytes = grant.token.match(/../g).map(v => parseInt(v, 16));
    const air = byId[grant.badge]?.layer === "air";
    return { icon: byId[grant.badge]?.icon ?? "🌿", layer: air ? "air" : "ground",
      size: 30 + bytes[2] % 19, rotation: bytes[3] % 21 - 10, x: 10 + bytes[4] % 80, y: air ? 14 + bytes[5] % 26 : 54 + bytes[5] % 6 };
  }
  // Deterministic placement: nudge items along their layer so none sit on top of each other.
  function layout(grants, gap = 12) {
    const taken = { air: [], ground: [] };
    return grants.map(grant => {
      const d = decoration(grant), row = taken[d.layer];
      let x = d.x;
      for (let i = 0; i < 8 && row.some(other => Math.abs(other - x) < gap); i++) x = 10 + (x - 10 + gap + 3) % 80;
      row.push(x);
      return { grant, ...d, x };
    });
  }
  // Store where an item was moved to (rounded so the file stays small).
  function move(state, badge, x, y) {
    const grants = state.grants.map(g => g.badge === badge ? { ...g, x: Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000, y: Math.round(Math.min(1, Math.max(0, y)) * 1000) / 1000 } : { ...g });
    return { version: 1, grants };
  }
  return Object.freeze({ KEY, CATALOG, labels, parse, progress, eligible, award, decoration, layout, move });
})();
if (typeof module !== "undefined") module.exports = TerraRewards;
