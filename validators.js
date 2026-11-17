"use strict";

// Validators: who can help confirm identifications, and how much their vote counts.
// Participation (XP level) UNLOCKS review tiers. Vote WEIGHT comes from a proven track record:
// the share of reviews that matched the reference answer, discounted for small samples (Wilson
// lower bound), and capped so no single reviewer can decide a record alone.
// Until accounts exist, reviews run on a practice set with known reference answers.
const TerraValidators = (() => {
  const KEY = "terra.validator.v1";
  const TIERS = Object.freeze([
    { id: "observer", name: "Observer", minLevel: 1, minReviews: 0, minReliability: 0, base: 0, perk: "Record observations and earn XP." },
    { id: "apprentice", name: "Apprentice reviewer", minLevel: 2, minReviews: 0, minReliability: 0, base: 0, perk: "Practice reviews unlock. Your votes don't count yet; you're building a track record." },
    { id: "validator", name: "Validator", minLevel: 3, minReviews: 12, minReliability: 0.6, base: 1, perk: "Your votes count toward community agreement." },
    { id: "senior", name: "Senior validator", minLevel: 5, minReviews: 20, minReliability: 0.75, base: 1.5, perk: "Higher vote weight and you can flag records for expert review." }
  ].map(Object.freeze));
  const MAX_WEIGHT = 2, MAX_SHARE = 0.4;

  // Practice set: clues with a single well-established answer. Educational; not identification advice.
  const PRACTICE = Object.freeze([
    { id: "p01", group: "fungus", clue: "Red cap with white warty flecks, white gills and a ring on the stem, growing under birch or pine.", options: ["Fly agaric", "Chanterelle", "Shaggy mane", "Turkey tail"], answer: 0, why: "The red cap with white warts is the classic fly agaric (Amanita muscaria). It's poisonous." },
    { id: "p02", group: "fungus", clue: "Thin, leathery, fan-shaped brackets in overlapping tiers on a dead log, banded brown, tan and blue-grey, with tiny pores underneath.", options: ["Oyster mushroom", "Turkey tail", "Chicken of the woods", "Fly agaric"], answer: 1, why: "Thin, banded, leathery brackets with pores (not gills) are turkey tail (Trametes versicolor)." },
    { id: "p03", group: "fungus", clue: "Tall white cylindrical cap covered in shaggy scales; the gills turn black and dissolve into inky liquid from the bottom up.", options: ["Puffball", "Fly agaric", "Shaggy mane", "Chanterelle"], answer: 2, why: "Self-digesting (\"deliquescing\") black gills on a shaggy white cap mean shaggy mane (Coprinus comatus)." },
    { id: "p04", group: "fungus", clue: "Soft, fleshy, bright orange-and-yellow shelves with no gills, in large overlapping clusters on oak.", options: ["Chicken of the woods", "Turkey tail", "Chanterelle", "Jack-o'-lantern"], answer: 0, why: "Big sulphur-orange shelves with pores on hardwood are chicken of the woods (Laetiporus)." },
    { id: "p05", group: "fungus", clue: "Golden funnel-shaped mushroom on the ground with blunt, forked ridges (not true gills) running down the stem, and a fruity apricot smell.", options: ["Jack-o'-lantern", "Chanterelle", "Fly agaric", "Shaggy mane"], answer: 1, why: "Blunt false gills and an apricot smell point to a chanterelle. The poisonous jack-o'-lantern has true, sharp gills and grows in clusters on wood." },
    { id: "p06", group: "plant", clue: "Evergreen fern with fronds up to a metre long; each leaflet has a small upward-pointing lobe at its base, like a sword hilt. Shady forests of the Pacific Northwest.", options: ["Bracken", "Western sword fern", "Maidenhair fern", "Deer fern"], answer: 1, why: "The hilt-like lobe on each leaflet is the giveaway for western sword fern (Polystichum munitum)." },
    { id: "p07", group: "plant", clue: "Leaves in groups of three, the middle leaflet on a longer stalk; grows as a shrub or climbing vine and turns red in autumn. \"Leaves of three, let it be.\"", options: ["Virginia creeper", "Poison ivy", "Box elder", "Raspberry"], answer: 1, why: "Three leaflets with a longer-stalked middle one is poison ivy. Virginia creeper has five leaflets." },
    { id: "p08", group: "plant", clue: "Bright orange cup-shaped flowers with four petals that close at night; feathery blue-green leaves. California's state flower.", options: ["Buttercup", "California poppy", "Marigold", "Sticky monkeyflower"], answer: 1, why: "Four orange petals that close at night and feathery blue-green leaves: California poppy (Eschscholzia californica)." },
    { id: "p09", group: "plant", clue: "Tall spikes of pea-like purple-blue flowers above leaves split into 5 to 15 leaflets that radiate like fingers.", options: ["Foxglove", "Lavender", "Lupine", "Larkspur"], answer: 2, why: "Pea-shaped flowers plus palm-like (palmate) leaves mean lupine." },
    { id: "p10", group: "plant", clue: "Yellow flower head that becomes a round white 'clock' of parachute seeds; deeply toothed leaves in a flat rosette; milky sap.", options: ["Dandelion", "Sow thistle", "Buttercup", "Coltsfoot"], answer: 0, why: "One flower per hollow leafless stalk, a seed clock and a basal rosette of toothed leaves: dandelion." },
    { id: "p11", group: "plant", clue: "A grey-green, orange or yellow crust or leafy flakes on bark and rock. It's actually a fungus living in partnership with algae.", options: ["Moss", "Lichen", "Liverwort", "Mold"], answer: 1, why: "A fungus-and-alga partnership is a lichen. Mosses are plants with tiny leaves." },
    { id: "p12", group: "insect", clue: "Orange wings with black veins and white spots on the black borders; the caterpillars eat milkweed. No black line across the hindwing.", options: ["Viceroy", "Painted lady", "Monarch", "Gulf fritillary"], answer: 2, why: "The monarch. Its look-alike, the viceroy, has an extra black line across each hindwing." },
    { id: "p13", group: "insect", clue: "Small, round, shiny red beetle with seven black spots.", options: ["Seven-spotted ladybug", "Asian lady beetle", "Squash beetle", "Milkweed beetle"], answer: 0, why: "Seven black spots on red: the seven-spotted ladybug (Coccinella septempunctata)." },
    { id: "p14", group: "insect", clue: "Big, fuzzy, loud bee with black and yellow bands, carrying balls of pollen on its hind legs as it visits clover.", options: ["Honey bee", "Yellowjacket", "Bumble bee", "Hoverfly"], answer: 2, why: "Large, very hairy and banded: a bumble bee. Honey bees are smaller and slimmer." },
    { id: "p15", group: "insect", clue: "Yellow-and-black striped insect that hovers perfectly still in mid-air; one pair of wings, huge eyes, short antennae, no sting.", options: ["Wasp", "Hoverfly", "Honey bee", "Bumble bee"], answer: 1, why: "One pair of wings and hovering flight make it a fly: a hoverfly mimicking a wasp." },
    { id: "p16", group: "bird", clue: "Thrush-sized bird with a brick-orange breast and grey-brown back, hopping across lawns and pulling up worms. North America.", options: ["American robin", "Eastern bluebird", "Varied thrush", "House finch"], answer: 0, why: "Orange breast, grey back and worm-hunting on lawns: the American robin." },
    { id: "p17", group: "bird", clue: "Crested blue bird with a white face and black necklace, making loud 'jay' calls. Eastern North America.", options: ["Steller's jay", "Blue jay", "Western bluebird", "Belted kingfisher"], answer: 1, why: "Blue crest, white face and black necklace: blue jay. Steller's jay is darker with a black crest." },
    { id: "p18", group: "bird", clue: "Woodpecker with a red cap and a clown-like black-and-white face that stores acorns in hundreds of holes drilled in one tree. Western oak woodlands.", options: ["Downy woodpecker", "Northern flicker", "Acorn woodpecker", "Red-headed woodpecker"], answer: 2, why: "Acorn 'granary' trees are the signature of the acorn woodpecker." },
    { id: "p19", group: "mammal", clue: "Tree-climbing rodent with a long bushy tail, active by day, burying nuts one at a time in the ground.", options: ["Chipmunk", "Tree squirrel", "Woodrat", "Flying squirrel"], answer: 1, why: "Daytime, tree-dwelling, bushy-tailed and scatter-hoarding nuts: a tree squirrel. Flying squirrels are nocturnal." },
    { id: "p20", group: "reptile", clue: "Small grey-brown spiny lizard doing push-ups on fences and rocks; males have bright blue patches on the belly. Western United States.", options: ["Western fence lizard", "Alligator lizard", "Skink", "Gecko"], answer: 0, why: "Blue belly patches and push-up displays: western fence lizard (Sceloporus occidentalis)." },
    { id: "p21", group: "other", clue: "Tiny green or brown frog with a dark stripe through the eye and sticky toe pads; spring nights fill with its 'ribbit' chorus. Pacific coast.", options: ["Bullfrog", "Pacific tree frog", "Western toad", "Red-legged frog"], answer: 1, why: "The eye stripe, toe pads and classic 'ribbit' belong to the Pacific tree frog (chorus frog)." },
    { id: "p22", group: "plant", clue: "Tree with lobed leaves and nuts that sit in scaly little cups.", options: ["Maple", "Oak", "Beech", "Chestnut"], answer: 1, why: "Acorns in scaly cups mean an oak (Quercus)." }
  ].map(Object.freeze));

  function parse(raw) {
    if (raw === null) return { version: 1, answers: {} };
    const s = JSON.parse(raw);
    if (!s || s.version !== 1 || !s.answers || typeof s.answers !== "object" || Array.isArray(s.answers) ||
        !Object.entries(s.answers).every(([id, a]) => PRACTICE.some(p => p.id === id) && Number.isInteger(a) && a >= 0 && a < 4)) throw Error("Unsupported or damaged validator data");
    return { version: 1, answers: { ...s.answers } };
  }
  // Answers are final: a practice item can only be answered once.
  function answer(state, id, choice) {
    if (Object.hasOwn(state.answers, id) || !PRACTICE.some(p => p.id === id) || !Number.isInteger(choice) || choice < 0 || choice > 3) return state;
    return { version: 1, answers: { ...state.answers, [id]: choice } };
  }
  // 95% Wilson score lower bound: a cautious estimate of true accuracy from few reviews.
  function wilson(correct, total, z = 1.96) {
    if (!total) return 0;
    const p = correct / total, d = 1 + z * z / total;
    return Math.max(0, (p + z * z / (2 * total) - z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / d);
  }
  function record(state) {
    const answered = Object.entries(state.answers);
    const correct = answered.filter(([id, a]) => PRACTICE.find(p => p.id === id).answer === a).length;
    return { reviews: answered.length, correct, accuracy: answered.length ? correct / answered.length : 0, reliability: wilson(correct, answered.length) };
  }
  // Tier from XP level and track record; weight from tier and reliability, capped.
  function standing(level, stats) {
    const eligible = TIERS.filter(t => level >= t.minLevel && stats.reviews >= t.minReviews && stats.reliability >= t.minReliability);
    const tier = eligible[eligible.length - 1];
    const next = TIERS[TIERS.indexOf(tier) + 1] ?? null;
    const weight = tier.base ? Math.min(MAX_WEIGHT, Math.round(tier.base * (0.5 + stats.reliability) * 100) / 100) : 0;
    const needs = next ? [
      ...(level < next.minLevel ? [`reach level ${next.minLevel}`] : []),
      ...(stats.reviews < next.minReviews ? [`${next.minReviews - stats.reviews} more review${next.minReviews - stats.reviews === 1 ? "" : "s"}`] : []),
      ...(stats.reliability < next.minReliability ? [`a reliability of ${Math.round(next.minReliability * 100)}% (now ${Math.round(stats.reliability * 100)}%)`] : [])
    ] : [];
    return { tier, next, weight, needs };
  }
  // Community agreement on one record. votes: [{ name, weight }]. Each voter's influence is capped at
  // MAX_SHARE of the total, so no one decides alone; agreement needs 2+ voters, total weight >= 2,
  // and the leading name holding at least two-thirds of the weight.
  function consensus(votes) {
    const counted = votes.filter(v => v.weight > 0);
    const total = counted.reduce((n, v) => n + v.weight, 0);
    const capped = counted.map(v => ({ ...v, weight: Math.min(v.weight, MAX_SHARE * total) }));
    const sum = capped.reduce((n, v) => n + v.weight, 0);
    const byName = new Map();
    for (const v of capped) { const k = v.name.trim().toLowerCase(); byName.set(k, { name: byName.get(k)?.name ?? v.name.trim(), weight: (byName.get(k)?.weight ?? 0) + v.weight }); }
    const ranked = [...byName.values()].sort((a, b) => b.weight - a.weight);
    const leader = ranked[0] ?? null, share = leader && sum ? leader.weight / sum : 0;
    // Enough participation is judged on real weight; the cap only limits each voter's share of the decision.
    const status = counted.length < 2 || total < 2 ? "needs-more" : share >= 2 / 3 ? "agreed" : "disputed";
    return { status, leader: leader?.name ?? null, share: Math.round(share * 1000) / 1000, voters: counted.length, weight: Math.round(total * 100) / 100 };
  }
  return Object.freeze({ KEY, TIERS, PRACTICE, MAX_WEIGHT, MAX_SHARE, parse, answer, wilson, record, standing, consensus });
})();
if (typeof module !== "undefined") module.exports = TerraValidators;
