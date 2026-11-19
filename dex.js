"use strict";

// Field guide ("dex"): a card for every species you've found, plus sets to complete.
// A set's slots are kinds of life; each shows "???" until you log something of that kind.
// Completing a set unlocks a decoration for the jar. Remembers stages so evolutions and
// completed sets are celebrated once. Local participation only.
const TerraDex = (() => {
  const KEY = "terra.dex.v1";
  const SETS = Object.freeze([
    { id: "pond", name: "Pond life", kinds: ["frog", "fish", "duck", "turtle"], reward: { item: "Lily pad", icon: "🪷" } },
    { id: "pollinators", name: "Pollinators", kinds: ["bee", "butterfly", "flower"], reward: { item: "Honey pot", icon: "🍯" } },
    { id: "decomposers", name: "Decomposers", kinds: ["lbm", "shelf", "worm", "snail", "beetle"], reward: { item: "Rotting log", icon: "🪵" } },
    { id: "forestfloor", name: "Forest floor", kinds: ["fern", "moss", "lichen", "sapling"], reward: { item: "Acorn cache", icon: "🌰" } },
    { id: "tiny", name: "Tiny world", kinds: ["microbe", "moss", "lichen", "worm"], reward: { item: "Hand lens", icon: "🔍" } },
    { id: "night", name: "Night watch", kinds: ["owl", "mouse", "hedgehog", "spider"], reward: { item: "Moon lamp", icon: "🌙" } },
    { id: "desert", name: "Desert dwellers", kinds: ["cactus", "lizard", "snake", "scorpion"], reward: { item: "Clay pot", icon: "🏺" } },
    { id: "tidepool", name: "Tide-pool treasures", kinds: ["crab", "seastar", "anemone", "octopus", "shrimp"], reward: { item: "Anchor", icon: "⚓" } },
    { id: "rainforest", name: "Rainforest canopy", kinds: ["parrot", "monkey", "sloth", "orchid"], reward: { item: "Bamboo", icon: "🎋" } }
  ].map(Object.freeze));
  const HINTS = { swim: "Something that swims", fly: "Something with wings", hop: "Something that hops", crawl: "Something that crawls", scurry: "Something quick on its feet", burrow: "Something in the soil", dangle: "Something that hangs by a thread", bask: "Something that suns itself", perch: "Something up in the branches", static: "Something that grows in place" };

  function parse(raw) {
    if (raw === null) return { version: 1, stages: {}, sets: {}, spots: {} };
    const s = JSON.parse(raw);
    const fraction = n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
    if (!s || s.version !== 1 || !s.stages || typeof s.stages !== "object" || Array.isArray(s.stages) || Object.keys(s.stages).length > 2000 ||
        !Object.entries(s.stages).every(([k, v]) => typeof k === "string" && k.length <= 220 && Number.isInteger(v) && v >= 0 && v <= 2) ||
        !s.sets || typeof s.sets !== "object" || !Object.entries(s.sets).every(([k, v]) => SETS.some(x => x.id === k) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ||
        !s.spots || typeof s.spots !== "object" || !Object.entries(s.spots).every(([k, v]) => SETS.some(x => x.id === k) && v && fraction(v.x) && fraction(v.y)))
      throw Error("Unsupported or damaged field guide data");
    return { version: 1, stages: { ...s.stages }, sets: { ...s.sets }, spots: { ...s.spots } };
  }

  // species: TerraLife.species(records). kinds: TerraLife.KINDS.
  function guide(species, kinds) {
    const byKind = new Map();
    for (const sp of species) if (!sp.unknown) byKind.set(sp.kind, [...(byKind.get(sp.kind) ?? []), sp]);
    const sets = SETS.map(set => {
      const slots = set.kinds.map(kind => ({ kind, name: kinds[kind].name, icon: kinds[kind].icon ?? null, hint: HINTS[kinds[kind].move] ?? "Something new", found: byKind.get(kind)?.[0] ?? null }));
      const found = slots.filter(s => s.found).length;
      return { ...set, slots, found, complete: found === slots.length };
    });
    return { cards: species.filter(sp => !sp.unknown), sets, completeSets: sets.filter(s => s.complete).length };
  }

  // Compare with what was celebrated before. The first time a species is seen it's a "new" card,
  // not an evolution. Returns the new state and what to announce.
  function update(state, species, g, today) {
    const stages = { ...state.stages }, sets = { ...state.sets }, evolved = [], completed = [], added = [];
    for (const sp of species) {
      if (sp.unknown) continue;
      const before = stages[sp.key];
      if (before === undefined) added.push(sp);
      else if (sp.stage > before) evolved.push(sp);
      stages[sp.key] = Math.max(before ?? 0, sp.stage);
    }
    for (const set of g.sets) if (set.complete && !sets[set.id]) { sets[set.id] = today; completed.push(set); }
    return { state: { version: 1, stages, sets, spots: { ...state.spots } }, evolved, completed, added };
  }
  // Decorations earned by completed sets, with saved spots.
  const rewards = state => SETS.filter(s => state.sets[s.id]).map((s, i) => ({ id: s.id, item: s.reward.item, icon: s.reward.icon, note: `Reward for completing “${s.name}” on ${state.sets[s.id]}.`, ...(state.spots[s.id] ?? { x: [0.82, 0.12, 0.44, 0.68, 0.3, 0.9, 0.55, 0.2][i % 8], y: 0.6 }) }));
  function move(state, setId, x, y) {
    const r = n => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
    return { ...state, spots: { ...state.spots, [setId]: { x: r(x), y: r(y) } } };
  }
  return Object.freeze({ KEY, SETS, parse, guide, update, rewards, move });
})();
if (typeof module !== "undefined") module.exports = TerraDex;
