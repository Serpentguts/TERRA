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
  const world = { plant: null, flowers: null, tree: null, fungus: null, leaves: null, snail: null, ladybug: null, butterfly: null, bird: null, decor: new Map(), sparkles: [] };
  const say = text => { if (caption && text) caption.textContent = text; };

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
    for (const id of [...world.decor.keys()]) if (!has(id)) world.decor.delete(id);
    let slot = 0;
    for (const [id, { achievement, grant }] of items) {
      if (achievement.kind !== "decoration") continue;
      const d = world.decor.get(id) ?? { id, x: grant.x ?? [0.12, 0.42, 0.66, 0.9, 0.24][slot % 5], y: grant.y ?? 0.35, icon: achievement.icon, item: achievement.item };
      if (grant.x !== undefined && !(dragging && dragging.id === id)) { d.x = grant.x; d.y = grant.y; }
      world.decor.set(id, d); slot++;
    }
    if (world.fungus && !world.fungus.origin) seedMycelium();
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
  function seedMycelium() {
    const f = world.fungus, x = fruitingSpots()[0];
    f.origin = { x, y: 0.25 };
    f.links = [{ x1: x, y1: 0.25, x2: x + 0.02, y2: 0.3 }];
    for (let i = 0; i < 40; i++) growMycelium();
    spawnFruit(x);
  }
  // Mycelium lives in fractions of the soil band (y: 0 = surface, 1 = bottom).
  function growMycelium(toward) {
    const f = world.fungus;
    if (f.links.length > 220) f.links.shift();
    const from = toward ? f.links.reduce((best, l) => Math.abs(l.x2 - toward) < Math.abs(best.x2 - toward) ? l : best, f.links[0]) : pick(f.links);
    const goal = toward ?? from.x2 + rand(-0.1, 0.1);
    const angle = Math.atan2(rand(-0.06, 0.08), goal - from.x2 || rand(-1, 1));
    const len = rand(0.025, 0.05);
    const x2 = clamp(from.x2 + Math.cos(angle) * len, 0.03, 0.97), y2 = clamp(from.y2 + Math.sin(angle) * len * 1.6 + rand(-0.03, 0.03), 0.08, 0.92);
    f.links.push({ x1: from.x2, y1: from.y2, x2, y2 });
    return { x: x2, y: y2 };
  }
  function spawnFruit(x) {
    const f = world.fungus;
    if (f.fruits.length >= 3) return;
    // The network grows out to the new spot first, then a pin pushes up.
    let tip = { x: f.links.at(-1).x2 };
    for (let i = 0; i < 6 && Math.abs(tip.x - x) > 0.02; i++) tip = growMycelium(x);
    f.fruits.push({ x, phase: "pin", age: 0, species: Math.random() < 0.7 ? "amanita" : "brown", size: rand(0.85, 1.2), spores: [] });
    say(`A mushroom is pinning ${world.tree && Math.abs(x - world.tree.x) < 0.16 ? "under the oak" : world.plant && Math.abs(x - world.plant.x) < 0.12 ? "beside the plant" : "in the soil"}.`);
  }
  const PHASES = { pin: 6, growing: 10, mature: 24, decaying: 10 };
  function updateFungus(dt) {
    const f = world.fungus;
    if (Math.random() < dt * 0.6) growMycelium();
    for (const fruit of f.fruits) {
      fruit.age += dt;
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
          if (Math.random() < 0.6) fly(b, { x: fruits.length && Math.random() < 0.7 ? X(pick(fruits).x) + rand(-14, 14) : rand(W * 0.1, W * 0.9), y: ground - 2, landing: "ground" });
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
        if (near && Math.random() < dt * 0.8) { b.state = "peck"; b.timer = 1.6; b.target = near; b.dir = X(near.x) >= b.x ? 1 : -1; say("The bird is pecking at a mushroom."); break; }
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
      if (s.pause > 0) s.pause -= dt;
      else {
        s.x += s.dir * dt * 0.012;
        if (s.x > 0.94 || s.x < 0.06) s.dir *= -1;
        if (Math.random() < dt * 0.05) s.pause = rand(2, 6);
        if (!s.trail.length || Math.abs(s.trail.at(-1).x - s.x) > 0.01) s.trail.push({ x: s.x, life: 1 });
      }
      for (const p of s.trail) p.life -= dt * 0.08;
      s.trail = s.trail.filter(p => p.life > 0);
    }
    const l = world.ladybug;
    if (l) {
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
        lv.timer = rand(5, 11);
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
  function emoji(char, x, y, size, { flip = false, rotate = 0, alpha = 1, scaleY = 1 } = {}) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rotate); ctx.scale(flip ? -1 : 1, scaleY);
    ctx.shadowColor = "rgba(30,40,30,.45)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5; // Keeps pale creatures readable.
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(char, 0, 0); ctx.restore();
  }
  function drawBackdrop() {
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, "#eef6f1"); sky.addColorStop(1, "#dcebdc");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ground);
    const soil = ctx.createLinearGradient(0, ground, 0, H);
    soil.addColorStop(0, "#7a5b3e"); soil.addColorStop(0.55, "#664a32"); soil.addColorStop(1, "#4d3725");
    ctx.fillStyle = soil; ctx.fillRect(0, ground, W, H - ground);
    const pebbles = seeded(3);
    for (let i = 0; i < 26; i++) { ctx.fillStyle = `rgba(${150 + pebbles() * 60},${130 + pebbles() * 40},${110 + pebbles() * 30},.5)`; ctx.beginPath(); ctx.ellipse(pebbles() * W, ground + 14 + pebbles() * (H - ground - 18), 2 + pebbles() * 3, 1.5 + pebbles() * 2, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#6d8f5a"; ctx.fillRect(0, ground - 3, W, 7);
    const grass = seeded(11);
    ctx.strokeStyle = "#5d8a4a"; ctx.lineWidth = 1.2;
    for (let i = 0; i < W / 5; i++) { const gx = i * 5 + grass() * 3, gh = 4 + grass() * 7, sway = Math.sin(time * 1.8 + i * 0.4) * 1.5; ctx.beginPath(); ctx.moveTo(gx, ground + 2); ctx.quadraticCurveTo(gx + sway, ground - gh / 2, gx + sway * 1.5, ground - gh); ctx.stroke(); }
  }
  function drawMycelium() {
    const f = world.fungus;
    const xray = selected === "obs5", resting = !f.fruits.length;
    const alpha = xray ? 0.95 : resting ? 0.42 : 0.16;
    if (xray) { ctx.fillStyle = "rgba(20,26,40,.42)"; ctx.fillRect(0, ground + 4, W, H - ground - 4); }
    ctx.save(); ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(245,240,225,${alpha})`; ctx.lineWidth = xray ? 1.6 : 1.1;
    if (xray) { ctx.shadowColor = "#fff8d8"; ctx.shadowBlur = 6; }
    const band = H - ground - 6, y = v => ground + 6 + v * band;
    ctx.beginPath();
    for (const l of f.links) { ctx.moveTo(X(l.x1), y(l.y1)); ctx.lineTo(X(l.x2), y(l.y2)); }
    // Each fruit is fed by a strand from the network up to the surface.
    for (const fruit of f.fruits) { const near = f.links.reduce((b, l) => Math.abs(l.x2 - fruit.x) < Math.abs(b.x2 - fruit.x) ? l : b, f.links[0]); ctx.moveTo(X(near.x2), y(near.y2)); ctx.quadraticCurveTo(X(fruit.x), y(0.1), X(fruit.x), ground + 2); }
    ctx.stroke(); ctx.restore();
  }
  function drawMushroom(fruit) {
    const g = mushroomGrowth(fruit) * fruit.size, x = X(fruit.x);
    const decay = fruit.phase === "decaying" ? fruit.age / PHASES.decaying : 0;
    const stemH = 4 + 16 * g, capW = 3 + 11 * g, capH = 2 + 6 * g;
    ctx.save(); ctx.translate(x, ground + 2);
    ctx.rotate(decay * 0.5 * (fruit.x > 0.5 ? 1 : -1));
    ctx.fillStyle = `rgb(${Math.round(lerp(240, 150, decay))},${Math.round(lerp(232, 135, decay))},${Math.round(lerp(210, 110, decay))})`;
    ctx.fillRect(-1.5 - g * 1.5, -stemH, 3 + g * 3, stemH);
    const cap = fruit.species === "amanita" ? [210, 52, 40] : [168, 120, 72];
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
    const sway = Math.sin(time * 0.9) * 2;
    for (const [dx, dy, rr, c] of [[-0.55, 0.55, 0.62, "#3f7a46"], [0.5, 0.5, 0.6, "#3a7040"], [0, 0.25, 0.72, "#4a8a4f"], [-0.2, 0.75, 0.55, "#447f49"], [0.3, 0.8, 0.5, "#3f7a46"]]) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(t.x + dx * t.r + sway * (1 - dy), t.top + dy * t.r, rr * t.r, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#2f5f3a"; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(t.x + Math.cos(i * 2.4) * t.r * 0.7 + sway, t.top + t.r * 0.55 + Math.sin(i * 2.4) * t.r * 0.45, 3, 0, 7); ctx.fill(); }
    if (world.bird) { const n = nestSpot(); ctx.fillStyle = "#8b6a3e"; ctx.beginPath(); ctx.ellipse(n.x, n.y + 2, 11, 5, 0, 0, Math.PI); ctx.fill(); ctx.strokeStyle = "#5f4426"; ctx.lineWidth = 1; for (let i = -9; i < 10; i += 3) { ctx.beginPath(); ctx.moveTo(n.x + i, n.y + 1); ctx.lineTo(n.x + i + 3, n.y + 5); ctx.stroke(); } }
  }
  function drawBench(x, y) {
    ctx.fillStyle = "#8a5a33";
    ctx.fillRect(x - 20, y - 14, 40, 4); ctx.fillRect(x - 20, y - 22, 40, 3);
    ctx.fillStyle = "#5b3b22"; for (const lx of [-17, 14]) ctx.fillRect(x + lx, y - 14, 3, 14); ctx.fillRect(x - 18, y - 22, 2, 8); ctx.fillRect(x + 16, y - 22, 2, 8);
  }
  function drawDecor(d) {
    const x = X(d.x), y = decorY(d), size = decorSize(d);
    if (d.id === "verified1") { const glow = ctx.createRadialGradient(x, y - size / 2, 2, x, y - size / 2, size); glow.addColorStop(0, `rgba(190,230,255,${0.45 + Math.sin(time * 2) * 0.2})`); glow.addColorStop(1, "rgba(190,230,255,0)"); ctx.fillStyle = glow; ctx.fillRect(x - size, y - size * 1.5, size * 2, size * 2); }
    if (d.id === "days30") drawBench(x, y); else emoji(d.icon, x, y, size);
    if (d.id === "groups5") { ctx.fillStyle = "rgba(95,150,70,.75)"; ctx.beginPath(); ctx.ellipse(x - 3, y - size * 0.72, size * 0.28, 4, -0.2, 0, 7); ctx.fill(); }
  }
  function drawCreatures() {
    const s = world.snail;
    if (s) {
      ctx.fillStyle = "rgba(220,230,240,.35)"; for (const p of s.trail) { ctx.globalAlpha = p.life * 0.5; ctx.fillRect(X(p.x) - 2, ground + 1, 4, 1.5); } ctx.globalAlpha = 1;
      emoji("🐌", X(s.x), ground + 4, 22, { flip: s.dir > 0 });
    }
    if (world.ladybug) emoji("🐞", X(world.ladybug.x), ground + 3, 13, { flip: world.ladybug.dir > 0 });
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
    const leaf = (x, y, r, c) => { ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.4, 0, 0, 7); ctx.fill(); ctx.restore(); };
    for (const l of lv.ground) leaf(X(l.x), ground + 2, l.r, l.c);
    for (const f of lv.falling) leaf(f.x, f.y, f.r, f.c);
  }
  // Where each item is, for highlighting and tapping.
  function locate(id) {
    switch (id) {
      case "first": return world.plant && { x: X(world.plant.x), y: ground - plantHeight() / 2, r: Math.max(24, plantHeight() / 1.6) };
      case "obs25": return world.flowers && { x: X(world.flowers.x), y: ground - 30, r: 34 };
      case "obs50": return world.tree && (t => ({ x: t.x, y: t.top + t.r * 0.9, r: t.r * 1.2 }))(treeShape());
      case "obs5": { const f = world.fungus; if (!f) return null; const fr = f.fruits[0]; return fr ? { x: X(fr.x), y: ground - 10, r: 22 } : { x: X(f.origin.x), y: ground + (H - ground) * 0.4, r: 40 }; }
      case "obs10": return world.leaves && { x: W * 0.5, y: ground, r: 30 };
      case "week": return world.snail && { x: X(world.snail.x), y: ground - 8, r: 18 };
      case "names10": return world.ladybug && { x: X(world.ladybug.x), y: ground - 5, r: 14 };
      case "groups3": return world.butterfly && { x: world.butterfly.x, y: world.butterfly.y, r: 18 };
      case "followers10": return world.bird?.from && { x: world.bird.x, y: world.bird.y - 8, r: 20 };
      default: { const d = world.decor.get(id); return d && { x: X(d.x), y: decorY(d) - decorSize(d) / 2, r: decorSize(d) * 0.8 }; }
    }
  }
  function describe(id) {
    const name = items.get(id)?.achievement.item ?? "";
    if (id === "obs5") { const f = world.fungus, n = f.fruits.filter(x => x.phase !== "decaying").length; return n ? `${name}: ${n} mushroom${n === 1 ? "" : "s"} fruiting from the mycelium below.` : `${name}: resting as mycelium underground (shown in X-ray). It will pin again near a tree or plant.`; }
    if (id === "first") return `${name}: growth stage ${1 + Math.round(plantGrowth() * 5)} of 6. It grows with every achievement you unlock.`;
    if (id === "followers10") { const s = world.bird.state; return `${name}: ${({ perch: "perched", fly: "flying", ground: "hopping on the ground", peck: "pecking a mushroom", sick: "feeling unwell after a toxic mushroom", dead: "didn't survive a toxic mushroom", egg: "an egg in the nest", chick: "a chick in the nest" })[s]}.`; }
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
    for (const l of layered.sort((a, b) => a.y - b.y)) l.draw();
    drawCreatures();
    for (const sp of world.sparkles) { ctx.globalAlpha = clamp(sp.life, 0, 1); emoji("✨", sp.x, sp.y - (1.5 - sp.life) * 20, 18); ctx.globalAlpha = 1; }
    if (selected) {
      const at = locate(selected);
      if (at) {
        const pulse = 1 + Math.sin(time * 4) * 0.08;
        ctx.strokeStyle = "#f2c94c"; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(at.x, at.y, at.r * pulse, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        const label = items.get(selected)?.achievement.item ?? "";
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
    for (const id of ["followers10", "groups3", "week", "names10", "obs5", "first", "obs25", "obs50", "obs10"]) { const at = locate(id); if (at && Math.hypot(px - at.x, py - at.y) < at.r) return id; }
    return null;
  }
  function select(id, { announce = true } = {}) {
    selected = id && items.has(id) ? id : null;
    if (selected && announce) say(describe(selected));
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
  function show(entries, { growth = 0, fresh = [], label = "" } = {}) {
    items = new Map(entries.map(e => [e.achievement.id, e]));
    level = growth;
    resize(); sync();
    for (const id of fresh) { const at = locate(id); if (at) world.sparkles.push({ x: at.x, y: at.y, life: 1.5 }); }
    if (selected && !items.has(selected)) selected = null;
    canvas.setAttribute("aria-label", `${label} Select an item in the collection to highlight it here. When a decoration is highlighted, arrow keys move it.`.trim());
    render(); wake();
  }
  function setSpeed(next) { if (next === 0) paused = true; else { paused = false; speed = next; } wake(); }
  return Object.freeze({
    show, select, wake, setSpeed, render,
    onMove(fn) { onMove = fn; },
    step(seconds, dt = 0.05) { for (let t = 0; t < seconds; t += dt) step(dt); render(); },
    debug: () => ({ selected, paused, speed, level, bird: world.bird && { state: world.bird.state }, fruits: world.fungus?.fruits.map(f => ({ phase: f.phase, species: f.species, x: f.x })) ?? [], mycelium: world.fungus?.links.length ?? 0, decor: Object.fromEntries([...world.decor.values()].map(d => [d.id, { x: d.x, y: d.y }])), items: [...items.keys()] }),
    get paused() { return paused; }
  });
})();
