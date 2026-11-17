"use strict";

// Field XP and levels: a single number that grows with good field habits.
// Rewards quality and consistency more than volume: at most 5 observations a day earn XP,
// and new species, notes and identifications earn extra. Local participation only, no monetary value.
const TerraXP = (() => {
  const LEVELS = Object.freeze([
    { level: 1, name: "Seedling", icon: "🌱", xp: 0 },
    { level: 2, name: "Sprout", icon: "🌿", xp: 100 },
    { level: 3, name: "Sapling", icon: "🪴", xp: 250 },
    { level: 4, name: "Understory", icon: "🍃", xp: 500 },
    { level: 5, name: "Canopy", icon: "🌳", xp: 900 },
    { level: 6, name: "Old-growth", icon: "🌲", xp: 1500 },
    { level: 7, name: "Ancient forest", icon: "🏞️", xp: 2500 }
  ].map(Object.freeze));
  const RULES = Object.freeze({ observation: 10, notes: 5, identified: 5, newSpecies: 15, fieldDay: 10, quest: 20, rare: 30, review: 2, reviewCorrect: 3, dailyCap: 5,
    streakMilestones: Object.freeze([[3, 25], [7, 50], [14, 100], [30, 200]]) });
  const unknown = name => typeof name !== "string" || !name.trim() || name.trim().toLowerCase() === "unknown";
  const words = text => String(text ?? "").trim().split(/\s+/).filter(Boolean).length;

  // records: active, valid journal entries. extras: { quests, rares, reviews, correct, longestStreak }.
  function compute(records, { quests = 0, rares = 0, reviews = 0, correct = 0, longestStreak = 0 } = {}) {
    const byDay = new Map();
    for (const r of [...records].sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : 1))) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
    const seen = new Set();
    const tally = { observation: 0, notes: 0, identified: 0, newSpecies: 0, fieldDay: 0 };
    for (const [, list] of byDay) {
      tally.fieldDay++;
      for (const r of list.slice(0, RULES.dailyCap)) {
        tally.observation++;
        if (words(r.notes) >= 15) tally.notes++;
        if (r.taxon) tally.identified++;
        const species = (r.taxon?.scientificName ?? (unknown(r.name) ? "" : r.name)).trim().toLowerCase();
        if (species && !seen.has(species)) { seen.add(species); tally.newSpecies++; }
      }
    }
    const milestones = RULES.streakMilestones.filter(([days]) => longestStreak >= days);
    const breakdown = [
      { id: "observation", label: "Observations (up to 5 a day)", count: tally.observation, xp: tally.observation * RULES.observation },
      { id: "fieldDay", label: "Days in the field", count: tally.fieldDay, xp: tally.fieldDay * RULES.fieldDay },
      { id: "newSpecies", label: "New species for you", count: tally.newSpecies, xp: tally.newSpecies * RULES.newSpecies },
      { id: "notes", label: "Detailed notes (15+ words)", count: tally.notes, xp: tally.notes * RULES.notes },
      { id: "identified", label: "Scientific names added", count: tally.identified, xp: tally.identified * RULES.identified },
      { id: "streak", label: "Streak milestones", count: milestones.length, xp: milestones.reduce((n, [, xp]) => n + xp, 0) },
      { id: "quest", label: "Field quests", count: quests, xp: quests * RULES.quest },
      { id: "rare", label: "Rare sightings", count: rares, xp: rares * RULES.rare },
      { id: "review", label: "Practice reviews (+3 if right)", count: reviews, xp: reviews * RULES.review + correct * RULES.reviewCorrect }
    ];
    const xp = breakdown.reduce((n, b) => n + b.xp, 0);
    return { xp, breakdown, species: seen.size, ...level(xp) };
  }
  function level(xp) {
    const current = [...LEVELS].reverse().find(l => xp >= l.xp);
    const next = LEVELS.find(l => l.xp > xp) ?? null;
    const progress = next ? (xp - current.xp) / (next.xp - current.xp) : 1;
    return { level: current.level, name: current.name, icon: current.icon, next, progress: Math.round(progress * 1000) / 1000, toNext: next ? next.xp - xp : 0 };
  }
  return Object.freeze({ LEVELS, RULES, compute, level });
})();
if (typeof module !== "undefined") module.exports = TerraXP;
