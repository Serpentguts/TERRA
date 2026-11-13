"use strict";

// The living terrarium: a small ecosystem drawn on a canvas inside the glass jar.
// Each collected item becomes something alive or placeable:
//   Sprout → a plant that grows wilder with every achievement · Toadstool → mushrooms that pin,
//   fruit, drop spores, decay and re-pin elsewhere along an underground mycelium network ·
//   Fallen leaves → leaves drifting down · Wildflower → swaying flowers · Little oak → a tree
//   with a nest · Snail, Ladybug crawl · Butterfly visits flowers · Songbird flies tree ↔ ground
//   and pecks mushrooms; a toxic one can kill it, and it hatches again in the nest.
//   Decorations (shell, statue, bench, rock, crystal) can be dragged and stay where you put them.
// Purely visual and local. Nothing here changes rewards or the journal.
const TerraTerrarium = (() => {
  const host = document.getElementById("rewards-terrarium");
  const canvas = document.createElement("canvas");
  canvas.id = "terrarium-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  host.append(canvas);
  const ctx = canvas.getContext("2d");
  const caption = document.getElementById("terrarium-caption");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // Seeded random numbers, so a plant's shape doesn't change from frame to frame.
  const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  let W = 500, H = 300, ground = 200, dpr = 1;
  let items = new Map();           // badge → { achievement, grant }
  let level = 0;                   // achievements unlocked; drives plant growth
  let speed = 1, paused = reduceMotion.matches, time = 0, last = 0, running = false;
  let selected = null, dragging = null, onMove = () => {};
  const world = { plant: null, flowers: null, tree: null, fungus: null, leaves: null, snail: null, ladybug: null, butterfly: null, bird: null, decor: new Map(), sparkles: [], residents: [], garden: [] };
  const say = text => { if (caption && text) caption.textContent = text; };

  // An oak leaf: rounded lobes along both sides of a midrib, on a 1-unit length pointing along +x.
  const OAK_LEAF = (() => {
    const path = new Path2D(), lobes = 4, pts = 48, top = [], bottom = [];
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      const envelope = Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.7 * (0.32 - 0.08 * t);
      const lobe = 0.55 + 0.45 * Math.abs(Math.sin(t * lobes * Math.PI));
      top.push([t, -envelope * lobe]); bottom.push([t, envelope * lobe]);
    }
    path.moveTo(0, 0);
    for (const [x, y] of top) path.lineTo(x, y);
    for (const [x, y] of bottom.reverse()) path.lineTo(x, y);
    path.closePath();
    return path;
  })();
  function oakLeaf(x, y, size, angle, color, vein = "rgba(40,60,30,.35)") {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(size, size);
    ctx.fillStyle = color; ctx.fill(OAK_LEAF);
    ctx.strokeStyle = vein; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(-0.08, 0); ctx.lineTo(0.92, 0); ctx.stroke();
    ctx.restore();
  }

  // ---------- layout ----------
  function resize() {
    const box = host.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = box.width; H = box.height; ground = Math.round(H * 0.68);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    return true;
  }
  const has = id => items.has(id);
  const X = f => f * W;

  // ---------- building the world from the collection ----------
  function sync() {
    const keep = (key, id, make) => { world[key] = has(id) ? world[key] ?? make() : null; };
    keep("plant", "first", () => ({ x: 0.3, seed: 7 }));
    keep("flowers", "obs25", () => ({ x: 0.52, heads: [] }));
    keep("tree", "obs50", () => ({ x: 0.8 }));
    keep("fungus", "obs5", () => ({ links: [], fruits: [], timer: 2, origin: null }));
    keep("leaves", "obs10", () => ({ ground: Array.from({ length: 9 }, () => ({ x: rand(0.06, 0.94), r: rand(0, 6.28), c: pick(["#c8742f", "#a5502a", "#d89b3a", "#8a5a2b"]) })), falling: [], timer: 3 }));
    keep("snail", "week", () => ({ x: 0.15, dir: 1, pause: 0, trail: [] }));
    keep("ladybug", "names10", () => ({ x: 0.62, dir: -1, pause: 1 }));
    keep("butterfly", "groups3", () => ({ x: W * 0.4, y: ground - 80, tx: W * 0.5, ty: ground - 60, rest: 0 }));
    keep("bird", "followers10", () => ({ state: "perch", x: 0, y: 0, from: null, to: null, t: 0, dir: 1, timer: 2, age: 0 }));
    for (const id of [...world.decor.keys()]) if (!id.startsWith("q:") && !has(id)) world.decor.delete(id);
    let slot = 0;
    for (const [id, { achievement, grant }] of items) {
      if (achievement.kind !== "decoration") continue;
      const d = world.decor.get(id) ?? { id, x: grant.x ?? [0.12, 0.42, 0.66, 0.9, 0.24][slot % 5], y: grant.y ?? 0.35, icon: achievement.icon, item: achievement.item };
      if (grant.x !== undefined && !(dragging && dragging.id === id)) { d.x = grant.x; d.y = grant.y; }
      world.decor.set(id, d); slot++;
    }
    if (world.fungus && !world.fungus.origin) seedMycelium();
    syncLiving();
  }

  // ---------- mushrooms and mycelium ----------
  // Good spots to fruit: under the tree, next to plants and flowers, or anywhere along the network.
  function fruitingSpots() {
    const spots = [];
    if (world.tree) spots.push(world.tree.x - 0.08, world.tree.x + 0.06, world.tree.x - 0.13);
    if (world.plant) spots.push(world.plant.x - 0.06, world.plant.x + 0.07);
    if (world.flowers) spots.push(world.flowers.x + 0.08);
    if (!spots.length) spots.push(0.25, 0.45, 0.7);
    return spots.map(x => clamp(x + rand(-0.03, 0.03), 0.06, 0.94));
  }
  // Mycelium grows on a triangular lattice (60° steps), so the network looks geometric.
  // Nodes are lattice coordinates [i, j]; pixel positions are worked out when drawn.
  const LATTICE = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const gap = () => Math.max(12, W * 0.034);
  const nodePx = (f, [i, j]) => ({ x: X(f.origin.x) + (i + j / 2) * gap(), y: ground + 10 + f.origin.y * (H - ground - 16) + j * gap() * 0.866 });
  const inSoil = (f, node) => { const p = nodePx(f, node); return p.x > 8 && p.x < W - 8 && p.y > ground + 8 && p.y < H - 6; };
  const key = ([i, j]) => `${i},${j}`;
  function seedMycelium() {
    const f = world.fungus, x = fruitingSpots()[0];
    f.origin = { x, y: 0.15 };
    f.nodes = [[0, 0]]; f.seen = new Set(["0,0"]); f.links = []; f.pulses = [];
    for (let i = 0; i < 45; i++) growMycelium();
    spawnFruit(x);
  }
  function nearestNode(f, xFrac) {
    return f.nodes.reduce((best, n) => Math.abs(nodePx(f, n).x - X(xFrac)) < Math.abs(nodePx(f, best).x - X(xFrac)) ? n : best, f.nodes[0]);
  }
  function growMycelium(toward) {
    const f = world.fungus;
    if (f.links.length > 200) { const [gone] = f.links.splice(0, 1); void gone; }
    const from = toward !== undefined ? nearestNode(f, toward) : pick(f.nodes);
    const options = LATTICE.map(([di, dj]) => [from[0] + di, from[1] + dj]).filter(n => inSoil(f, n));
    if (!options.length) return nodePx(f, from);
    let next;
    if (toward !== undefined && Math.random() < 0.8) next = options.reduce((best, n) => Math.abs(nodePx(f, n).x - X(toward)) < Math.abs(nodePx(f, best).x - X(toward)) ? n : best);
    else next = pick(options.filter(n => Math.abs(n[1]) <= 3).length ? options.filter(n => Math.abs(n[1]) <= 3) : options);
    const link = [key(from), key(next)].sort().join("|");
    if (!f.links.some(l => l.id === link)) f.links.push({ id: link, a: from, b: next });
    if (!f.seen.has(key(next))) { f.seen.add(key(next)); f.nodes.push(next); }
    return nodePx(f, next);
  }
  function spawnFruit(x) {
    const f = world.fungus;
    if (f.fruits.length >= 3) return;
    // The network grows out to the new spot first, then a pin pushes up.
    for (let i = 0; i < 12 && Math.abs(nodePx(f, nearestNode(f, x)).x - X(x)) > gap() * 0.6; i++) growMycelium(x);
    const glow = Math.random() < rareOdds("glowcap");
    f.fruits.push({ x, phase: "pin", age: 0, species: glow ? "glowcap" : Math.random() < 0.7 ? "amanita" : "brown", glow, size: rand(0.85, 1.2), spores: [] });
    if (glow) logRare("glowcap");
    say(`A mushroom is pinning ${world.tree && Math.abs(x - world.tree.x) < 0.16 ? "under the oak" : world.plant && Math.abs(x - world.plant.x) < 0.12 ? "beside the plant" : "in the soil"}.`);
  }
  const PHASES = { pin: 6, growing: 10, mature: 24, decaying: 10 };
  function updateFungus(dt) {
    const f = world.fungus;
    if (Math.random() < dt * 0.6) growMycelium();
    // Signals travel along the strands (visible in X-ray).
    if (f.links.length && Math.random() < dt * 3) f.pulses.push({ link: pick(f.links), t: 0 });
    for (const p of f.pulses) p.t += dt * 1.6;
    f.pulses = f.pulses.filter(p => p.t < 1);
    for (const fruit of f.fruits) {
      fruit.age += dt * (weather.rain > 0 ? 2 : 1);
      if (fruit.age >= PHASES[fruit.phase]) {
        fruit.age = 0;
        fruit.phase = { pin: "growing", growing: "mature", mature: "decaying", decaying: "gone" }[fruit.phase];
        if (fruit.phase === "decaying") say("A mushroom is going over and returning to the soil.");
      }
      if (fruit.phase === "mature" && Math.random() < dt * 6) fruit.spores.push({ x: X(fruit.x) + rand(-8, 8), y: ground - 18 * fruit.size, vx: rand(-6, 6), vy: rand(-10, -2), life: 2.5 });
      for (const s of fruit.spores) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 3 * dt; s.life -= dt; }
      fruit.spores = fruit.spores.filter(s => s.life > 0);
    }
    const before = f.fruits.length;
    f.fruits = f.fruits.filter(fruit => fruit.phase !== "gone");
    if (before && !f.fruits.length) say("The mushrooms are gone for now. The mycelium is still alive underground.");
    f.timer -= dt;
    if (f.timer <= 0) { f.timer = rand(9, 20); if (f.fruits.length < 2 || Math.random() < 0.3) spawnFruit(pick(fruitingSpots())); }
  }
  function mushroomGrowth(fruit) {
    if (fruit.phase === "pin") return 0.15 + 0.15 * (fruit.age / PHASES.pin);
    if (fruit.phase === "growing") return 0.3 + 0.7 * (fruit.age / PHASES.growing);
    if (fruit.phase === "mature") return 1;
    return 1 - 0.5 * (fruit.age / PHASES.decaying);
  }

  // ---------- creatures ----------
  function perches() {
    const spots = [];
    if (world.tree) { const t = treeShape(); spots.push({ x: t.x - t.r * 0.8, y: t.top + t.r * 0.9 }, { x: t.x + t.r * 0.7, y: t.top + t.r * 0.6 }, { x: t.x, y: t.top + 4 }); }
    if (world.plant) spots.push({ x: X(world.plant.x), y: ground - plantHeight() - 4 });
    for (const d of world.decor.values()) spots.push({ x: X(d.x), y: decorY(d) - decorSize(d) });
    if (!spots.length) spots.push({ x: W * 0.12, y: ground - 40 });
    return spots;
  }
  const nestSpot = () => world.tree ? (t => ({ x: t.x - t.r * 0.45, y: t.top + t.r * 1.15 }))(treeShape()) : { x: X(0.1), y: ground - 6 };
  function fly(bird, to) {
    bird.from = { x: bird.x, y: bird.y }; bird.to = to; bird.t = 0; bird.state = "fly";
    bird.dir = to.x >= bird.x ? 1 : -1;
  }
  function updateBird(dt) {
    const b = world.bird;
    if (!b.from && b.state === "perch") { const p = perches()[0]; b.x = p.x; b.y = p.y; b.from = p; }
    b.timer -= dt;
    switch (b.state) {
      case "perch":
        if (b.timer <= 0) {
          const fruits = world.fungus?.fruits.filter(f => f.phase === "growing" || f.phase === "mature") ?? [];
          if (Math.random() < 0.6) fly(b, { x: fruits.length && Math.random() < 0.3 ? X(pick(fruits).x) + rand(-14, 14) : rand(W * 0.1, W * 0.9), y: ground - 2, landing: "ground" });
          else fly(b, { ...pick(perches()), landing: "perch" });
        }
        break;
      case "fly": {
        b.t += dt / 2.4;
        const t = Math.min(1, b.t), cx = (b.from.x + b.to.x) / 2, cy = Math.min(b.from.y, b.to.y) - 50;
        b.x = (1 - t) ** 2 * b.from.x + 2 * (1 - t) * t * cx + t ** 2 * b.to.x;
        b.y = (1 - t) ** 2 * b.from.y + 2 * (1 - t) * t * cy + t ** 2 * b.to.y;
        if (t >= 1) { b.state = b.to.landing; b.timer = b.state === "ground" ? rand(4, 8) : rand(3, 7); b.hop = 0; }
        break;
      }
      case "ground": {
        b.hop = (b.hop ?? 0) + dt;
        const near = world.fungus?.fruits.find(f => (f.phase === "growing" || f.phase === "mature") && Math.abs(X(f.x) - b.x) < 16);
        if (near && Math.random() < dt * 0.12) { b.state = "peck"; b.timer = 1.6; b.target = near; b.dir = X(near.x) >= b.x ? 1 : -1; say("The bird is pecking at a mushroom."); break; }
        if (b.hop > 0.9) { b.hop = 0; b.x = clamp(b.x + rand(-14, 14), 12, W - 12); b.dir = Math.random() < 0.5 ? -1 : 1; }
        if (b.timer <= 0) fly(b, { ...pick(perches()), landing: "perch" });
        break;
      }
      case "peck":
        if (b.timer <= 0) {
          const fruit = b.target; b.target = null;
          if (fruit && fruit.phase !== "gone") { fruit.phase = "decaying"; fruit.age = PHASES.decaying * 0.4; }
          if (fruit?.species === "amanita" && Math.random() < 0.45) { b.state = "sick"; b.timer = 2.2; say("Uh oh, that was a toxic toadstool. The bird looks unwell…"); }
          else { b.state = "ground"; b.timer = rand(2, 5); }
        }
        break;
      case "sick":
        if (b.timer <= 0) { b.state = "dead"; b.timer = 3.5; say("The bird didn't survive the wrong mushroom."); }
        break;
      case "dead":
        if (b.timer <= 0) { const n = nestSpot(); Object.assign(b, { state: "egg", x: n.x, y: n.y, timer: 5, from: n }); say(`A new egg sits in the nest${world.tree ? " in the oak" : ""}.`); }
        break;
      case "egg":
        if (b.timer <= 0) { b.state = "chick"; b.timer = 14; say("The egg hatched. A baby bird is in the nest!"); }
        break;
      case "chick":
        if (b.timer <= 0) { say("The young bird is ready to fly."); fly(b, { x: rand(W * 0.2, W * 0.8), y: ground - 2, landing: "ground" }); }
        break;
    }
  }
  function updateCreatures(dt) {
    const s = world.snail;
    if (s) {
      if (s.eating > 0) {
        s.eating -= dt;
        if (s.eating <= 0 && s.meal && s.meal.phase !== "gone") { s.meal.phase = "decaying"; s.meal.age = PHASES.decaying * 0.3; s.meal = null; say("The snail finished its mushroom snack."); }
      } else if (s.pause > 0) s.pause -= dt;
      else {
        // Snails sometimes stop to nibble a mushroom they bump into.
        const meal = world.fungus?.fruits.find(f => (f.phase === "growing" || f.phase === "mature") && Math.abs(f.x - s.x) < 0.02);
        if (meal && Math.random() < dt * 0.25) { s.eating = rand(5, 8); s.meal = meal; s.dir = meal.x >= s.x ? 1 : -1; say("The snail is nibbling a mushroom."); }
        s.x += s.dir * dt * 0.012;
        if (s.x > 0.94 || s.x < 0.06) s.dir *= -1;
        if (Math.random() < dt * 0.05) s.pause = rand(2, 6);
        if (!s.trail.length || Math.abs(s.trail.at(-1).x - s.x) > 0.01) s.trail.push({ x: s.x, life: 1 });
      }
      for (const p of s.trail) p.life -= dt * 0.08;
      s.trail = s.trail.filter(p => p.life > 0);
    }
    const l = world.ladybug;
    if (l && !l.hunting && !((l.climb ?? 0) > 0.01)) {
      if (l.pause > 0) l.pause -= dt;
      else { l.x += l.dir * dt * 0.03; if (l.x > 0.95 || l.x < 0.05 || Math.random() < dt * 0.2) l.dir *= -1; if (Math.random() < dt * 0.15) l.pause = rand(1, 3); }
    }
    const bf = world.butterfly;
    if (bf) {
      if (bf.rest > 0) bf.rest -= dt;
      else {
        const dx = bf.tx - bf.x, dy = bf.ty - bf.y, dist = Math.hypot(dx, dy);
        if (dist < 4) {
          bf.rest = flowerHeads().some(h => Math.hypot(h.x - bf.tx, h.y - bf.ty) < 2) ? rand(2.5, 6) : 0;
          const heads = flowerHeads();
          const target = heads.length && Math.random() < 0.65 ? pick(heads) : { x: rand(W * 0.08, W * 0.92), y: rand(H * 0.12, ground - 40) };
          bf.tx = target.x; bf.ty = target.y;
        } else {
          const v = 34 * dt;
          bf.x += (dx / dist) * v + Math.sin(time * 5 + bf.y) * 0.6;
          bf.y += (dy / dist) * v + Math.cos(time * 7) * 0.8;
        }
      }
    }
    const lv = world.leaves;
    if (lv) {
      lv.timer -= dt;
      if (lv.timer <= 0) {
        lv.timer = env.season === "autumn" ? rand(2, 5) : env.season === "winter" ? rand(14, 24) : rand(5, 11);
        const t = world.tree ? treeShape() : null;
        lv.falling.push({ x: t ? t.x + rand(-t.r, t.r) : rand(W * 0.1, W * 0.9), y: t ? t.top + rand(10, t.r) : 6, r: rand(0, 6.28), c: pick(["#c8742f", "#a5502a", "#d89b3a"]), phase: rand(0, 6) });
      }
      for (const f of lv.falling) { f.y += 16 * dt; f.x += Math.sin(time * 2 + f.phase) * 0.5; f.r += dt * 2; }
      for (const f of lv.falling.filter(f => f.y >= ground)) { lv.ground.push({ x: f.x / W, r: f.r, c: f.c }); if (lv.ground.length > 16) lv.ground.shift(); }
      lv.falling = lv.falling.filter(f => f.y < ground);
    }
    if (world.bird) updateBird(dt);
    for (const sp of world.sparkles) sp.life -= dt;
    world.sparkles = world.sparkles.filter(sp => sp.life > 0);
  }

  // ---------- living world: time, seasons, weather, your finds, quests, food webs, rarities ----------
  const RARE_KEY = "terra.terrarium.v1";
  let env = { season: "autumn", phase: "day", daylight: 1 }, envOverride = { season: null, phase: null }, envClock = 0;
  let southern = false, sandbox = false, today = new Date().toLocaleDateString("en-CA");
  let findList = [], gardenList = [], questDecorList = [], onRare = () => {};
  const weather = { rain: 0, drops: [], splashes: [], mist: 0, mistDrops: [] };
  const life = { aphids: [], aphidTimer: 8, flies: [], fireflies: [], seeds: [], visitors: [], visitorTimer: 20, tongue: null };
  const hashText = text => { let h = 2166136261; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const readRare = () => { try { const s = JSON.parse(localStorage.getItem(RARE_KEY)) || {}; return { seen: Number.isInteger(s.seen) ? s.seen : null, rare: s.rare && typeof s.rare === "object" ? s.rare : {} }; } catch { return { seen: null, rare: {} }; } };
  const writeRare = state => { try { localStorage.setItem(RARE_KEY, JSON.stringify(state)); } catch { /* Per-browser log; the jar still works. */ } };
  const rareOdds = id => (TerraLife.RARES.find(r => r.id === id)?.odds ?? 0) * (sandbox ? 8 : 1);
  const announced = new Set();
  function logRare(id) {
    const rare = TerraLife.RARES.find(r => r.id === id);
    if (!rare) return;
    if (announced.has(id)) return;
    announced.add(id);
    if (sandbox) { say(`✨ ${rare.tier} sighting: ${rare.name}! (Sandbox: not added to your log.)`); return; }
    const state = readRare();
    if (state.rare[id]) { say(`✨ ${rare.tier} sighting: ${rare.name}!`); return; }
    state.rare[id] = today; writeRare(state);
    say(`✨ ${rare.tier} sighting: ${rare.name}! Added to your rare sightings.`);
    onRare(id);
  }

  function computeEnv() {
    const now = new Date();
    let month = now.getMonth();
    if (southern) month = (month + 6) % 12;
    const season = envOverride.season ?? (month === 11 || month <= 1 ? "winter" : month <= 4 ? "spring" : month <= 7 ? "summer" : "autumn");
    const hour = now.getHours() + now.getMinutes() / 60;
    const sunrise = { winter: 7.2, spring: 6.4, summer: 5.8, autumn: 6.8 }[season], sunset = { winter: 16.9, spring: 19.3, summer: 20.4, autumn: 18.2 }[season];
    const phase = envOverride.phase ?? (Math.abs(hour - sunrise) < 0.75 ? "dawn" : Math.abs(hour - sunset) < 0.75 ? "dusk" : hour > sunrise && hour < sunset ? "day" : "night");
    env = { season, phase, daylight: { day: 1, dawn: 0.62, dusk: 0.5, night: 0 }[phase] };
    const sky = document.getElementById("terrarium-sky");
    if (sky) sky.textContent = `${env.season[0].toUpperCase()}${env.season.slice(1)} · ${env.phase}${weather.rain > 0 ? " · raining" : ""}${envOverride.season || envOverride.phase ? " (preview)" : ""}`;
  }
  const night = () => env.phase === "night";

  // Pond appears when something in the jar needs water.
  const pond = () => world.residents.some(r => ["swim", "hop"].includes(TerraLife.KINDS[r.kind].move) && (r.kind === "frog" || TerraLife.KINDS[r.kind].move === "swim")) ? { x1: 0.04, x2: 0.24 } : null;
  function residentX(id, kind) {
    let x = 0.06 + (hashText(id) % 880) / 1000;
    const p = pond(), move = TerraLife.KINDS[kind].move;
    if (move === "swim" && p) return lerp(p.x1 + 0.03, p.x2 - 0.03, (hashText(id) % 100) / 100);
    if (p && x > p.x1 - 0.02 && x < p.x2 + 0.02 && move === "static") x = p.x2 + 0.04 + (x - p.x1) * 0.5;
    if (world.tree && Math.abs(x - world.tree.x) < 0.05 && move === "static") x += 0.08;
    return clamp(x, 0.05, 0.95);
  }
  function syncLiving() {
    // Reward creatures from streak achievements behave like residents.
    const rewardKinds = { streak3: "caterpillar", streak5: "bee", streak14: "owl", streak30: "hedgehog" };
    const wanted = [
      ...Object.entries(rewardKinds).filter(([id]) => has(id)).map(([id, kind]) => ({ id, kind, name: items.get(id).achievement.item, reward: true })),
      ...findList.map(f => ({ id: `r:${f.id}`, kind: f.kind, name: f.name, date: f.date }))
    ];
    const old = new Map(world.residents.map(r => [r.id, r]));
    world.residents = [];
    for (const w of wanted) {
      const r = old.get(w.id) ?? { ...w, x: 0.5, dir: hashText(w.id) % 2 ? 1 : -1, t: Math.random() * 10, timer: rand(1, 4), state: "idle", climb: 0 };
      Object.assign(r, { name: w.name, date: w.date, reward: w.reward });
      world.residents.push(r);
    }
    for (const r of world.residents) if (!old.has(r.id)) r.x = residentX(r.id, r.kind);
    // Rare variants for today (fixed for the day, so they don't flicker between visits).
    for (const r of world.residents) {
      if (r.kind === "beetle" && r.golden === undefined) r.golden = (hashText(r.id + today) % 1000) / 1000 < rareOdds("golden-beetle");
      if (r.golden) logRare("golden-beetle");
    }
    if (world.snail && world.snail.albino === undefined) world.snail.albino = (hashText("snail" + today) % 1000) / 1000 < rareOdds("albino-snail");
    if (world.snail?.albino) logRare("albino-snail");
    world.garden = gardenList.map((g, i) => ({ id: `g:${g.token}`, ...g, x: 0.07 + ((i * 0.137) % 0.86), row: i % 2 }));
    for (const id of [...world.decor.keys()]) if (id.startsWith("q:") && !questDecorList.some(d => `q:${d.token}` === id)) world.decor.delete(id);
    questDecorList.forEach((d, i) => {
      const id = `q:${d.token}`;
      const existing = world.decor.get(id);
      const x = d.x ?? [0.36, 0.6, 0.18, 0.74, 0.5, 0.28][i % 6], y = d.y ?? 0.55;
      if (existing && !(dragging && dragging.id === id)) { existing.x = x; existing.y = y; }
      if (!existing) world.decor.set(id, { id, x, y, icon: d.icon, item: d.item, kind: d.id, note: d.note });
    });
  }

  // ---------- weather and care ----------
  function startRain(seconds = 40, reason = "") {
    weather.rain = Math.max(weather.rain, seconds);
    computeEnv();
    if (world.fungus) { spawnFruit(pick(fruitingSpots())); if (Math.random() < 0.7) spawnFruit(pick(fruitingSpots())); }
    if (world.residents.some(r => r.kind === "frog")) for (let i = 0; i < 4; i++) life.flies.push({ x: rand(0.05, 0.3), y: rand(0.45, 0.62), t: rand(0, 9) });
    if (reason) say(reason);
  }
  function mist() {
    weather.mist = 4;
    for (let i = 0; i < 40; i++) weather.mistDrops.push({ x: rand(W * 0.1, W * 0.9), y: rand(H * 0.15, ground - 10), life: rand(0.6, 1.4) });
    if (world.fungus && Math.random() < 0.5) spawnFruit(pick(fruitingSpots()));
    say("You misted the jar. The plants perk up and the soil smells like rain.");
  }
  function scatter() {
    for (let i = 0; i < 14; i++) life.seeds.push({ x: rand(0.2, 0.75), life: 40 });
    say("You scattered seed. Watch who comes to eat!");
  }
  function updateWeather(dt) {
    if (weather.rain > 0) {
      weather.rain -= dt;
      for (let i = 0; i < W * dt * 0.9; i++) weather.drops.push({ x: rand(0, W), y: rand(-20, 0), v: rand(260, 340) });
      if (weather.rain <= 0) { computeEnv(); say("The rain has stopped. Everything is glistening."); }
    }
    for (const d of weather.drops) d.y += d.v * dt;
    for (const d of weather.drops.filter(d => d.y >= ground)) weather.splashes.push({ x: d.x, life: 0.25 });
    weather.drops = weather.drops.filter(d => d.y < ground);
    for (const s of weather.splashes) s.life -= dt;
    weather.splashes = weather.splashes.filter(s => s.life > 0);
    if (weather.mist > 0) weather.mist -= dt;
    for (const m of weather.mistDrops) { m.y += 14 * dt; m.life -= dt; }
    weather.mistDrops = weather.mistDrops.filter(m => m.life > 0);
  }

  // ---------- food webs ----------
  function updateFoodWeb(dt) {
    // Aphids gather on the sprout; ladybugs climb up and eat them.
    if (world.plant) {
      life.aphidTimer -= dt;
      if (life.aphidTimer <= 0 && life.aphids.length < 10) { life.aphidTimer = rand(12, 26); life.aphids.push({ u: rand(-0.45, 0.45), v: rand(0.35, 0.95) }); }
    } else life.aphids = [];
    const hunters = [world.ladybug, ...world.residents.filter(r => r.kind === "ladybug")].filter(Boolean);
    for (const bug of hunters) {
      bug.climb ??= 0;
      if (!life.aphids.length || !world.plant) { if (bug.climb > 0) bug.climb = Math.max(0, bug.climb - dt * 0.4); bug.hunting = false; continue; }
      if (!bug.hunting && Math.random() < dt * 0.15) { bug.hunting = true; bug.target = pick(life.aphids); }
      if (!bug.hunting) continue;
      const px = world.plant.x + (bug.target?.u ?? 0) * plantHeight() * 0.6 / W;
      if (Math.abs(bug.x - px) > 0.006 && bug.climb <= 0.01) { bug.dir = px > bug.x ? 1 : -1; bug.x += bug.dir * dt * 0.04; bug.pause = 0; continue; }
      bug.x = lerp(bug.x, px, 0.2);
      bug.climb = Math.min(bug.target?.v ?? 0.6, bug.climb + dt * 0.25);
      if (bug.climb >= (bug.target?.v ?? 0.6) - 0.01) {
        life.aphids = life.aphids.filter(a => a !== bug.target);
        bug.hunting = false; bug.target = null;
        say("Crunch! A ladybug ate an aphid off the sprout.");
      }
    }
    // Flies buzz near the pond after rain; frogs catch them with a flick of the tongue.
    for (const f of life.flies) { f.t += dt; f.x = clamp(f.x + Math.sin(f.t * 3.1) * dt * 0.05, 0.03, 0.4); f.y = clamp(f.y + Math.cos(f.t * 4.3) * dt * 0.08, 0.3, 0.66); }
    if (life.tongue) { life.tongue.life -= dt; if (life.tongue.life <= 0) life.tongue = null; }
    for (const frog of world.residents.filter(r => r.kind === "frog")) {
      const fly = life.flies.find(f => Math.abs(f.x - frog.x) < 0.12);
      if (fly && !life.tongue && Math.random() < dt * 0.6) {
        life.tongue = { from: { x: X(frog.x), y: ground - 6 }, to: { x: X(fly.x), y: fly.y * ground }, life: 0.25 };
        life.flies = life.flies.filter(f => f !== fly);
        say("Snap! The frog caught a fly.");
      }
    }
    // Scattered seed gets eaten by whoever reaches it.
    for (const s of life.seeds) s.life -= dt;
    const eaters = [...world.residents.filter(r => ["scurry", "hop"].includes(TerraLife.KINDS[r.kind].move)).map(r => X(r.x)), ...(world.bird && world.bird.state === "ground" ? [world.bird.x] : [])];
    life.seeds = life.seeds.filter(s => s.life > 0 && !eaters.some(x => Math.abs(x - X(s.x)) < 6));
  }

  // ---------- residents ----------
  const flowerTargets = () => [...flowerHeads(), ...world.garden.map(g => ({ x: X(g.x), y: ground - 22 - g.row * 6 })), ...world.residents.filter(r => r.kind === "flower").map(r => ({ x: X(r.x), y: ground - 20 }))];
  function updateResidents(dt) {
    const p = pond(), dark = night();
    for (const r of world.residents) {
      const k = TerraLife.KINDS[r.kind];
      r.t += dt; r.timer -= dt;
      const nocturnal = ["owl", "hedgehog", "mouse"].includes(r.kind), diurnal = ["bee", "butterfly", "sparrow", "lizard"].includes(r.kind);
      const sleepy = (dark && diurnal) || (!dark && r.kind === "owl");
      switch (k.move) {
        case "crawl": {
          if (r.hunting || (r.climb ?? 0) > 0.01) break;
          const pace = { ant: 0.035, beetle: 0.02, caterpillar: 0.006, snake: 0.015, turtle: 0.004, ladybug: 0.02, snail: 0.01 }[r.kind] ?? 0.015;
          if (r.timer <= 0) { r.timer = rand(2, 7); r.pause = Math.random() < 0.35 ? rand(1, 3) : 0; if (Math.random() < 0.3) r.dir *= -1; }
          if ((r.pause ?? 0) > 0) r.pause -= dt; else r.x += r.dir * pace * dt;
          if (r.x < 0.04 || r.x > 0.96) r.dir *= -1;
          break;
        }
        case "scurry": {
          const seed = life.seeds[0];
          if (seed && !sleepy) { r.dir = seed.x > r.x ? 1 : -1; r.x += r.dir * dt * 0.1; break; }
          if (r.timer <= 0) { r.timer = rand(2, 5); r.dash = Math.random() < (nocturnal && dark ? 0.8 : 0.4) ? rand(0.4, 1.2) : 0; r.dir = Math.random() < 0.5 ? -1 : 1; }
          if ((r.dash ?? 0) > 0) { r.dash -= dt; r.x += r.dir * dt * 0.12; }
          if (r.x < 0.04 || r.x > 0.96) r.dir *= -1;
          break;
        }
        case "hop": {
          if (r.hopT !== undefined) { r.hopT += dt / 0.6; r.x = lerp(r.hopFrom, r.hopTo, Math.min(1, r.hopT)); if (r.hopT >= 1) r.hopT = undefined; break; }
          if (r.timer <= 0 && !sleepy) {
            r.timer = rand(3, 8);
            const home = r.kind === "frog" && p ? (p.x1 + p.x2) / 2 : r.x;
            r.dir = Math.random() < 0.5 ? -1 : 1; r.hopFrom = r.x; r.hopTo = clamp(r.x + r.dir * rand(0.03, 0.07) + (home - r.x) * 0.3, 0.04, 0.96); r.hopT = 0;
          }
          break;
        }
        case "fly": {
          r.fx ??= X(r.x); r.fy ??= ground - rand(40, 90);
          if (sleepy) { r.fy = lerp(r.fy, ground - 18, dt); break; }
          if ((r.rest ?? 0) > 0) { r.rest -= dt; break; }
          if (r.tx === undefined || Math.hypot(r.tx - r.fx, r.ty - r.fy) < 4) {
            const targets = r.kind === "sparrow" ? [...perches(), ...life.seeds.map(s => ({ x: X(s.x), y: ground - 2 }))] : flowerTargets();
            const t = targets.length && Math.random() < 0.7 ? pick(targets) : { x: rand(W * 0.08, W * 0.92), y: rand(H * 0.15, ground - 30) };
            if (r.tx !== undefined) r.rest = r.kind === "bee" ? rand(1, 3) : rand(2, 5);
            r.tx = t.x; r.ty = t.y;
          }
          const dx = r.tx - r.fx, dy = r.ty - r.fy, d = Math.hypot(dx, dy) || 1, v = (r.kind === "bee" ? 45 : 32) * dt;
          r.fx += (dx / d) * v + Math.sin(r.t * 9) * (r.kind === "bee" ? 0.9 : 0.4); r.fy += (dy / d) * v + Math.cos(r.t * 7) * 0.5;
          r.x = r.fx / W;
          break;
        }
        case "swim": {
          if (!p) break;
          r.x = clamp(r.x + Math.sin(r.t * 0.7 + hashText(r.id)) * dt * 0.02, p.x1 + 0.02, p.x2 - 0.02);
          break;
        }
        case "burrow": r.x = clamp(r.x + Math.sin(r.t * 0.3) * dt * 0.008, 0.04, 0.96); break;
        case "bask": if (r.timer <= 0) { r.timer = rand(4, 10); r.x = clamp(r.x + rand(-0.04, 0.04), 0.04, 0.96); } break;
        default: break;
      }
    }
  }
  function updateVisitors(dt) {
    life.visitorTimer -= dt;
    if (life.visitorTimer <= 0) {
      life.visitorTimer = 30;
      if (night() && !life.visitors.some(v => v.id === "luna-moth") && Math.random() < rareOdds("luna-moth")) { life.visitors.push({ id: "luna-moth", x: -10, y: H * 0.3, life: 50 }); logRare("luna-moth"); }
      if ((env.phase === "dawn" || env.phase === "dusk") && !life.visitors.some(v => v.id === "white-stag") && Math.random() < rareOdds("white-stag")) { life.visitors.push({ id: "white-stag", x: -20, y: ground + 4, life: 30 }); logRare("white-stag"); }
    }
    for (const v of life.visitors) {
      v.life -= dt;
      if (v.id === "luna-moth") { v.x += dt * W / 45; v.y = H * 0.3 + Math.sin(time * 2) * 20; }
      else v.x += dt * W / 28;
    }
    life.visitors = life.visitors.filter(v => v.life > 0 && v.x < W + 30);
    // Fireflies on warm nights.
    const want = night() && env.season !== "winter" ? 9 : 0;
    while (life.fireflies.length < want) life.fireflies.push({ x: rand(0, W), y: rand(H * 0.25, ground - 8), t: rand(0, 6) });
    if (!want) life.fireflies = [];
    for (const f of life.fireflies) { f.t += dt; f.x = clamp(f.x + Math.sin(f.t * 0.9) * dt * 12, 4, W - 4); f.y = clamp(f.y + Math.cos(f.t * 1.3) * dt * 9, H * 0.15, ground - 4); }
  }
  function updateLiving(dt) {
    envClock -= dt / Math.max(1, speed);
    if (envClock <= 0) { envClock = 10; computeEnv(); }
    updateWeather(dt);
    updateResidents(dt);
    updateFoodWeb(dt);
    updateVisitors(dt);
  }

  // ---------- drawing the living world ----------
  const SKIES = { day: ["#eef6f1", "#dcebdc"], dawn: ["#f3d6c6", "#eee3c6"], dusk: ["#e49c76", "#d7b0c2"], night: ["#121d36", "#2b3c58"] };
  const GRASS = { spring: ["#73a85c", "#5f9d4a"], summer: ["#6d8f5a", "#5d8a4a"], autumn: ["#9b9a55", "#a39348"], winter: ["#c4cfca", "#aeb9b3"] };
  const CANOPY = {
    spring: ["#3a7a40", "#4a8a4f", "#5aa055", "#6ab35e", "#7cc068", "#8fcf74"], summer: ["#2f6438", "#3a7040", "#3f7a46", "#4a8a4f", "#5a9a52", "#6aa85a"],
    autumn: ["#8a3b22", "#b5502a", "#c86a2c", "#d88c34", "#e0a43a", "#a8742f"], winter: ["#7a6a55", "#8a7a62", "#6b5d4a", "#958673", "#a39480", "#7d6f5c"]
  };
  function drawSky() {
    const [top, bottom] = SKIES[env.phase];
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, top); sky.addColorStop(1, bottom);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ground);
    if (night()) {
      const stars = seeded(5);
      for (let i = 0; i < 46; i++) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.8 + i)); ctx.fillStyle = "#fff"; ctx.fillRect(stars() * W, stars() * ground * 0.75, 1.4, 1.4); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#f4efd0"; ctx.beginPath(); ctx.arc(W * 0.2, H * 0.15, 13, 0, 7); ctx.fill();
      ctx.fillStyle = top; ctx.beginPath(); ctx.arc(W * 0.2 + 6, H * 0.15 - 3, 11, 0, 7); ctx.fill();
    } else if (env.phase !== "day") {
      ctx.fillStyle = env.phase === "dawn" ? "rgba(255,214,150,.9)" : "rgba(255,170,110,.9)";
      ctx.beginPath(); ctx.arc(env.phase === "dawn" ? W * 0.12 : W * 0.88, ground - 8, 18, Math.PI, 0); ctx.fill();
    }
    if (weather.rain > 0) { ctx.fillStyle = "rgba(90,105,120,.28)"; ctx.fillRect(0, 0, W, ground); }
  }
  function drawGround() {
    const [band, blade] = GRASS[env.season];
    const soil = ctx.createLinearGradient(0, ground, 0, H);
    soil.addColorStop(0, weather.rain > 0 ? "#5e4632" : "#7a5b3e"); soil.addColorStop(0.55, "#664a32"); soil.addColorStop(1, "#4d3725");
    ctx.fillStyle = soil; ctx.fillRect(0, ground, W, H - ground);
    const pebbles = seeded(3);
    for (let i = 0; i < 26; i++) { ctx.fillStyle = `rgba(${150 + pebbles() * 60},${130 + pebbles() * 40},${110 + pebbles() * 30},.5)`; ctx.beginPath(); ctx.ellipse(pebbles() * W, ground + 14 + pebbles() * (H - ground - 18), 2 + pebbles() * 3, 1.5 + pebbles() * 2, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = band; ctx.fillRect(0, ground - 3, W, 7);
    const grass = seeded(11);
    ctx.strokeStyle = blade; ctx.lineWidth = 1.2;
    for (let i = 0; i < W / 5; i++) { const gx = i * 5 + grass() * 3, gh = 4 + grass() * 7, sway = Math.sin(time * 1.8 + i * 0.4) * (weather.mist > 0 ? 3 : 1.5); ctx.beginPath(); ctx.moveTo(gx, ground + 2); ctx.quadraticCurveTo(gx + sway, ground - gh / 2, gx + sway * 1.5, ground - gh); ctx.stroke(); }
    if (env.season === "winter") { ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(0, ground - 4, W, 4); const frost = seeded(9); for (let i = 0; i < 40; i++) ctx.fillRect(frost() * W, ground - 6 + frost() * 6, 2, 1); }
    const p = pond();
    if (p) {
      const cx = X((p.x1 + p.x2) / 2), rx = X(p.x2 - p.x1) / 2;
      ctx.fillStyle = "#4e7f8f"; ctx.beginPath(); ctx.ellipse(cx, ground + 6, rx, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.ellipse(cx - rx * 0.3, ground + 3, rx * 0.35, 2, 0, 0, 7); ctx.fill();
      if (env.season === "winter") { ctx.fillStyle = "rgba(220,235,245,.55)"; ctx.beginPath(); ctx.ellipse(cx, ground + 6, rx, 10, 0, 0, 7); ctx.fill(); }
    }
  }
  function drawFern(x, y, scale, sway) {
    ctx.strokeStyle = "#3f7a3a"; ctx.lineWidth = 1.2;
    for (let f = 0; f < 5; f++) {
      const a = -1.1 + f * 0.55 + sway, len = (24 + (f % 2) * 8) * scale;
      const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len * 0.9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.sin(a) * len * 0.3, y - len * 0.7, ex, ey); ctx.stroke();
      for (let k = 1; k < 7; k++) {
        const t = k / 7, px = lerp(x, ex, t), py = lerp(y, ey, t) - Math.sin(t * Math.PI) * 4, leaf = (1 - t) * 6 * scale + 1.5;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - leaf * Math.cos(a), py - leaf * Math.sin(a) * 0.6); ctx.moveTo(px, py); ctx.lineTo(px + leaf * Math.cos(a), py + leaf * Math.sin(a) * 0.6); ctx.stroke();
      }
    }
  }
  function drawStatic(r) {
    const x = X(r.x), y = ground + 3, sway = Math.sin(time * 1.5 + hashText(r.id)) * 0.08 * (weather.mist > 0 ? 2 : 1);
    switch (r.kind) {
      case "fern": drawFern(x, y, env.season === "winter" ? 0.7 : 1, sway); break;
      case "herb": ctx.strokeStyle = "#4f8a3c"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sway * 20, y - 18); ctx.stroke();
        ctx.fillStyle = "#6fae4f"; for (const [dy, s] of [[6, -1], [10, 1], [14, -1], [18, 1]]) { ctx.beginPath(); ctx.ellipse(x + sway * dy + s * 4, y - dy, 4, 2, s * 0.5, 0, 7); ctx.fill(); } break;
      case "flower": { const c = ["#e85d75", "#f2b134", "#8e6cd8", "#4aa3df", "#f08a5d"][hashText(r.id) % 5];
        ctx.strokeStyle = "#4f8a3c"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x, y - 12, x + sway * 25, y - 22); ctx.stroke();
        if (env.season !== "winter") { ctx.fillStyle = c; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(x + sway * 25 + Math.cos(k * 1.05) * 3.4, y - 22 + Math.sin(k * 1.05) * 3.4, 2.6, 0, 7); ctx.fill(); } ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.arc(x + sway * 25, y - 22, 1.8, 0, 7); ctx.fill(); } break; }
      case "sapling": ctx.strokeStyle = "#6b4a2f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 26); ctx.stroke();
        if (env.season !== "winter") for (let k = 0; k < 7; k++) oakLeaf(x - 4 + Math.cos(k) * 6, y - 26 + Math.sin(k * 1.7) * 6, 9, k * 0.9 + sway, CANOPY[env.season][k % 6]); break;
      case "moss": ctx.fillStyle = env.season === "winter" ? "#7d9a74" : "#5f9a46"; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x - 8 + k * 4, y - 2, 4 + (k % 2), Math.PI, 0); ctx.fill(); } break;
      case "lbm": for (const [dx, h] of [[-5, 8], [0, 11], [5, 7]]) { ctx.fillStyle = "#e8dcc6"; ctx.fillRect(x + dx - 1, y - h, 2, h); ctx.fillStyle = "#8a6440"; ctx.beginPath(); ctx.ellipse(x + dx, y - h, 4, 3, 0, Math.PI, 0); ctx.fill(); } break;
      case "shelf": ctx.fillStyle = "#6b4a2f"; ctx.beginPath(); ctx.roundRect(x - 16, y - 8, 32, 8, 4); ctx.fill();
        for (const [dx, dy] of [[-8, -8], [2, -9], [10, -7]]) { ctx.fillStyle = "#c79a62"; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 6, 3, 0, Math.PI, 0); ctx.fill(); ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 4, 1.8, 0, Math.PI, 0); ctx.stroke(); } break;
      case "lichen": ctx.fillStyle = "#8d8f88"; ctx.beginPath(); ctx.ellipse(x, y - 4, 10, 6, 0, Math.PI, 0); ctx.fill();
        for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? "#c7d68a" : "#e1a23a"; ctx.beginPath(); ctx.arc(x - 6 + k * 2.4, y - 6 + (k % 3), 1.4, 0, 7); ctx.fill(); } break;
      case "cactus": emoji("🌵", x, y + 1, 26, { rotate: sway * 0.3 }); break;
    }
  }
  function residentPos(r) {
    const k = TerraLife.KINDS[r.kind], x = X(r.x);
    switch (k.move) {
      case "fly": return { x: r.fx ?? x, y: (r.fy ?? ground - 60) + 8 };
      case "hop": return { x, y: ground + 3 - (r.hopT !== undefined ? Math.sin(Math.min(1, r.hopT) * Math.PI) * 16 : 0) };
      case "swim": return { x, y: r.kind === "duck" ? ground + 4 : ground + 12 };
      case "burrow": return { x, y: ground + (H - ground) * 0.45 };
      case "dangle": { const anchor = world.tree ? treeShape().top + treeShape().r * 1.3 : 6; return { x, y: anchor + 30 + Math.sin(r.t * 0.8) * 12, anchor }; }
      case "perch": { if (world.tree) { const t = treeShape(); return { x: t.x + t.r * 0.35, y: t.top + t.r * 0.95 }; } return { x, y: ground + 3 }; }
      default: return { x, y: ground + 3 - (r.climb ?? 0) * plantHeight() };
    }
  }
  function drawResident(r) {
    const k = TerraLife.KINDS[r.kind];
    if (k.move === "static" && k.draw) { drawStatic(r); return; }
    const pos = residentPos(r), size = k.size ?? 18;
    if (k.move === "dangle") { ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(pos.x, pos.anchor); ctx.lineTo(pos.x, pos.y - 10); ctx.stroke(); }
    if (k.move === "burrow") { emoji(k.icon, pos.x, pos.y, 16, { rotate: Math.sin(r.t * 2) * 0.3 }); return; }
    if (k.move === "swim" && r.kind === "fish") { emoji(k.icon, pos.x, pos.y, 13, { flip: Math.cos(r.t * 0.7) > 0, alpha: 0.85 }); return; }
    const sleeping = (night() && ["bee", "butterfly", "sparrow", "lizard"].includes(r.kind)) || (!night() && r.kind === "owl");
    const filter = r.golden ? "sepia(1) saturate(5) hue-rotate(5deg) brightness(1.25)" : "none";
    const wing = k.move === "fly" && !sleeping && !(r.rest > 0) ? 0.6 + 0.4 * Math.abs(Math.sin(r.t * (r.kind === "bee" ? 30 : 16))) : 1;
    emoji(k.icon, pos.x, pos.y, r.kind === "owl" ? 22 : size, { flip: (r.dir ?? 1) > 0 && k.move !== "fly" ? true : (r.tx ?? 0) > (r.fx ?? 0), scaleY: wing, filter, alpha: sleeping && r.kind === "owl" ? 0.85 : 1 });
    if (sleeping && r.kind !== "bee") { ctx.fillStyle = night() ? "#dfe8ff" : "#4a5a6a"; ctx.font = "italic 10px system-ui"; ctx.textAlign = "left"; ctx.fillText("z", pos.x + 8, pos.y - 16 - Math.sin(time * 2) * 2); }
    if (r.golden) { ctx.fillStyle = `rgba(255,220,90,${0.35 + 0.25 * Math.sin(time * 3)})`; ctx.beginPath(); ctx.arc(pos.x, pos.y - size / 2, size * 0.8, 0, 7); ctx.fill(); }
  }
  function drawGarden() {
    for (const g of world.garden) {
      const x = X(g.x), y = ground + 3 + g.row * 4, sway = Math.sin(time * 1.4 + g.x * 20) * 2;
      const grown = sandbox || g.planted < today;
      ctx.strokeStyle = "#4f8a3c"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x, y - 10, x + sway, y - (grown ? 20 : 10)); ctx.stroke();
      ctx.fillStyle = "#5f9d4a"; ctx.beginPath(); ctx.ellipse(x - 3, y - 6, 3.5, 1.6, -0.5, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + 3, y - 9, 3.5, 1.6, 0.5, 0, 7); ctx.fill();
      if (grown && env.season !== "winter") emoji(g.icon, x + sway, y - 14, 16);
      else { ctx.fillStyle = "#7fb069"; ctx.beginPath(); ctx.ellipse(x + sway, y - (grown ? 21 : 11), 2.5, 3.5, 0, 0, 7); ctx.fill(); }
    }
  }
  function drawQuestDecor(d) {
    const x = X(d.x), y = decorY(d);
    switch (d.kind) {
      case "birdbath": ctx.fillStyle = "#9aa3a0"; ctx.fillRect(x - 3, y - 18, 6, 18); ctx.beginPath(); ctx.ellipse(x, y - 19, 14, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = env.season === "winter" ? "#dfeaf0" : "#7fb3c8"; ctx.beginPath(); ctx.ellipse(x, y - 20, 11, 2.5, 0, 0, 7); ctx.fill(); break;
      case "stones": ctx.fillStyle = "#a7a49a"; for (const [dx, dy] of [[-14, 0], [0, -2], [14, 1]]) { ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 7, 3, 0, 0, 7); ctx.fill(); } break;
      case "feeder": ctx.fillStyle = "#6b4a2f"; ctx.fillRect(x - 1.5, y - 30, 3, 30); ctx.fillStyle = "#a8743f"; ctx.fillRect(x - 9, y - 36, 18, 8); ctx.fillStyle = "#7a4f2a"; ctx.beginPath(); ctx.moveTo(x - 12, y - 36); ctx.lineTo(x, y - 44); ctx.lineTo(x + 12, y - 36); ctx.fill();
        ctx.fillStyle = "#e3c78a"; for (let k = 0; k < 5; k++) ctx.fillRect(x - 6 + k * 3, y - 30, 1.5, 1.5); break;
      case "fairyring": for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, mx = x + Math.cos(a) * 16, my = y - 2 + Math.sin(a) * 4; ctx.fillStyle = "#efe6d2"; ctx.fillRect(mx - 0.8, my - 5, 1.6, 5); ctx.fillStyle = "#c79a62"; ctx.beginPath(); ctx.ellipse(mx, my - 5, 2.6, 1.8, 0, Math.PI, 0); ctx.fill(); } break;
      case "chime": emoji(d.icon, x, y, 24, { rotate: Math.sin(time * 1.7) * 0.15 }); break;
      default: emoji(d.icon, x, y, 22);
    }
  }
  function drawWeatherAndNight() {
    ctx.strokeStyle = "rgba(200,220,240,.75)"; ctx.lineWidth = 1;
    ctx.beginPath(); for (const d of weather.drops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 1, d.y + 7); } ctx.stroke();
    for (const s of weather.splashes) { ctx.strokeStyle = `rgba(220,235,250,${s.life * 3})`; ctx.beginPath(); ctx.ellipse(s.x, ground + 1, 3 - s.life * 6, 1, 0, 0, 7); ctx.stroke(); }
    for (const m of weather.mistDrops) { ctx.fillStyle = `rgba(210,235,255,${clamp(m.life, 0, 1) * 0.8})`; ctx.beginPath(); ctx.arc(m.x, m.y, 1.6, 0, 7); ctx.fill(); }
    if (env.season === "winter") { ctx.fillStyle = "rgba(255,255,255,.9)"; const flakes = seeded(17); for (let i = 0; i < 30; i++) { const fx = (flakes() * W + Math.sin(time + i) * 8) % W, fy = (flakes() * H + time * (12 + flakes() * 10)) % ground; ctx.beginPath(); ctx.arc(fx, fy, 1.4, 0, 7); ctx.fill(); } }
    for (const s of life.seeds) { ctx.fillStyle = "#e3c78a"; ctx.fillRect(X(s.x), ground, 2, 1.5); }
    for (const a of life.aphids) if (world.plant) { ctx.fillStyle = "#b7d86b"; ctx.beginPath(); ctx.ellipse(X(world.plant.x) + a.u * plantHeight() * 0.6, ground - a.v * plantHeight(), 1.6, 1.1, 0, 0, 7); ctx.fill(); }
    for (const f of life.flies) { ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(X(f.x), f.y * ground, 1.4, 0, 7); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillRect(X(f.x) - 2, f.y * ground - 2 - Math.abs(Math.sin(time * 40)), 4, 1); }
    if (life.tongue) { ctx.strokeStyle = "#e86a8a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(life.tongue.from.x, life.tongue.from.y); ctx.lineTo(life.tongue.to.x, life.tongue.to.y); ctx.stroke(); }
    // Darken for dusk and night, then draw things that glow on top.
    const shade = { day: 0, dawn: 0.12, dusk: 0.2, night: 0.5 }[env.phase];
    if (shade) { ctx.fillStyle = env.phase === "night" ? `rgba(8,14,36,${shade})` : `rgba(80,40,60,${shade})`; ctx.fillRect(0, 0, W, H); }
    const glow = (x, y, r, color) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
    if (env.daylight < 1) for (const d of world.decor.values()) if (d.kind === "lantern") glow(X(d.x), decorY(d) - 12, 46, "rgba(255,190,90,.55)");
    if (env.daylight < 1) for (const d of world.decor.values()) if (d.kind === "fairyring") glow(X(d.x), decorY(d) - 3, 24, "rgba(190,255,200,.3)");
    for (const fr of world.fungus?.fruits ?? []) if (fr.glow) glow(X(fr.x), ground - 10 * fr.size, 22 + 8 * Math.sin(time * 2), `rgba(140,255,160,${night() ? 0.55 : 0.28})`);
    for (const f of life.fireflies) { const on = Math.sin(f.t * 3) > 0.3; if (on) glow(f.x, f.y, 9, "rgba(230,255,120,.9)"); }
    for (const v of life.visitors) {
      if (v.id === "luna-moth") { glow(v.x, v.y, 18, "rgba(170,255,200,.35)"); emoji("🦋", v.x, v.y + 8, 20, { filter: "hue-rotate(90deg) saturate(1.6) brightness(1.4)", scaleY: 0.6 + 0.4 * Math.abs(Math.sin(time * 10)) }); }
      else emoji("🦌", v.x, v.y, 30, { filter: "grayscale(1) brightness(1.9)", flip: true });
    }
  }

  // ---------- shapes ----------
  const plantGrowth = () => clamp(level / 12, 0, 1);
  const plantHeight = () => 14 + plantGrowth() * 70;
  const treeShape = () => { const x = X(world.tree.x), r = Math.min(W * 0.16, 64); return { x, r, top: ground - H * 0.55, trunkTop: ground - H * 0.32 }; };
  const decorSize = d => ({ projects3: 40, days30: 34, groups5: 30, verified1: 26, project: 22 })[d.id] ?? 26;
  const decorY = d => ground + 4 + d.y * (H - ground) * 0.45;
  function flowerHeads() {
    const heads = [];
    if (world.flowers) for (let i = 0; i < 5; i++) {
      const h = 26 + (i % 3) * 12, sway = Math.sin(time * 1.4 + i) * 4;
      heads.push({ x: X(world.flowers.x) + (i - 2) * 9 + sway, y: ground - h, i });
    }
    if (world.plant && plantGrowth() > 0.5) heads.push({ x: X(world.plant.x), y: ground - plantHeight(), i: 9 });
    return heads;
  }

  // ---------- drawing ----------
  function emoji(char, x, y, size, { flip = false, rotate = 0, alpha = 1, scaleY = 1, filter = "none" } = {}) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rotate); ctx.scale(flip ? -1 : 1, scaleY);
    if (filter !== "none") ctx.filter = filter;
    ctx.shadowColor = "rgba(30,40,30,.45)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5; // Keeps pale creatures readable.
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(char, 0, 0); ctx.restore();
  }
  function drawBackdrop() { drawSky(); drawGround(); }
  function drawMycelium() {
    const f = world.fungus;
    const xray = selected === "obs5", resting = !f.fruits.length;
    const alpha = xray ? 0.95 : resting ? 0.45 : 0.18;
    if (xray) { ctx.fillStyle = "rgba(20,26,40,.45)"; ctx.fillRect(0, ground + 4, W, H - ground - 4); }
    ctx.save(); ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(245,240,225,${alpha})`; ctx.lineWidth = xray ? 1.4 : 1;
    if (xray) { ctx.shadowColor = "#fff8d8"; ctx.shadowBlur = 6; }
    ctx.beginPath();
    for (const l of f.links) { const a = nodePx(f, l.a), b = nodePx(f, l.b); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    // Each fruit is fed by a straight strand from the nearest node up to the surface.
    for (const fruit of f.fruits) { const n = nodePx(f, nearestNode(f, fruit.x)); ctx.moveTo(n.x, n.y); ctx.lineTo(X(fruit.x), ground + 2); }
    ctx.stroke();
    // Nodes where strands meet.
    ctx.fillStyle = `rgba(255,250,230,${xray ? 1 : alpha})`;
    const used = new Set(f.links.flatMap(l => [key(l.a), key(l.b)]));
    for (const n of f.nodes) if (used.has(key(n))) { const p = nodePx(f, n); ctx.beginPath(); ctx.arc(p.x, p.y, xray ? 1.8 : 1.2, 0, 7); ctx.fill(); }
    if (xray) {
      ctx.fillStyle = "#fff6c2"; ctx.shadowColor = "#ffe98a"; ctx.shadowBlur = 10;
      for (const p of f.pulses) { const a = nodePx(f, p.link.a), b = nodePx(f, p.link.b); ctx.beginPath(); ctx.arc(lerp(a.x, b.x, p.t), lerp(a.y, b.y, p.t), 2.2, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }
  function drawMushroom(fruit) {
    const g = mushroomGrowth(fruit) * fruit.size, x = X(fruit.x);
    const decay = fruit.phase === "decaying" ? fruit.age / PHASES.decaying : 0;
    const stemH = 4 + 16 * g, capW = 3 + 11 * g, capH = 2 + 6 * g;
    ctx.save(); ctx.translate(x, ground + 2);
    ctx.rotate(decay * 0.5 * (fruit.x > 0.5 ? 1 : -1));
    ctx.fillStyle = `rgb(${Math.round(lerp(240, 150, decay))},${Math.round(lerp(232, 135, decay))},${Math.round(lerp(210, 110, decay))})`;
    ctx.fillRect(-1.5 - g * 1.5, -stemH, 3 + g * 3, stemH);
    const cap = fruit.species === "amanita" ? [210, 52, 40] : fruit.species === "glowcap" ? [150, 220, 150] : [168, 120, 72];
    ctx.fillStyle = `rgb(${Math.round(lerp(cap[0], 110, decay))},${Math.round(lerp(cap[1], 90, decay))},${Math.round(lerp(cap[2], 70, decay))})`;
    ctx.beginPath(); ctx.ellipse(0, -stemH, capW, capH * (1 - decay * 0.4), 0, Math.PI, 0); ctx.fill();
    if (fruit.species === "amanita" && g > 0.4 && decay < 0.7) {
      ctx.fillStyle = "rgba(255,255,255,.9)";
      for (const [dx, dy] of [[-0.5, 0.45], [0.1, 0.75], [0.55, 0.4], [-0.15, 0.25]]) { ctx.beginPath(); ctx.arc(dx * capW, -stemH - dy * capH, 0.8 + g, 0, 7); ctx.fill(); }
    }
    ctx.restore();
    ctx.fillStyle = "rgba(255,248,220,.75)";
    for (const s of fruit.spores) { ctx.globalAlpha = Math.min(1, s.life); ctx.beginPath(); ctx.arc(s.x, s.y, 0.9, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function drawPlant() {
    const p = world.plant, g = plantGrowth(), rnd = seeded(p.seed);
    const depthMax = 1 + Math.round(g * 5), baseLen = 12 + g * 30;
    const dance = selected === "first" ? 2.2 : 1;
    const branch = (x, y, len, angle, depth) => {
      const sway = Math.sin(time * 1.6 + depth * 0.8 + p.seed) * 0.07 * (1 + depth * 0.35) * dance;
      const a = angle + sway, ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
      ctx.strokeStyle = depth === 0 ? "#4f7a3a" : "#5f9445"; ctx.lineWidth = Math.max(1, (depthMax - depth + 1) * 1.1);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      if (depth < depthMax) {
        const kids = depth > 2 && rnd() < 0.4 ? 3 : 2;
        for (let i = 0; i < kids; i++) branch(ex, ey, len * (0.68 + rnd() * 0.12), a + (i - (kids - 1) / 2) * (0.5 + rnd() * 0.35), depth + 1);
      } else {
        ctx.fillStyle = "#6fae4f"; ctx.beginPath(); ctx.ellipse(ex, ey, 5 + g * 3, 2.5 + g, a + 0.6, 0, 7); ctx.fill();
        if (g > 0.5 && rnd() < 0.7) { ctx.fillStyle = ["#e47fb0", "#b57ae0", "#f08a5d"][Math.floor(rnd() * 3)]; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(ex + Math.cos(k * 1.26 + time) * 3, ey + Math.sin(k * 1.26 + time) * 3, 2.2, 0, 7); ctx.fill(); } ctx.fillStyle = "#f6d24a"; ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, 7); ctx.fill(); }
        if (g > 0.85 && rnd() < 0.5) { ctx.strokeStyle = "#7cc25a"; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 18; k++) { const r = k * 0.5, t = k * 0.6 + time; ctx.lineTo(ex + Math.cos(t) * r, ey + Math.sin(t) * r); } ctx.stroke(); }
      }
    };
    if (g === 0) { emoji("🌱", X(p.x), ground + 3, 26, { rotate: Math.sin(time * 1.5) * 0.08 * dance }); return; }
    branch(X(p.x), ground + 2, baseLen, 0, 0);
  }
  function drawFlowers() {
    const colors = ["#e85d75", "#f2b134", "#8e6cd8", "#e85d75", "#4aa3df"];
    for (const h of flowerHeads().filter(h => h.i < 9)) {
      ctx.strokeStyle = "#4f8a3c"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(world.flowers.x) + (h.i - 2) * 9, ground + 2); ctx.quadraticCurveTo(h.x - 2, (ground + h.y) / 2, h.x, h.y); ctx.stroke();
      ctx.fillStyle = colors[h.i];
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(h.x + Math.cos(k * 1.05) * 3.4, h.y + Math.sin(k * 1.05) * 3.4, 2.6, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.arc(h.x, h.y, 2, 0, 7); ctx.fill();
    }
  }
  function drawTree() {
    const t = treeShape();
    ctx.fillStyle = "#6b4a2f";
    ctx.beginPath(); ctx.moveTo(t.x - 7, ground + 3); ctx.quadraticCurveTo(t.x - 4, t.trunkTop, t.x - 3, t.top + t.r); ctx.lineTo(t.x + 3, t.top + t.r); ctx.quadraticCurveTo(t.x + 4, t.trunkTop, t.x + 8, ground + 3); ctx.fill();
    ctx.strokeStyle = "#6b4a2f"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(t.x - 2, t.top + t.r * 1.3); ctx.lineTo(t.x - t.r * 0.55, t.top + t.r * 1.05); ctx.stroke();
    const sway = Math.sin(time * 0.9) * 0.02;
    // Canopy: clusters of oak leaves, darker inside, lighter at the edges; it sways from the trunk.
    ctx.save(); ctx.translate(t.x, t.top + t.r * 1.4); ctx.rotate(sway); ctx.translate(-t.x, -(t.top + t.r * 1.4));
    const rnd = seeded(21), shades = CANOPY[env.season], bare = env.season === "winter";
    const blobs = [[-0.55, 0.6, 0.62], [0.5, 0.55, 0.6], [0, 0.3, 0.72], [-0.2, 0.8, 0.55], [0.3, 0.85, 0.5]];
    ctx.fillStyle = { spring: "#356f3c", summer: "#2d5d35", autumn: "#7a3a1f", winter: "rgba(0,0,0,0)" }[env.season];
    if (!bare) for (const [dx, dy, rr] of blobs) { ctx.beginPath(); ctx.arc(t.x + dx * t.r, t.top + dy * t.r, rr * t.r * 0.8, 0, 7); ctx.fill(); }
    if (bare) { ctx.strokeStyle = "#5f4128"; ctx.lineWidth = 2; for (const [dx, dy] of blobs) { ctx.beginPath(); ctx.moveTo(t.x, t.top + t.r * 1.3); ctx.lineTo(t.x + dx * t.r, t.top + dy * t.r); ctx.stroke(); } }
    for (let layer = 0; layer < 3; layer++) for (const [dx, dy, rr] of blobs) {
      for (let k = 0; k < 9; k++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rr * t.r * (0.55 + layer * 0.2);
        const lx = t.x + dx * t.r + Math.cos(a) * d, ly = t.top + dy * t.r + Math.sin(a) * d;
        const size = t.r * (0.2 + rnd() * 0.08), angle = a + rnd() - 0.5, shade = shades[Math.min(5, layer * 2 + Math.floor(rnd() * 2))];
        if (!bare || rnd() < 0.12) oakLeaf(lx, ly, size, angle, shade);
        if (env.season === "spring" && rnd() < 0.08) { ctx.fillStyle = "#f6c6d6"; ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, 7); ctx.fill(); }
      }
    }
    // A few acorns hanging in the canopy.
    for (const [dx, dy] of [[-0.35, 0.95], [0.4, 0.9], [0.05, 1.05]]) {
      const ax = t.x + dx * t.r, ay = t.top + dy * t.r;
      ctx.fillStyle = "#a8742f"; ctx.beginPath(); ctx.ellipse(ax, ay + 3, 2.6, 3.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#6b4a2f"; ctx.beginPath(); ctx.ellipse(ax, ay, 3.2, 1.8, 0, Math.PI, 0); ctx.fill();
    }
    ctx.restore();
    if (world.bird) { const n = nestSpot(); ctx.fillStyle = "#8b6a3e"; ctx.beginPath(); ctx.ellipse(n.x, n.y + 2, 11, 5, 0, 0, Math.PI); ctx.fill(); ctx.strokeStyle = "#5f4426"; ctx.lineWidth = 1; for (let i = -9; i < 10; i += 3) { ctx.beginPath(); ctx.moveTo(n.x + i, n.y + 1); ctx.lineTo(n.x + i + 3, n.y + 5); ctx.stroke(); } }
  }
  function drawBench(x, y) {
    ctx.fillStyle = "#8a5a33";
    ctx.fillRect(x - 20, y - 14, 40, 4); ctx.fillRect(x - 20, y - 22, 40, 3);
    ctx.fillStyle = "#5b3b22"; for (const lx of [-17, 14]) ctx.fillRect(x + lx, y - 14, 3, 14); ctx.fillRect(x - 18, y - 22, 2, 8); ctx.fillRect(x + 16, y - 22, 2, 8);
  }
  function drawDecor(d) {
    if (d.id.startsWith("q:")) { drawQuestDecor(d); return; }
    const x = X(d.x), y = decorY(d), size = decorSize(d);
    if (d.id === "verified1") { const glow = ctx.createRadialGradient(x, y - size / 2, 2, x, y - size / 2, size); glow.addColorStop(0, `rgba(190,230,255,${0.45 + Math.sin(time * 2) * 0.2})`); glow.addColorStop(1, "rgba(190,230,255,0)"); ctx.fillStyle = glow; ctx.fillRect(x - size, y - size * 1.5, size * 2, size * 2); }
    if (d.id === "days30") drawBench(x, y); else emoji(d.icon, x, y, size);
    if (d.id === "groups5") { ctx.fillStyle = "rgba(95,150,70,.75)"; ctx.beginPath(); ctx.ellipse(x - 3, y - size * 0.72, size * 0.28, 4, -0.2, 0, 7); ctx.fill(); }
  }
  function drawCreatures() {
    const s = world.snail;
    if (s) {
      ctx.fillStyle = "rgba(220,230,240,.35)"; for (const p of s.trail) { ctx.globalAlpha = p.life * 0.5; ctx.fillRect(X(p.x) - 2, ground + 1, 4, 1.5); } ctx.globalAlpha = 1;
      emoji("🐌", X(s.x), ground + 4, 22, { flip: s.dir > 0, rotate: s.eating > 0 ? Math.sin(time * 8) * 0.06 : 0, filter: s.albino ? "grayscale(1) brightness(1.75)" : "none" });
    }
    if (world.ladybug) emoji("🐞", X(world.ladybug.x), ground + 3 - (world.ladybug.climb ?? 0) * plantHeight(), 13, { flip: world.ladybug.dir > 0, rotate: (world.ladybug.climb ?? 0) > 0.02 ? -Math.PI / 2 : 0 });
    const bf = world.butterfly;
    // Wings flap by squeezing the sprite sideways while flying.
    if (bf) emoji("🦋", bf.x, bf.y + 10, 20, { flip: bf.tx > bf.x, rotate: Math.sin(time * 3) * 0.1, scaleY: bf.rest > 0 ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(time * 18)) });
    const b = world.bird;
    if (b && b.from) {
      if (b.state === "egg") emoji("🥚", b.x, b.y + 2, 13);
      else if (b.state === "chick") emoji(b.timer > 7 ? "🐣" : "🐤", b.x, b.y + 3, 16, { rotate: Math.sin(time * 6) * 0.08 });
      else if (b.state === "dead") emoji("🐦", b.x, ground + 3, 20, { rotate: Math.PI / 2, alpha: clamp(b.timer / 3.5, 0, 1) });
      else {
        const bob = b.state === "peck" ? Math.abs(Math.sin(time * 14)) * 4 : b.state === "ground" ? -Math.abs(Math.sin((b.hop ?? 0) * Math.PI)) * 5 : 0;
        const wob = b.state === "sick" ? Math.sin(time * 12) * 0.35 : b.state === "peck" ? 0.35 * b.dir : 0;
        emoji("🐦", b.x, b.y + 2 + bob, b.state === "fly" ? 26 : 24, { flip: b.dir > 0, rotate: wob, scaleY: b.state === "fly" ? 0.75 + 0.25 * Math.abs(Math.sin(time * 16)) : 1 });
      }
    }
  }
  function drawLeaves() {
    const lv = world.leaves;
    const leaf = (x, y, r, c) => oakLeaf(x - 5, y, 11, r, c, "rgba(90,50,20,.4)");
    for (const l of lv.ground) leaf(X(l.x), ground + 2, l.r, l.c);
    for (const f of lv.falling) leaf(f.x, f.y, f.r, f.c);
  }
  // Where each item is, for highlighting and tapping.
  const resident = id => world.residents.find(r => r.id === id);
  function locate(id) {
    const r = resident(id);
    if (r) {
      const k = TerraLife.KINDS[r.kind];
      if (k.move === "static") return { x: X(r.x), y: ground - 12, r: 20 };
      const pos = residentPos(r), size = r.kind === "owl" ? 22 : k.size ?? 18;
      return { x: pos.x, y: pos.y - size / 2, r: Math.max(14, size * 0.8) };
    }
    if (id?.startsWith("g:")) { const g = world.garden.find(g => g.id === id); return g && { x: X(g.x), y: ground - 12, r: 14 }; }
    switch (id) {
      case "first": return world.plant && { x: X(world.plant.x), y: ground - plantHeight() / 2, r: Math.max(24, plantHeight() / 1.6) };
      case "obs25": return world.flowers && { x: X(world.flowers.x), y: ground - 30, r: 34 };
      case "obs50": return world.tree && (t => ({ x: t.x, y: t.top + t.r * 0.9, r: t.r * 1.2 }))(treeShape());
      case "obs5": { const f = world.fungus; if (!f) return null; const fr = f.fruits[0]; return fr ? { x: X(fr.x), y: ground - 10, r: 22 } : (p => ({ x: p.x, y: p.y, r: 40 }))(nodePx(f, [0, 0])); }
      case "obs10": return world.leaves && { x: W * 0.5, y: ground, r: 30 };
      case "week": return world.snail && { x: X(world.snail.x), y: ground - 8, r: 18 };
      case "names10": return world.ladybug && { x: X(world.ladybug.x), y: ground - 5 - (world.ladybug.climb ?? 0) * plantHeight(), r: 14 };
      case "groups3": return world.butterfly && { x: world.butterfly.x, y: world.butterfly.y, r: 18 };
      case "followers10": return world.bird?.from && { x: world.bird.x, y: world.bird.y - 8, r: 20 };
      default: { const d = world.decor.get(id); return d && { x: X(d.x), y: decorY(d) - decorSize(d) / 2, r: decorSize(d) * 0.8 }; }
    }
  }
  // Field-guide card data for anything in the jar.
  function thing(id) {
    const r = resident(id);
    if (r && id.startsWith("r:")) {
      const k = TerraLife.KINDS[r.kind];
      if (r.golden) { const rare = TerraLife.RARES.find(x => x.id === "golden-beetle"); return { name: rare.name, tier: rare.tier, icon: rare.icon, sub: `From your find “${r.name}” (${r.date}).`, fact: rare.fact }; }
      return { name: r.name || k.name, icon: k.icon ?? "🌿", sub: `Your find from ${r.date}, living here as a ${k.name.toLowerCase()}.`, fact: k.fact };
    }
    if (id?.startsWith("g:")) { const g = world.garden.find(g => g.id === id); return g && { name: g.item, icon: g.icon, sub: `Seed packet from a field quest on ${g.planted}.`, fact: "Flowers in your garden came from daily field quests. A new seed sprouts the day you earn it and blooms the next day." }; }
    if (id?.startsWith("q:")) { const d = world.decor.get(id); return d && { name: d.item, icon: d.icon, sub: "Weekly field-quest reward. Drag it to move it.", fact: d.note }; }
    const entry = items.get(id);
    if (!entry) return null;
    const a = entry.achievement;
    const albino = id === "week" && world.snail?.albino, rare = albino && TerraLife.RARES.find(x => x.id === "albino-snail");
    return { name: rare ? rare.name : a.item, tier: rare?.tier, icon: a.icon, sub: `Unlocked by “${a.label}”.`, fact: rare ? rare.fact : TerraLife.ITEM_FACTS[id] ?? "" };
  }
  const guideCard = document.getElementById("terrarium-guide");
  function showGuide(id) {
    if (!guideCard) return;
    const t = id && thing(id);
    guideCard.hidden = !t;
    if (!t) return;
    guideCard.replaceChildren();
    const head = document.createElement("div"); head.className = "guide-head";
    const icon = document.createElement("span"); icon.className = "guide-icon"; icon.textContent = t.icon; icon.setAttribute("aria-hidden", "true");
    const name = document.createElement("strong"); name.textContent = t.name;
    head.append(icon, name);
    if (t.tier) { const tier = document.createElement("span"); tier.className = `guide-tier ${t.tier.toLowerCase()}`; tier.textContent = t.tier; head.append(tier); }
    const sub = document.createElement("p"); sub.className = "guide-sub"; sub.textContent = t.sub;
    const fact = document.createElement("p"); fact.className = "guide-fact"; fact.textContent = t.fact;
    guideCard.append(head, sub, fact);
  }
  function describe(id) {
    const r = resident(id);
    if (r) {
      const k = TerraLife.KINDS[r.kind], name = r.name || k.name;
      const sleeping = (night() && ["bee", "butterfly", "sparrow", "lizard"].includes(r.kind)) || (!night() && r.kind === "owl");
      if (sleeping) return `${name}: sleeping until ${night() ? "morning" : "night"}.`;
      if (r.hunting) return `${name}: climbing the sprout to hunt aphids.`;
      return `${name}: ${({ hop: "hopping about", crawl: "crawling along", fly: "flying from flower to flower", swim: "swimming in the pond", burrow: "tunneling through the soil", dangle: "hanging from a silk thread", bask: "basking", perch: "perched in the oak", scurry: "scurrying around", static: "growing here" })[k.move]}.`;
    }
    if (id?.startsWith("g:") || id?.startsWith("q:")) { const t = thing(id); return t && `${t.name}: ${id.startsWith("q:") ? "drag it, or use the arrow keys, to move it." : "growing in your quest garden."}`; }
    const name = items.get(id)?.achievement.item ?? "";
    if (id === "obs5") { const f = world.fungus, n = f.fruits.filter(x => x.phase !== "decaying").length; return n ? `${name}: ${n} mushroom${n === 1 ? "" : "s"} fruiting from the mycelium below.` : `${name}: resting as mycelium underground (shown in X-ray). It will pin again near a tree or plant.`; }
    if (id === "first") return `${name}: growth stage ${1 + Math.round(plantGrowth() * 5)} of 6. It grows with every achievement you unlock.${life.aphids.length ? ` ${life.aphids.length} aphid${life.aphids.length === 1 ? "" : "s"} on it.` : ""}`;
    if (id === "followers10") { const s = world.bird.state; return `${name}: ${({ perch: "perched", fly: "flying", ground: "hopping on the ground", peck: "pecking a mushroom", sick: "feeling unwell after a toxic mushroom", dead: "didn't survive a toxic mushroom", egg: "an egg in the nest", chick: "a chick in the nest" })[s]}.`; }
    if (id === "week") return `${world.snail.albino ? "Albino snail" : name}: ${world.snail.eating > 0 ? "nibbling a mushroom" : world.snail.pause > 0 ? "resting" : "gliding along the soil"}.`;
    if (id === "names10" && world.ladybug?.hunting) return `${name}: climbing the sprout to hunt aphids.`;
    if (items.get(id)?.achievement.kind === "decoration") return `${name}: drag it, or use the arrow keys, to move it.`;
    return `${name}.`;
  }
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBackdrop();
    if (world.tree) drawTree();
    if (world.fungus) drawMycelium();
    if (world.leaves) drawLeaves();
    const layered = [...world.decor.values()].map(d => ({ y: decorY(d), draw: () => drawDecor(d) }));
    if (world.plant) layered.push({ y: ground + 2, draw: drawPlant });
    if (world.flowers) layered.push({ y: ground + 2, draw: drawFlowers });
    if (world.fungus) for (const fr of world.fungus.fruits) layered.push({ y: ground + 3, draw: () => drawMushroom(fr) });
    if (world.garden.length) layered.push({ y: ground + 5, draw: drawGarden });
    for (const r of world.residents) if (TerraLife.KINDS[r.kind].move === "static") layered.push({ y: ground + 2 + (hashText(r.id) % 4), draw: () => drawResident(r) });
    for (const l of layered.sort((a, b) => a.y - b.y)) l.draw();
    for (const r of world.residents) if (TerraLife.KINDS[r.kind].move !== "static") drawResident(r);
    drawCreatures();
    drawWeatherAndNight();
    for (const sp of world.sparkles) { ctx.globalAlpha = clamp(sp.life, 0, 1); emoji("✨", sp.x, sp.y - (1.5 - sp.life) * 20, 18); ctx.globalAlpha = 1; }
    if (selected) {
      const at = locate(selected);
      if (at) {
        const pulse = 1 + Math.sin(time * 4) * 0.08;
        ctx.strokeStyle = "#f2c94c"; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(at.x, at.y, at.r * pulse, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        const label = thing(selected)?.name ?? "";
        ctx.font = "600 12px system-ui, sans-serif"; const w = ctx.measureText(label).width + 14;
        const lx = clamp(at.x - w / 2, 4, W - w - 4), ly = clamp(at.y - at.r - 26, 4, H - 22);
        ctx.fillStyle = "rgba(33,76,60,.92)"; ctx.beginPath(); ctx.roundRect(lx, ly, w, 20, 10); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(label, lx + 7, ly + 10);
      }
    }
    // Glass highlights
    ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.beginPath(); ctx.ellipse(W * 0.12, H * 0.3, W * 0.025, H * 0.22, 0.05, 0, 7); ctx.fill();
  }

  // ---------- loop ----------
  function step(dt) {
    time += dt;
    if (world.fungus) updateFungus(dt);
    updateCreatures(dt);
    updateLiving(dt);
  }
  function frame(now) {
    running = false;
    if (!canvas.isConnected || document.hidden || !host.checkVisibility()) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (!paused) for (let i = 0; i < speed; i++) step(dt);
    render();
    running = true; requestAnimationFrame(frame);
  }
  function wake() {
    if (!resize()) return;
    if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
  }
  new ResizeObserver(() => { if (resize()) { render(); wake(); } }).observe(host);
  document.addEventListener("visibilitychange", wake);

  // ---------- interaction ----------
  function hit(px, py) {
    for (const d of [...world.decor.values()].reverse()) { const at = locate(d.id); if (Math.hypot(px - at.x, py - at.y) < at.r) return d.id; }
    const ids = [...[...world.residents].reverse().filter(r => TerraLife.KINDS[r.kind].move !== "static").map(r => r.id), "followers10", "groups3", "week", "names10",
      ...world.residents.filter(r => TerraLife.KINDS[r.kind].move === "static").map(r => r.id), ...world.garden.map(g => g.id), "obs5", "first", "obs25", "obs50", "obs10"];
    for (const id of ids) { const at = locate(id); if (at && Math.hypot(px - at.x, py - at.y) < at.r) return id; }
    return null;
  }
  const selectable = id => Boolean(id && (items.has(id) || resident(id) || world.garden.some(g => g.id === id) || world.decor.has(id)));
  function select(id, { announce = true } = {}) {
    selected = selectable(id) ? id : null;
    if (selected && announce) say(describe(selected));
    showGuide(selected);
    render();
  }
  const point = event => { const r = canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; };
  canvas.addEventListener("pointerdown", event => {
    const [px, py] = point(event), id = hit(px, py);
    select(id);
    if (id && world.decor.has(id)) { dragging = { id, moved: false }; canvas.setPointerCapture(event.pointerId); event.preventDefault(); }
  });
  canvas.addEventListener("pointermove", event => {
    if (!dragging) return;
    const [px, py] = point(event), d = world.decor.get(dragging.id);
    d.x = clamp(px / W, 0.04, 0.96); d.y = clamp((py - ground - 4) / ((H - ground) * 0.45), 0, 1);
    dragging.moved = true; render();
  });
  const drop = () => {
    if (dragging?.moved) { const d = world.decor.get(dragging.id); onMove(d.id, d.x, d.y); say(`${d.item} moved.`); }
    dragging = null;
  };
  canvas.addEventListener("pointerup", drop);
  canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("keydown", event => {
    if (event.key === "Escape") { select(null); return; }
    const d = selected && world.decor.get(selected);
    const delta = { ArrowLeft: [-0.03, 0], ArrowRight: [0.03, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[event.key];
    if (!d || !delta) return;
    event.preventDefault();
    d.x = clamp(d.x + delta[0], 0.04, 0.96); d.y = clamp(d.y + delta[1], 0, 1);
    onMove(d.id, d.x, d.y); render();
  });

  // ---------- public ----------
  // entries: [{ achievement, grant }] for every item on display. growth: achievements unlocked.
  // entries: [{ achievement, grant }] for every item on display. growth: achievements unlocked.
  // finds: TerraLife.inhabitants(); garden/questDecor: TerraQuests.inventory(); journalCount drives rain.
  function show(entries, { growth = 0, fresh = [], label = "", finds = [], garden = [], questDecor = [], journalCount = null, south = false, sandbox: preview = false, date } = {}) {
    items = new Map(entries.map(e => [e.achievement.id, e]));
    level = growth; findList = finds; gardenList = garden; questDecorList = questDecor; southern = south; sandbox = preview;
    if (date) today = date;
    computeEnv();
    resize(); sync();
    for (const id of fresh) { const at = locate(id); if (at) world.sparkles.push({ x: at.x, y: at.y, life: 1.5 }); }
    if (selected && !selectable(selected)) selected = null;
    showGuide(selected);
    // Rain when there are new journal entries since you last looked. It makes mushrooms fruit.
    if (!sandbox && Number.isInteger(journalCount)) {
      const state = readRare();
      if (state.seen !== null && journalCount > state.seen) startRain(45, "It's raining: your new finds watered the jar. Watch for mushrooms!");
      if (state.seen !== journalCount) { state.seen = journalCount; writeRare(state); }
    }
    canvas.setAttribute("aria-label", `${label} ${env.season}, ${env.phase}. Select an item in the collection or tap something in the jar to see its field-guide card. When a decoration is highlighted, arrow keys move it.`.trim());
    render(); wake();
  }
  function setSpeed(next) { if (next === 0) paused = true; else { paused = false; speed = next; } wake(); }
  function setEnvironment({ season = null, phase = null } = {}) { envOverride = { season, phase }; life.fireflies = []; computeEnv(); render(); }
  function care(kind) { if (kind === "mist") mist(); else if (kind === "seed") scatter(); else if (kind === "rain") startRain(30, "You made it rain. Mushrooms love this."); wake(); render(); }
  // Rare sightings, like a field guide of shinies: every rare, with the date you first saw it.
  function rares() { const seen = readRare().rare; return TerraLife.RARES.map(r => ({ ...r, seen: seen[r.id] ?? null })); }
  return Object.freeze({
    show, select, wake, setSpeed, render, setEnvironment, care, rares,
    onMove(fn) { onMove = fn; },
    onRare(fn) { onRare = fn; },
    step(seconds, dt = 0.05) { for (let t = 0; t < seconds; t += dt) step(dt); render(); },
    debug: () => ({ selected, paused, speed, level, bird: world.bird && { state: world.bird.state }, snail: world.snail && { eating: world.snail.eating > 0 }, fruits: world.fungus?.fruits.map(f => ({ phase: f.phase, species: f.species, x: f.x })) ?? [], mycelium: world.fungus?.links.length ?? 0, nodes: world.fungus?.nodes.length ?? 0, decor: Object.fromEntries([...world.decor.values()].map(d => [d.id, { x: d.x, y: d.y }])), items: [...items.keys()],
      env: { ...env }, raining: weather.rain > 0, residents: world.residents.map(r => ({ id: r.id, kind: r.kind, x: r.x, golden: Boolean(r.golden) })), garden: world.garden.map(g => g.id),
      aphids: life.aphids.length, flies: life.flies.length, fireflies: life.fireflies.length, seeds: life.seeds.length, visitors: life.visitors.map(v => v.id), albino: Boolean(world.snail?.albino), ladybugClimb: world.ladybug?.climb ?? 0 }),
    get paused() { return paused; }
  });
})();
