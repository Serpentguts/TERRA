"use strict";

// Local presentation only. Never store observation snapshots, photos or locations here.
const TerraFeed = (() => {
  const KEY = "terra.feed.v1";
  const types = Object.freeze({ observation: "Observation / discovery", offering: "Offering / sale", cultivated: "Cultivated plant", update: "Field update" });
  const profiles = Object.freeze([
    { id: "moss", name: "Moss · mock profile", icon: "🍄", bio: "Fictional woodland wanderer. No real person or identification authority." },
    { id: "fern", name: "Fern · mock profile", icon: "🌿", bio: "Fictional garden grower. Nothing offered here is available to buy." },
    { id: "robin", name: "Robin · mock profile", icon: "🐦", bio: "Fictional neighborhood naturalist. All sightings are invented." }
  ]);
  const samples = Object.freeze([
    { author: "moss", type: "observation", title: "A fan-shaped finding", body: "Invented observation: a fallen branch, an imaginary woodland morning. Discovery: a possible bracket fungus, unverified. Not a real field record." },
    { author: "fern", type: "offering", title: "Seed swap example", body: "Fictional seed packets for a garden swap. Demo offering / sale only — unavailable, no checkout, contact or transaction." },
    { author: "fern", type: "cultivated", title: "New leaves on the windowsill", body: "An imaginary cultivated basil plant putting out its next pair of leaves." },
    { author: "robin", type: "observation", title: "A visitor to the hedgerow", body: "Invented observation: a small bird, a fictional afternoon, an imaginary hedgerow. Discovery: organism unresolved; no verified identification." },
    { author: "robin", type: "update", title: "Looking a little closer", body: "A fictional field update about noticing textures without disturbing habitat." }
  ]);
  const text = (value, max) => typeof value === "string" && value.length <= max;
  const id = value => text(value, 200) && Boolean(value.trim());
  function validPost(p) {
    return p && Object.hasOwn(types, p.type) && id(p.id) && text(p.title, 120) && Boolean(p.title.trim()) && text(p.body, 3000) &&
      (p.type === "observation" ? id(p.observationId) : p.observationId === null) &&
      typeof p.terra === "boolean" && typeof p.inaturalist === "boolean" && (p.terra || p.inaturalist) &&
      (!p.inaturalist || p.type === "observation") && typeof p.createdAt === "string" &&
      Number.isFinite(Date.parse(p.createdAt)) && new Date(p.createdAt).toISOString() === p.createdAt;
  }
  function parse(raw) {
    if (raw === null) return { version: 1, following: [], posts: [] };
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.following) || !Array.isArray(data.posts) ||
        !data.following.every(value => profiles.some(p => p.id === value)) || new Set(data.following).size !== data.following.length ||
        !data.posts.every(validPost) || new Set(data.posts.map(p => p.id)).size !== data.posts.length) throw Error("Unsupported local feed data");
    // Allowlist fields; storage edits must not introduce record snapshots or publishing flags.
    return { version: 1, following: [...data.following], posts: data.posts.map(({ id, type, title, body, observationId, terra, inaturalist, createdAt }) =>
      ({ id, type, title, body, observationId, terra, inaturalist, createdAt })) };
  }
  return Object.freeze({ KEY, types, profiles, samples, parse, validPost });
})();
if (typeof module !== "undefined") module.exports = TerraFeed;
