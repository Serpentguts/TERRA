"use strict";

// Nature data for the terrarium: which creature or plant each journal find becomes,
// field-guide facts for everything that can live in the jar, and rare ("shiny") variants.
// Facts are short, general and safe; they're not identification advice.
const TerraLife = (() => {
  // move: how it behaves. hop / crawl / fly / swim / burrow / dangle / bask / static (grows in place).
  const KINDS = Object.freeze({
    frog: { name: "Frog", icon: "🐸", move: "hop", fact: "Frogs absorb water through their skin, so many species depend on damp places and are sensitive to pollution." },
    fern: { name: "Fern", draw: "fern", move: "static", fact: "Ferns don't make flowers or seeds. They reproduce with spores, often in dots on the underside of their fronds." },
    bee: { name: "Bee", icon: "🐝", move: "fly", fact: "Bees carry pollen between flowers as they feed, and honeybees tell each other where food is with a “waggle dance”." },
    ant: { name: "Ant", icon: "🐜", move: "crawl", size: 12, fact: "Ants live as colonies. Some species even farm aphids for the sugary honeydew they produce." },
    spider: { name: "Spider", icon: "🕷️", move: "dangle", fact: "Spiders aren't insects: they have eight legs and two body parts, and many spin silk webs to catch prey." },
    worm: { name: "Earthworm", icon: "🪱", move: "burrow", fact: "Earthworms tunnel and eat decaying matter, mixing and airing the soil as they go." },
    caterpillar: { name: "Caterpillar", icon: "🐛", move: "crawl", fact: "A caterpillar is the larva of a butterfly or moth. Inside its chrysalis or cocoon, its body reorganizes into the adult." },
    beetle: { name: "Beetle", icon: "🪲", move: "crawl", fact: "Beetles are the largest known group of animals, with roughly 400,000 described species." },
    butterfly: { name: "Butterfly", icon: "🦋", move: "fly", fact: "Butterflies taste with sensors on their feet and drink nectar through a coiled tongue called a proboscis." },
    ladybug: { name: "Ladybug", icon: "🐞", move: "crawl", size: 13, fact: "Many ladybugs eat aphids and can eat thousands in a lifetime, which makes them welcome in gardens." },
    snail: { name: "Snail", icon: "🐌", move: "crawl", fact: "Land snails glide on a layer of mucus that helps them grip and protects their foot. Many are most active after rain." },
    mouse: { name: "Mouse", icon: "🐁", move: "scurry", fact: "Mice are mostly active at night and are important food for owls, foxes and snakes." },
    squirrel: { name: "Squirrel", icon: "🐿️", move: "scurry", fact: "Squirrels bury nuts and forget some of them, which helps trees like oaks spread." },
    rabbit: { name: "Rabbit", icon: "🐇", move: "hop", fact: "Rabbits are most active at dawn and dusk, a pattern called crepuscular." },
    hedgehog: { name: "Hedgehog", icon: "🦔", move: "scurry", fact: "Hedgehogs eat beetles, worms and slugs, and some hibernate through the winter." },
    lizard: { name: "Lizard", icon: "🦎", move: "bask", fact: "Lizards can't make their own body heat, so they bask in the sun to warm up before hunting." },
    snake: { name: "Snake", icon: "🐍", move: "crawl", fact: "Snakes smell with their tongues, flicking scent particles to a special organ in the roof of the mouth." },
    turtle: { name: "Turtle", icon: "🐢", move: "crawl", fact: "A turtle's shell is part of its skeleton, fused to its ribs and spine." },
    fish: { name: "Fish", icon: "🐟", move: "swim", fact: "Many fish feel movement in the water through a “lateral line” of sensors running along their sides." },
    sparrow: { name: "Bird", icon: "🐦", move: "fly", fact: "Small birds eat huge numbers of insects, especially while feeding their chicks." },
    owl: { name: "Owl", icon: "🦉", move: "perch", fact: "Owls fly almost silently thanks to soft, comb-edged flight feathers." },
    duck: { name: "Duck", icon: "🦆", move: "swim", fact: "Ducks keep dry by spreading oil from a gland near the tail through their feathers." },
    herb: { name: "Plant", draw: "herb", move: "static", fact: "Plants make their food from sunlight, water and carbon dioxide through photosynthesis." },
    flower: { name: "Wildflower", draw: "flower", move: "static", fact: "Wildflowers feed pollinators like bees, butterflies and hoverflies with nectar and pollen." },
    cactus: { name: "Cactus", icon: "🌵", move: "static", fact: "Cacti store water in their stems. Their spines are modified leaves that shade the plant and deter animals." },
    sapling: { name: "Tree seedling", draw: "sapling", move: "static", fact: "A single mature tree can support hundreds of insect species, which in turn feed birds." },
    moss: { name: "Moss", draw: "moss", move: "static", fact: "Mosses have no roots or flowers. They soak up water directly and can grow on bare rock." },
    lbm: { name: "Little brown mushroom", draw: "lbm", move: "static", fact: "“Little brown mushrooms” are notoriously hard to identify and some are deadly. Never eat a wild mushroom without expert confirmation." },
    shelf: { name: "Shelf fungus", draw: "shelf", move: "static", fact: "Shelf (bracket) fungi grow from wood and help break down dead trees, recycling their nutrients." },
    lichen: { name: "Lichen", draw: "lichen", move: "static", fact: "A lichen is a partnership: a fungus living together with algae or cyanobacteria." },
    // Desert, tide-pool and rainforest life (each lives in its own habitat jar).
    scorpion: { name: "Scorpion", icon: "🦂", move: "crawl", habitat: "desert", fact: "Scorpions glow blue-green under ultraviolet light, thanks to compounds in their outer skeleton." },
    crab: { name: "Crab", icon: "🦀", move: "scurry", habitat: "tidepool", fact: "Many shore crabs walk sideways because their leg joints bend that way, which is fastest for them." },
    octopus: { name: "Octopus", icon: "🐙", move: "swim", habitat: "tidepool", fact: "An octopus has three hearts and can change colour and texture in a fraction of a second." },
    shrimp: { name: "Shrimp", icon: "🦐", move: "swim", habitat: "tidepool", fact: "Some small shrimp run 'cleaning stations', picking parasites off visiting fish." },
    seastar: { name: "Sea star", draw: "seastar", move: "static", habitat: "tidepool", fact: "Sea stars can regrow lost arms, and many eat by pushing their stomach out of their body onto prey." },
    anemone: { name: "Sea anemone", draw: "anemone", move: "static", habitat: "tidepool", fact: "Sea anemones are relatives of jellyfish and catch food with stinging tentacles." },
    parrot: { name: "Parrot", icon: "🦜", move: "fly", habitat: "rainforest", fact: "Many parrots live for decades and some learn to mimic sounds, including human speech." },
    monkey: { name: "Monkey", icon: "🐒", move: "perch", habitat: "rainforest", fact: "Many rainforest monkeys spread seeds as they eat fruit, helping the forest regrow." },
    sloth: { name: "Sloth", icon: "🦥", move: "perch", habitat: "rainforest", fact: "Sloths move so slowly that algae grows in their fur, giving them a green camouflage." },
    orchid: { name: "Orchid", draw: "orchid", move: "static", habitat: "rainforest", fact: "Orchids are one of the largest flowering-plant families; many grow on trees without harming them." }
  });
  // Habitat jars. Everything without a habitat lives in the forest jar.
  const HABITATS = Object.freeze({
    forest: { name: "Forest jar", icon: "🌲" },
    desert: { name: "Desert jar", icon: "🌵" },
    tidepool: { name: "Tide-pool jar", icon: "🦀" },
    rainforest: { name: "Rainforest jar", icon: "🦜" }
  });
  const habitatOf = kind => KINDS[kind]?.habitat ?? (["cactus", "lizard", "snake"].includes(kind) ? "desert" : "forest");
  // First match wins. Checked against the find's name.
  const KEYWORDS = Object.freeze([
    [/\b(scorpion)s?\b/i, "scorpion"], [/\b(crab|hermit crab)s?\b/i, "crab"], [/\b(octopus|octopuses|octopi)\b/i, "octopus"], [/\b(shrimp|prawn)s?\b/i, "shrimp"],
    [/\b(sea ?star|starfish)s?\b/i, "seastar"], [/\b(anemone)s?\b/i, "anemone"], [/\b(parrot|macaw|parakeet|toucan|cockatoo)s?\b/i, "parrot"],
    [/\b(monkey|lemur|capuchin|howler|tamarin|marmoset)s?\b/i, "monkey"], [/\b(sloth)s?\b/i, "sloth"], [/\b(orchid|bromeliad)s?\b/i, "orchid"],
    [/\b(frog|toad|tree ?frog|bullfrog|peeper)s?\b/i, "frog"], [/\b(newt|salamander)s?\b/i, "lizard"],
    [/\bferns?\b|\bbracken\b|maidenhair|sword fern/i, "fern"], [/\b(moss|mosses|liverwort)\b/i, "moss"], [/\blichens?\b/i, "lichen"],
    [/\b(bee|bees|bumble ?bee|honey ?bee|wasp|hornet)\b/i, "bee"], [/\bants?\b/i, "ant"], [/\b(spider|tarantula|orb ?weaver|daddy long ?legs)s?\b/i, "spider"],
    [/\b(earth ?worm|worm)s?\b/i, "worm"], [/\b(caterpillar|larva|larvae|grub)s?\b/i, "caterpillar"], [/\b(ladybug|ladybird|lady beetle)s?\b/i, "ladybug"],
    [/\b(butterfly|butterflies|moth|monarch|swallowtail)s?\b/i, "butterfly"], [/\b(beetle|weevil|firefly|fireflies)s?\b/i, "beetle"],
    [/\b(snail|slug)s?\b/i, "snail"], [/\b(squirrel|chipmunk)s?\b/i, "squirrel"], [/\b(rabbit|bunny|hare|cottontail)s?\b/i, "rabbit"],
    [/\b(hedgehog|opossum|possum)s?\b/i, "hedgehog"], [/\b(mouse|mice|vole|shrew|rat)s?\b/i, "mouse"],
    [/\b(snake|garter|rattlesnake|boa|python)s?\b/i, "snake"], [/\b(lizard|gecko|skink|iguana|anole)s?\b/i, "lizard"], [/\b(turtle|tortoise|terrapin)s?\b/i, "turtle"],
    [/\b(owl)s?\b/i, "owl"], [/\b(duck|mallard|goose|geese|swan)s?\b/i, "duck"],
    [/\b(fish|trout|salmon|minnow|carp|koi|bass)\b/i, "fish"],
    [/\b(cactus|cacti|trichocereus|opuntia|prickly pear|saguaro|succulent)\b/i, "cactus"],
    [/\b(oak|maple|pine|redwood|fir|birch|willow|cedar|spruce|sapling|seedling)s?\b/i, "sapling"],
    [/\b(turkey ?tail|bracket|conk|polypore|reishi|chicken of the woods|oyster)\b/i, "shelf"],
    [/\b(poppy|poppies|lupine|daisy|daisies|aster|violet|clover|dandelion|flower|bloom|blossom|rose|lily|orchid|sunflower|iris)\b/i, "flower"]
  ]);
  const GROUP_DEFAULT = Object.freeze({ plant: "herb", fungus: "lbm", insect: "beetle", mammal: "mouse", bird: "sparrow", fish: "fish", reptile: "lizard", other: "lichen" });
  function kindFor(record) {
    const name = String(record.name ?? "");
    for (const [pattern, kind] of KEYWORDS) if (pattern.test(name)) return kind;
    return GROUP_DEFAULT[record.type] ?? "lichen";
  }
  // Up to 3 of each kind and 24 in total, newest finds first, so the jar stays readable.
  function inhabitants(records) {
    const counts = {}, list = [];
    for (const record of [...records].sort((a, b) => b.date.localeCompare(a.date))) {
      const kind = kindFor(record);
      if ((counts[kind] = (counts[kind] ?? 0) + 1) > 3 || list.length >= 24) continue;
      list.push({ id: record.id, kind, name: record.name, date: record.date, type: record.type });
    }
    return list;
  }
  // ---- evolution: one resident per species, growing with repeat sightings ----
  const STAGE_AT = Object.freeze([1, 3, 5]); // sightings needed for stage 1, 2 and 3
  const generic = (kind, young, adult, mighty) => [{ name: young, scale: 0.65 }, { name: adult, scale: 0.85 }, { name: mighty, scale: 1.1, crown: true }];
  const FORMS = Object.freeze({
    frog: [{ name: "Tadpole", draw: "tadpole", move: "swim", scale: 1 }, { name: "Froglet", scale: 0.6 }, { name: "Frog", scale: 1.05, crown: true }],
    butterfly: [{ name: "Caterpillar", icon: "🐛", move: "crawl", scale: 0.8 }, { name: "Chrysalis", draw: "chrysalis", move: "dangle", scale: 1 }, { name: "Butterfly", scale: 1.05, crown: true }],
    caterpillar: [{ name: "Tiny caterpillar", scale: 0.6 }, { name: "Caterpillar", scale: 0.85 }, { name: "Chrysalis", draw: "chrysalis", move: "dangle", scale: 1, crown: true }],
    sparrow: [{ name: "Egg", icon: "🥚", move: "static-icon", scale: 0.6 }, { name: "Chick", icon: "🐣", move: "hop", scale: 0.8 }, { name: "Bird", scale: 1.05, crown: true }],
    owl: [{ name: "Egg", icon: "🥚", move: "static-icon", scale: 0.6 }, { name: "Owlet", icon: "🐣", move: "perch", scale: 0.8 }, { name: "Owl", scale: 1.05, crown: true }],
    duck: [{ name: "Egg", icon: "🥚", move: "static-icon", scale: 0.6 }, { name: "Duckling", icon: "🐥", move: "swim", scale: 0.8 }, { name: "Duck", scale: 1.05, crown: true }],
    parrot: [{ name: "Egg", icon: "🥚", move: "static-icon", scale: 0.6 }, { name: "Chick", icon: "🐣", move: "perch", scale: 0.8 }, { name: "Parrot", scale: 1.05, crown: true }],
    sapling: [{ name: "Seed", draw: "seed", scale: 1 }, { name: "Sapling", scale: 0.75 }, { name: "Young tree", scale: 1.3, crown: true }],
    fern: [{ name: "Fiddlehead", draw: "fiddlehead", scale: 1 }, { name: "Young fern", scale: 0.7 }, { name: "Fern", scale: 1.1, crown: true }],
    lbm: [{ name: "Pin", scale: 0.4 }, { name: "Button", scale: 0.7 }, { name: "Mushroom troop", scale: 1.15, crown: true }],
    shelf: [{ name: "Young bracket", scale: 0.5 }, { name: "Bracket", scale: 0.8 }, { name: "Old bracket", scale: 1.15, crown: true }],
    herb: [{ name: "Seedling", scale: 0.5 }, { name: "Young plant", scale: 0.8 }, { name: "Plant", scale: 1.15, crown: true }],
    flower: [{ name: "Seedling", scale: 0.5 }, { name: "Bud", scale: 0.8, bud: true }, { name: "In bloom", scale: 1.15, crown: true }],
    orchid: [{ name: "Seedling", scale: 0.5 }, { name: "Bud", scale: 0.8, bud: true }, { name: "In bloom", scale: 1.15, crown: true }]
  });
  // The stage for a number of sightings (0, 1 or 2) and the form to draw.
  const stageFor = count => count >= STAGE_AT[2] ? 2 : count >= STAGE_AT[1] ? 1 : 0;
  function form(kind, stage) {
    const k = KINDS[kind], list = FORMS[kind] ?? generic(kind, `Young ${k.name.toLowerCase()}`, k.name, `Mighty ${k.name.toLowerCase()}`);
    const f = list[Math.max(0, Math.min(2, stage))];
    return { name: f.name, icon: f.icon ?? k.icon, draw: f.draw ?? (f.icon ? undefined : k.draw), move: f.move ?? k.move, scale: f.scale ?? 1, crown: Boolean(f.crown), bud: Boolean(f.bud), stage };
  }
  const nextAt = stage => STAGE_AT[stage + 1] ?? null;
  // Card icons for each stage (drawn residents need an emoji stand-in on cards).
  const CARD_ICONS = Object.freeze({
    sapling: ["🌰", "🌱", "🌳"], fern: ["🌱", "🌿", "🌿"], herb: ["🌱", "🌿", "🪴"], flower: ["🌱", "🌷", "🌸"], orchid: ["🌱", "🌷", "🌺"],
    lbm: ["🍄", "🍄", "🍄"], shelf: ["🍄", "🍄", "🍄"], moss: ["☘️", "☘️", "☘️"], lichen: ["🪨", "🪨", "🪨"], seastar: ["⭐", "⭐", "🌟"], anemone: ["🪸", "🪸", "🪸"],
    frog: ["🐸", "🐸", "🐸"], butterfly: ["🐛", "🦋", "🦋"], caterpillar: ["🐛", "🐛", "🦋"]
  });
  const iconFor = (kind, stage = 1) => CARD_ICONS[kind]?.[Math.max(0, Math.min(2, stage))] ?? form(kind, stage).icon ?? KINDS[kind].icon ?? "🌿";
  // One entry per species (newest common name; scientific name when known), at most 24, most-seen first.
  function species(records) {
    const keyOf = (typeof TerraXP !== "undefined" ? TerraXP : require("./xp.js")).speciesKey(records);
    const groups = new Map();
    for (const r of [...records].sort((a, b) => a.date.localeCompare(b.date))) {
      const key = keyOf(r) || `unknown-${r.type}`;
      const g = groups.get(key) ?? { key, records: [] };
      g.records.push(r); groups.set(key, g);
    }
    const slug = k => k.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "species";
    return [...groups.values()].map(g => {
      const last = g.records[g.records.length - 1], named = [...g.records].reverse().find(r => r.name && r.name.trim().toLowerCase() !== "unknown");
      const sci = [...g.records].reverse().find(r => r.taxon)?.taxon.scientificName ?? "";
      const kind = kindFor(named ?? last), count = g.records.length, stage = stageFor(count);
      return { id: `s:${slug(g.key)}`, key: g.key, kind, habitat: habitatOf(kind), name: named?.name.trim() ?? (sci || "Unknown"), scientific: sci, type: last.type,
        count, stage, form: form(kind, stage).name, next: nextAt(stage), first: g.records[0].date, last: last.date, unknown: g.key.startsWith("unknown-") };
    }).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, 24);
  }

  // Facts for collection items (reward ids) and things that appear on their own.
  const ITEM_FACTS = Object.freeze({
    first: "A seedling's first leaves (cotyledons) often look different from the true leaves that follow.",
    obs5: "The red-and-white fly agaric (Amanita muscaria) is poisonous. Like many forest fungi, it trades nutrients with tree roots in a partnership called mycorrhiza.",
    obs10: "Fallen leaves are broken down by fungi, bacteria and tiny animals, returning nutrients to the soil.",
    obs25: KINDS.flower.fact, obs50: "Oaks support hundreds of caterpillar species, which feed many birds; their acorns feed jays, squirrels and deer.",
    week: KINDS.snail.fact, groups3: KINDS.butterfly.fact, names10: KINDS.ladybug.fact, followers10: "Songbirds learn their songs, often from adults nearby, much as people learn language.",
    streak3: KINDS.caterpillar.fact, streak5: KINDS.bee.fact, streak14: KINDS.owl.fact, streak30: KINDS.hedgehog.fact,
    groups5: KINDS.moss.fact, project: "Snail shells are made mostly of calcium carbonate, which snails get partly from their food and soil.",
    verified1: "Quartz is one of the most common minerals in Earth's crust.",
    mycelium: "Mycelium is the thread-like body of a fungus; mushrooms are just its fruit. It recycles dead material and links plant roots underground.",
    aphid: "Aphids suck plant sap. Ladybugs, lacewings and hoverfly larvae help keep them in check.",
    firefly: "Fireflies are beetles that make light with a chemical reaction, flashing patterns to find mates."
  });
  // Rare variants. Odds are per chance event; seen ones are logged like a field-guide "shiny" collection.
  const RARES = Object.freeze([
    { id: "glowcap", name: "Glowing mushroom", tier: "Rare", icon: "🍄", odds: 0.06, fact: "Some fungi, like ghost and honey mushrooms, are bioluminescent: they glow faintly green in the dark." },
    { id: "albino-snail", name: "Albino snail", tier: "Rare", icon: "🐌", odds: 0.05, fact: "Albinism, a lack of pigment, is rare in the wild because pale animals are easier for predators to spot." },
    { id: "golden-beetle", name: "Golden beetle", tier: "Rare", icon: "🪲", odds: 0.05, fact: "Some tortoise beetles shine like gold and can change color by shifting fluid in their shells." },
    { id: "luna-moth", name: "Moonlight moth", tier: "Legendary", icon: "🦋", odds: 0.02, fact: "The luna moth's adults have no working mouths and live only about a week, flying mainly at night." },
    { id: "white-stag", name: "White fawn", tier: "Legendary", icon: "🦌", odds: 0.01, fact: "White (leucistic) deer occur in the wild but are very rare, which made them legendary in many folktales." }
  ].map(Object.freeze));
  return Object.freeze({ KINDS, kindFor, inhabitants, species, form, iconFor, stageFor, nextAt, STAGE_AT, FORMS, HABITATS, habitatOf, ITEM_FACTS, RARES, GROUP_DEFAULT });
})();
if (typeof module !== "undefined") module.exports = TerraLife;
