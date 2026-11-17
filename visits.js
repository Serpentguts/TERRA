"use strict";

// Visiting friends' jars and seed gifts, without accounts: everything travels in a link.
// - "Share my jar" makes a link carrying a snapshot of your jar: items, species (kind, stage, name),
//   garden flowers, decorations, level and display name. Never locations, notes, dates or ids.
// - A visitor can leave a seed gift: a second link, addressed to that jar, with a short note.
// - Opening a gift link plants the flower in your garden, once.
// Links are compressed and strictly validated; anything they contain is shown as plain text.
const TerraVisits = (() => {
  const KEY = "terra.gifts.v1";
  const MAX_CODE = 8000;
  const hex = (n = 16) => { const b = new Uint8Array(n / 2); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, "0")).join(""); };
  const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const isDate = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const isId = id => typeof id === "string" && /^[a-f0-9]{16}$/.test(id);
  const frac = n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

  // ---- encoding: JSON → (deflate) → base64url, with a version prefix ----
  const b64 = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const unb64 = text => { const s = atob(text.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  async function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream !== "undefined") { try { return `z1.${b64(await pipe(bytes, new CompressionStream("deflate-raw")))}`; } catch { /* Fall back to plain. */ } }
    return `p1.${b64(bytes)}`;
  }
  async function decode(code) {
    code = String(code ?? "").trim();
    if (!code || code.length > MAX_CODE || !/^[zp]1\.[A-Za-z0-9_-]+$/.test(code)) throw Error("bad_code");
    let bytes = unb64(code.slice(3));
    if (code[0] === "z") {
      if (typeof DecompressionStream === "undefined") throw Error("unsupported");
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    }
    if (bytes.length > 64 * 1024) throw Error("bad_code");
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  // Accept a full link, a ?visit= / ?gift= query, or a bare code.
  function parseLink(text) {
    const s = String(text ?? "").trim();
    try { const u = new URL(s); for (const k of ["visit", "gift"]) { const c = u.searchParams.get(k); if (c) return { kind: k, code: c }; } } catch { /* Not a URL. */ }
    const m = s.match(/[?&](visit|gift)=([zp]1\.[A-Za-z0-9_-]+)/);
    if (m) return { kind: m[1], code: m[2] };
    if (/^[zp]1\./.test(s)) return { kind: null, code: s };
    return null;
  }

  // ---- jar snapshots ----
  // lib: { catalog (TerraRewards.CATALOG), kinds (TerraLife.KINDS), seeds, decor (TerraQuests), sets (TerraDex.SETS), avatars (TerraAvatars.ICONS ids) }
  function snapshot({ jarId, name, avatar, xp, grants, species, garden, decor, sets, today }) {
    return {
      v: 1, t: "jar", id: jarId, name: clean(name, 40) || "A TERRA explorer", avatar: typeof avatar === "string" ? avatar.slice(0, 24) : "leaf",
      level: xp.level, levelName: xp.name, made: today,
      items: grants.filter(g => g.placed).map(g => ({ b: g.badge, ...(frac(g.x) && frac(g.y) ? { x: g.x, y: g.y } : {}) })),
      species: species.filter(s => !s.unknown).slice(0, 24).map(s => ({ k: s.kind, s: s.stage, n: clean(s.name, 40) })),
      garden: garden.slice(0, 20).map(g => g.id),
      decor: decor.slice(0, 12).map(d => ({ d: d.id, ...(frac(d.x) && frac(d.y) ? { x: d.x, y: d.y } : {}) })),
      sets: sets.slice(0, 8)
    };
  }
  function validJar(s, lib) {
    const ok = s && s.v === 1 && s.t === "jar" && isId(s.id) && typeof s.name === "string" && s.name.length <= 40 && typeof s.avatar === "string" && s.avatar.length <= 24 &&
      Number.isInteger(s.level) && s.level >= 1 && s.level <= 7 && typeof s.levelName === "string" && s.levelName.length <= 30 && isDate(s.made) &&
      Array.isArray(s.items) && s.items.length <= lib.catalog.length && s.items.every(i => i && lib.catalog.some(a => a.id === i.b) && (i.x === undefined || (frac(i.x) && frac(i.y)))) &&
      Array.isArray(s.species) && s.species.length <= 24 && s.species.every(x => x && Object.hasOwn(lib.kinds, x.k) && Number.isInteger(x.s) && x.s >= 0 && x.s <= 2 && typeof x.n === "string" && x.n.length <= 40) &&
      Array.isArray(s.garden) && s.garden.length <= 20 && s.garden.every(g => lib.seeds.some(x => x.id === g)) &&
      Array.isArray(s.decor) && s.decor.length <= 12 && s.decor.every(d => d && lib.decor.some(x => x.id === d.d) && (d.x === undefined || (frac(d.x) && frac(d.y)))) &&
      Array.isArray(s.sets) && s.sets.length <= 8 && s.sets.every(id => lib.sets.some(x => x.id === id));
    if (!ok) throw Error("bad_jar");
    return { ...s, name: clean(s.name, 40) || "A TERRA explorer", levelName: clean(s.levelName, 30), species: s.species.map(x => ({ ...x, n: clean(x.n, 40) })) };
  }

  // ---- gifts ----
  function gift({ to, seed, from, note, today }) {
    return { v: 1, t: "gift", id: hex(), to, seed, from: clean(from, 40) || "A friend", note: clean(note, 80), made: today };
  }
  function validGift(g, lib) {
    const ok = g && g.v === 1 && g.t === "gift" && isId(g.id) && isId(g.to) && lib.seeds.some(x => x.id === g.seed) &&
      typeof g.from === "string" && g.from.length <= 40 && typeof g.note === "string" && g.note.length <= 80 && isDate(g.made);
    if (!ok) throw Error("bad_gift");
    return { ...g, from: clean(g.from, 40) || "A friend", note: clean(g.note, 80) };
  }
  function parse(raw) {
    if (raw === null) return { version: 1, jarId: null, received: {}, sent: {} };
    const s = JSON.parse(raw);
    if (!s || s.version !== 1 || !(s.jarId === null || isId(s.jarId)) || !s.received || typeof s.received !== "object" || Array.isArray(s.received) || Object.keys(s.received).length > 500 ||
        !Object.entries(s.received).every(([id, r]) => isId(id) && r && typeof r.seed === "string" && typeof r.from === "string" && r.from.length <= 40 && typeof r.note === "string" && r.note.length <= 80 && isDate(r.planted)) ||
        !s.sent || typeof s.sent !== "object" || !Object.entries(s.sent).every(([id, d]) => isId(id) && isDate(d)))
      throw Error("Unsupported or damaged gift data");
    return { version: 1, jarId: s.jarId, received: { ...s.received }, sent: { ...s.sent } };
  }
  const withJarId = state => state.jarId ? state : { ...state, jarId: hex() };
  // Plant a gift once, and only if it was addressed to this jar.
  function redeem(state, g, today) {
    if (g.to !== state.jarId) return { state, result: "not_yours" };
    if (state.received[g.id]) return { state, result: "already" };
    return { state: { ...state, received: { ...state.received, [g.id]: { seed: g.seed, from: g.from, note: g.note, planted: today } } }, result: "planted" };
  }
  // One gift per friend's jar per day (honour system until accounts).
  const canGift = (state, jarId, today) => state.sent[jarId] !== today;
  const markSent = (state, jarId, today) => ({ ...state, sent: { ...state.sent, [jarId]: today } });
  // Gift flowers for the jar's garden.
  const garden = (state, seeds) => Object.entries(state.received).sort((a, b) => a[1].planted.localeCompare(b[1].planted))
    .map(([id, r]) => ({ ...seeds.find(s => s.id === r.seed), token: `gift${id}`, planted: r.planted, from: r.from, note: r.note })).filter(g => g.id);
  return Object.freeze({ KEY, encode, decode, parseLink, snapshot, validJar, gift, validGift, parse, withJarId, redeem, canGift, markSent, garden, clean });
})();
if (typeof module !== "undefined") module.exports = TerraVisits;
