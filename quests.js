"use strict";

// Field quests: small daily and weekly missions checked against your own journal.
// Three daily quests and two weekly quests are picked the same way for everyone on a given
// day/week (seeded by the date), so they're stable all day. Finishing one earns a reward for the
// terrarium: daily quests give a seed packet (a flower in the jar's garden), weekly quests give a
// decoration. Rewards are local participation only, with no monetary value. Missed days never
// cost anything; the only running total is how many days you've finished a quest.
const TerraQuests = (() => {
  const KEY = "terra.quests.v1";
  const unknown = name => typeof name !== "string" || !name.trim() || name.trim().toLowerCase() === "unknown";
  const words = r => `${r.name} ${r.notes ?? ""}`.toLowerCase();
  const COLORS = {
    purple: ["purple", "violet", "lavender", "lilac", "magenta", "mauve"],
    yellow: ["yellow", "golden", "gold", "lemon"],
    red: ["red", "scarlet", "crimson", "ruby"],
    blue: ["blue", "azure", "indigo", "cobalt"],
    white: ["white", "ivory", "snowy", "pale"]
  };
  const colorQuest = color => ({ id: `color-${color}`, kind: "color", text: `Find something ${color} and mention “${color}” in its name or notes`, target: 1,
    count: rs => rs.filter(r => COLORS[color].some(w => new RegExp(`\\b${w}\\b`).test(words(r)))).length });
  const groupQuest = (type, text) => ({ id: `group-${type}`, kind: "group", text, target: 1, count: rs => rs.filter(r => r.type === type).length });
  const DAILY = Object.freeze([
    { id: "any", kind: "base", text: "Record any find today", target: 1, count: rs => rs.length },
    { id: "two", kind: "count", text: "Record two finds today", target: 2, count: rs => rs.length },
    { id: "unknown", kind: "special", text: "Record something you can't name yet (“Unknown” is fine)", target: 1, count: rs => rs.filter(r => unknown(r.name)).length },
    { id: "notes", kind: "special", text: "Write at least 15 words of notes about a find", target: 1, count: rs => rs.filter(r => (r.notes ?? "").trim().split(/\s+/).filter(Boolean).length >= 15).length },
    groupQuest("plant", "Record a plant today"),
    groupQuest("fungus", "Find a fungus today"),
    groupQuest("insect", "Find an insect or other bug today"),
    groupQuest("bird", "Spot a bird today"),
    ...Object.keys(COLORS).map(colorQuest)
  ].map(Object.freeze));
  const WEEKLY = Object.freeze([
    { id: "fungi3", text: "Find 3 fungi this week", target: 3, count: rs => rs.filter(r => r.type === "fungus").length },
    { id: "days3", text: "Record on 3 different days this week", target: 3, count: rs => new Set(rs.map(r => r.date)).size },
    { id: "groups3", text: "Observe 3 different groups this week", target: 3, count: rs => new Set(rs.map(r => r.type).filter(t => t !== "other")).size },
    { id: "finds5", text: "Record 5 finds this week", target: 5, count: rs => rs.length },
    { id: "new2", text: "Record 2 organisms you've never recorded before", target: 2,
      count: (rs, before) => { const old = new Set(before.filter(r => !unknown(r.name)).map(r => r.name.trim().toLowerCase())); return new Set(rs.filter(r => !unknown(r.name)).map(r => r.name.trim().toLowerCase()).filter(n => !old.has(n))).size; } },
    { id: "insects2", text: "Find 2 insects this week", target: 2, count: rs => rs.filter(r => r.type === "insect").length },
    { id: "plants3", text: "Record 3 plants this week", target: 3, count: rs => rs.filter(r => r.type === "plant").length }
  ].map(Object.freeze));
  // Rewards. Seeds become flowers in the jar's garden; decorations can be dragged around.
  const SEEDS = Object.freeze([
    { id: "sunflower", item: "Sunflower", icon: "🌻" }, { id: "tulip", item: "Tulip", icon: "🌷" },
    { id: "daisy", item: "Daisy", icon: "🌼" }, { id: "hibiscus", item: "Hibiscus", icon: "🌺" }, { id: "rose", item: "Rose", icon: "🌹" }
  ].map(Object.freeze));
  const DECOR = Object.freeze([
    { id: "lantern", item: "Lantern", icon: "🏮", note: "Glows at night." },
    { id: "birdbath", item: "Birdbath", icon: "🛁", note: "Birds stop by for a splash." },
    { id: "chime", item: "Wind chime", icon: "🎐", note: "Sways in the breeze." },
    { id: "stones", item: "Stepping stones", icon: "🪨", note: "A little path through the garden." },
    { id: "feeder", item: "Bird feeder", icon: "🪵", note: "Birds and mice come to eat." },
    { id: "fairyring", item: "Fairy ring", icon: "🍄", note: "A circle of tiny mushrooms." }
  ].map(Object.freeze));

  // Deterministic pick from a pool, seeded by text (e.g. the date).
  const hash = text => { let h = 2166136261; for (const c of text) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  function choose(pool, seed, n, fits = () => true) {
    const order = pool.map((q, i) => ({ q, k: hash(`${seed}:${q.id}:${i}`) })).sort((a, b) => a.k - b.k).map(x => x.q);
    const picked = [];
    for (const q of order) if (picked.length < n && fits(q, picked)) picked.push(q);
    return picked;
  }
  const shift = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  // Weeks start on Monday.
  const weekStart = date => shift(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

  // Today's quests with progress. `records` must already be active, valid journal entries.
  function board(records, today) {
    const week = weekStart(today);
    // Always include "Record any find today"; at most one color quest and one group quest a day.
    const daily = [DAILY[0], ...choose(DAILY.slice(1), today, 2, (q, picked) => !(q.kind !== "count" && q.kind !== "special" && picked.some(p => p.kind === q.kind)))];
    const weekly = choose(WEEKLY, week, 2);
    const todays = records.filter(r => r.date === today);
    const thisWeek = records.filter(r => r.date >= week && r.date <= today);
    const before = records.filter(r => r.date < week);
    const rows = (list, rs, scope, period) => list.map(q => {
      const count = Math.min(q.target, q.count(rs, before));
      return { id: q.id, scope, period, key: `${period}/${scope}/${q.id}`, text: q.text, target: q.target, count, done: count >= q.target };
    });
    return { today, week, daily: rows(daily, todays, "daily", today), weekly: rows(weekly, thisWeek, "weekly", week) };
  }

  function parse(raw) {
    if (raw === null) return { version: 1, claimed: {}, spots: {} };
    const s = JSON.parse(raw);
    const okKey = k => /^\d{4}-\d{2}-\d{2}\/(daily|weekly)\/[a-z0-9-]+$/.test(k);
    const okReward = r => r && /^[a-f0-9]{32}$/.test(r.token) && ((r.type === "seed" && SEEDS.some(x => x.id === r.id)) || (r.type === "decor" && DECOR.some(x => x.id === r.id)));
    const fraction = n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
    if (!s || s.version !== 1 || typeof s.claimed !== "object" || !s.claimed || Array.isArray(s.claimed) || Object.keys(s.claimed).length > 5000 ||
        !Object.entries(s.claimed).every(([k, r]) => okKey(k) && okReward(r)) ||
        typeof s.spots !== "object" || !s.spots || !Object.entries(s.spots).every(([t, p]) => /^[a-f0-9]{32}$/.test(t) && p && fraction(p.x) && fraction(p.y)))
      throw Error("Unsupported or damaged quest data");
    return { version: 1, claimed: { ...s.claimed }, spots: { ...s.spots } };
  }
  // Award any finished, unclaimed quests. Returns the new state and what was just earned.
  function claim(state, boardNow, randomToken) {
    const next = { version: 1, claimed: { ...state.claimed }, spots: { ...state.spots } };
    const earned = [];
    const owned = type => Object.values(next.claimed).filter(r => r.type === type).length;
    for (const q of [...boardNow.daily, ...boardNow.weekly]) {
      if (!q.done || next.claimed[q.key]) continue;
      const reward = q.scope === "daily"
        ? { type: "seed", id: SEEDS[hash(q.key) % SEEDS.length].id }
        : { type: "decor", id: DECOR[owned("decor") % DECOR.length].id };
      reward.token = randomToken();
      next.claimed[q.key] = reward;
      earned.push({ quest: q, reward: { ...reward, ...(reward.type === "seed" ? SEEDS : DECOR).find(x => x.id === reward.id) } });
    }
    return { state: next, earned };
  }
  function move(state, token, x, y) {
    const round = n => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
    return { ...state, spots: { ...state.spots, [token]: { x: round(x), y: round(y) } } };
  }
  // Gentle totals: they only ever go up.
  function stats(state) {
    const days = new Set(Object.keys(state.claimed).filter(k => k.includes("/daily/")).map(k => k.slice(0, 10)));
    return { questDays: days.size, quests: Object.keys(state.claimed).length,
      seeds: Object.values(state.claimed).filter(r => r.type === "seed").length, decor: Object.values(state.claimed).filter(r => r.type === "decor").length };
  }
  // Everything the jar needs: planted seeds (oldest first) and decorations with saved spots.
  function inventory(state) {
    const entries = Object.entries(state.claimed).sort(([a], [b]) => a.localeCompare(b));
    return {
      seeds: entries.filter(([, r]) => r.type === "seed").map(([key, r]) => ({ ...SEEDS.find(s => s.id === r.id), token: r.token, planted: key.slice(0, 10) })),
      decor: entries.filter(([, r]) => r.type === "decor").map(([, r]) => ({ ...DECOR.find(d => d.id === r.id), token: r.token, ...(state.spots[r.token] ?? {}) }))
    };
  }
  return Object.freeze({ KEY, DAILY, WEEKLY, SEEDS, DECOR, board, parse, claim, move, stats, inventory, weekStart });
})();
if (typeof module !== "undefined") module.exports = TerraQuests;
