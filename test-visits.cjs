const assert = require('node:assert/strict');
const test = require('node:test');
const V = require('./visits.js');
const R = require('./rewards.js');
const L = require('./terrarium-life.js');
const Q = require('./quests.js');
const D = require('./dex.js');
const lib = { catalog: R.CATALOG, kinds: L.KINDS, seeds: Q.SEEDS, decor: Q.DECOR, sets: D.SETS };
const JAR = '0123456789abcdef';

const snap = () => V.snapshot({ jarId: JAR, name: 'Ada‮ Field\n', avatar: 'fern', xp: { level: 3, name: 'Sapling' },
  grants: [{ badge: 'first', token: 'a'.repeat(32), placed: true, x: 0.2, y: 0.5 }, { badge: 'obs5', token: 'b'.repeat(32), placed: false }],
  species: [{ kind: 'frog', stage: 2, name: 'Pacific tree frog', unknown: false, scientific: 'Pseudacris regilla', first: '2024-01-01', count: 5 }, { kind: 'lbm', stage: 0, name: 'Unknown', unknown: true }],
  garden: [{ id: 'tulip', token: 'c'.repeat(32), planted: '2024-01-01' }], decor: [{ id: 'lantern', x: 0.4, y: 0.6, token: 'd'.repeat(32) }], sets: ['pond'], today: '2024-03-13' });

test('jar snapshots carry only what a visitor needs, cleaned', () => {
  const s = snap();
  assert.equal(s.name, 'Ada Field', 'control and bidi characters removed');
  assert.deepEqual(s.items, [{ b: 'first', x: 0.2, y: 0.5 }], 'only items on display');
  assert.deepEqual(s.species, [{ k: 'frog', s: 2, n: 'Pacific tree frog' }], 'no unknowns, no scientific names, dates or counts');
  assert.deepEqual(s.garden, ['tulip']);
  assert.deepEqual(s.decor, [{ d: 'lantern', x: 0.4, y: 0.6 }]);
  const text = JSON.stringify(s);
  assert.doesNotMatch(text, /token|aaaa|Pseudacris|2024-01-01|location|notes/);
  assert.deepEqual(V.validJar(s, lib), s);
});

test('links round-trip and hostile snapshots are rejected', async () => {
  const s = snap(), code = await V.encode(s);
  assert.match(code, /^[zp]1\.[A-Za-z0-9_-]+$/);
  assert.ok(code.length < 600, `${code.length} chars`);
  assert.deepEqual(V.validJar(await V.decode(code), lib), s);
  assert.deepEqual(V.parseLink(`https://example.org/terra/?visit=${code}#terrarium`), { kind: 'visit', code });
  assert.deepEqual(V.parseLink(`see this ?gift=${code}`), { kind: 'gift', code });
  assert.equal(V.parseLink('hello'), null);
  for (const bad of ['', 'x1.abc', 'z1.$$$', 'p1.' + 'A'.repeat(9000)]) await assert.rejects(V.decode(bad));
  const mutate = f => { const c = JSON.parse(JSON.stringify(s)); f(c); return c; };
  for (const evil of [
    mutate(c => { c.items.push({ b: '__proto__' }); }), mutate(c => { c.species[0].k = 'dragon'; }), mutate(c => { c.species[0].s = 7; }),
    mutate(c => { c.name = 'x'.repeat(41); }), mutate(c => { c.id = 'nothex'; }), mutate(c => { c.garden = ['poison']; }),
    mutate(c => { c.decor[0].x = 5; }), mutate(c => { c.level = 99; }), mutate(c => { c.species = Array(25).fill(c.species[0]); }), mutate(c => { c.t = 'gift'; })
  ]) assert.throws(() => V.validJar(evil, lib), /bad_jar/);
});

test('seed gifts: addressed to one jar, planted once, one a day per friend', async () => {
  let mine = V.withJarId(V.parse(null));
  assert.match(mine.jarId, /^[a-f0-9]{16}$/);
  const g = V.validGift(await V.decode(await V.encode(V.gift({ to: mine.jarId, seed: 'sunflower', from: 'Ben', note: 'For your jar! 🌻', today: '2024-03-13' }))), lib);
  assert.deepEqual([g.seed, g.from, g.note], ['sunflower', 'Ben', 'For your jar! 🌻']);
  let r = V.redeem(mine, g, '2024-03-14');
  assert.equal(r.result, 'planted');
  mine = r.state;
  assert.equal(V.redeem(mine, g, '2024-03-15').result, 'already');
  assert.equal(V.redeem(V.withJarId(V.parse(null)), g, '2024-03-14').result, 'not_yours');
  assert.deepEqual(V.garden(mine, Q.SEEDS).map(x => [x.id, x.from, x.note, x.planted]), [['sunflower', 'Ben', 'For your jar! 🌻', '2024-03-14']]);
  assert.deepEqual(V.parse(JSON.stringify(mine)), mine);
  // Senders: one gift per friend's jar per day.
  let sender = V.withJarId(V.parse(null));
  assert.equal(V.canGift(sender, JAR, '2024-03-13'), true);
  sender = V.markSent(sender, JAR, '2024-03-13');
  assert.equal(V.canGift(sender, JAR, '2024-03-13'), false);
  assert.equal(V.canGift(sender, JAR, '2024-03-14'), true);
  for (const bad of [{ ...g, seed: 'weed' }, { ...g, to: 'x' }, { ...g, note: 'n'.repeat(81) }, { ...g, t: 'jar' }]) assert.throws(() => V.validGift(bad, lib), /bad_gift/);
  assert.throws(() => V.parse(JSON.stringify({ version: 1, jarId: 'zz', received: {}, sent: {} })), /Unsupported/);
});
