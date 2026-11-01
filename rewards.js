"use strict";

// Pure, versioned local participation rules. No verification or financial claims.
const TerraRewards = (() => {
  const KEY = "terra.rewards.v1";
  const labels = { first: "First observation", week: "Seven-day fieldbook", project: "Project completion" };
  const icons = ["🌿", "🍄", "❧", "✿"];
  const colors = ["#214c3c", "#78652a", "#634b7e", "#286579"];
  function parse(raw) {
    if (raw === null) return { version: 1, grants: [] };
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || !Array.isArray(state.grants) || state.grants.length > 3 ||
        state.grants.some(g => !g || !Object.hasOwn(labels, g.badge) || !/^[a-f0-9]{32}$/.test(g.token) || typeof g.placed !== "boolean") ||
        new Set(state.grants.map(g => g.badge)).size !== state.grants.length || new Set(state.grants.map(g => g.token)).size !== state.grants.length) throw Error("Unsupported or damaged rewards data");
    return { version: 1, grants: state.grants.map(({ badge, token, placed }) => ({ badge, token, placed })) };
  }
  function eligible(records, projects, dateOK, matches) {
    const active = records.filter(r => !r.deletedAt && dateOK(r.date));
    const result = active.length ? ["first"] : [];
    const days = [...new Set(active.map(r => r.date))].sort();
    let streak = 0, previous = NaN;
    for (const date of days) {
      const day = Date.parse(`${date}T12:00:00Z`) / 86400000;
      streak = day === previous + 1 ? streak + 1 : 1;
      if (streak >= 7 && !result.includes("week")) result.push("week");
      previous = day;
    }
    if (projects.some(p => p.complete && active.some(r => p.observationIds.includes(r.id) && matches(p, r)))) result.push("project");
    return result;
  }
  function award(state, badges, randomToken) {
    const grants = state.grants.map(g => ({ ...g }));
    for (const badge of new Set(badges)) {
      if (!Object.hasOwn(labels, badge) || grants.some(g => g.badge === badge)) continue;
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
  function decoration(grant) {
    const bytes = grant.token.match(/../g).map(v => parseInt(v, 16));
    return { icon: icons[bytes[0] % icons.length], color: colors[bytes[1] % colors.length],
      size: 28 + bytes[2] % 25, rotation: bytes[3] % 41 - 20, x: 12 + bytes[4] % 76, y: 25 + bytes[5] % 48 };
  }
  return Object.freeze({ KEY, labels, parse, eligible, award, decoration });
})();
if (typeof module !== "undefined") module.exports = TerraRewards;
