const assert = require('node:assert/strict');
const test = require('node:test');
const L = require('./terrarium-life.js');
const Dex = require('./dex.js');

const rec = (id, date, name, type = 'other', extra = {}) => ({ id, type, name, notes: '', date, privacy: 'hidden', ...extra });
const many = (name, n, type = 'other', extra) => Array.from({ length: n }, (_, i) => rec(`${name}-${i}`, `2024-01-${String(i + 1).padStart(2, '0')}`, name, type, extra));

test('one resident per species, evolving at 1, 3 and 5 sightings', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(L.stageFor), [0, 0, 0, 1, 1, 2, 2]);
  const sp = L.species([...many('Pacific tree frog', 5), ...many('Robin', 3, 'bird'), ...many('Hermit crab', 1)]);
  const by = Object.fromEntries(sp.map(s => [s.name, s]));
  assert.deepEqual([by['Pacific tree frog'].kind, by['Pacific tree frog'].stage, by['Pacific tree frog'].form, by['Pacific tree frog'].next], ['frog', 2, 'Frog', null]);
  assert.deepEqual([by.Robin.kind, by.Robin.stage, by.Robin.form, by.Robin.next], ['sparrow', 1, 'Chick', 5]);
  assert.deepEqual([by['Hermit crab'].kind, by['Hermit crab'].habitat, by['Hermit crab'].form], ['crab', 'tidepool', 'Young crab']);
  assert.equal(sp[0].name, 'Pacific tree frog', 'most-seen first');
  assert.equal(by['Pacific tree frog'].id, 's:pacific-tree-frog');
  // Forms: the life cycle of each kind.
  assert.deepEqual([0, 1, 2].map(s => L.form('frog', s).name), ['Tadpole', 'Froglet', 'Frog']);
  assert.deepEqual([0, 1, 2].map(s => L.form('butterfly', s).name), ['Caterpillar', 'Chrysalis', 'Butterfly']);
  assert.deepEqual([0, 1, 2].map(s => L.form('sparrow', s).icon), ['🥚', '🐣', '🐦']);
  assert.deepEqual([0, 1, 2].map(s => L.form('sapling', s).name), ['Seed', 'Sapling', 'Young tree']);
  assert.equal(L.form('frog', 0).move, 'swim');
  assert.equal(L.form('bee', 2).name, 'Mighty bee'); assert.equal(L.form('bee', 2).crown, true);
  assert.equal(L.iconFor('sapling', 0), '🌰'); assert.equal(L.iconFor('crab', 1), '🦀');
});

test('the same organism logged with and without a scientific name is one species; Unknowns stay separate', () => {
  const sp = L.species([rec('a', '2024-01-01', 'Sword fern', 'plant'), rec('b', '2024-01-02', 'Western sword fern', 'plant', { taxon: { scientificName: 'Polystichum munitum', source: 'plantnet' } }),
    rec('c', '2024-01-03', 'Sword fern', 'plant', { taxon: { scientificName: 'Polystichum munitum', source: 'plantnet' } }), rec('d', '2024-01-04', 'Unknown', 'fungus')]);
  assert.equal(sp.length, 2);
  const fern = sp.find(s => s.kind === 'fern');
  assert.deepEqual([fern.count, fern.scientific, fern.name, fern.stage], [3, 'Polystichum munitum', 'Sword fern', 1]);
  assert.equal(sp.find(s => s.unknown).kind, 'lbm');
});

test('habitat kinds are recognised from names', () => {
  const k = name => L.kindFor({ name, type: 'other' });
  assert.deepEqual(['Hermit crab', 'Ochre sea star', 'Giant green anemone', 'Scarlet macaw', 'Howler monkey', 'Three-toed sloth', 'Moth orchid', 'Bark scorpion'].map(k),
    ['crab', 'seastar', 'anemone', 'parrot', 'monkey', 'sloth', 'orchid', 'scorpion']);
  assert.deepEqual(['cactus', 'crab', 'parrot', 'frog'].map(L.habitatOf), ['desert', 'tidepool', 'rainforest', 'forest']);
});

test('field guide: sets with ??? slots, completion and rewards, celebrated once', () => {
  const sp = L.species([...many('Bumble bee', 1, 'insect'), ...many('Monarch butterfly', 1, 'insect'), ...many('Poppy', 1, 'plant'), ...many('Unknown', 2, 'fungus')]);
  const g = Dex.guide(sp, L.KINDS);
  assert.equal(g.cards.length, 3, 'Unknown finds get no card');
  const poll = g.sets.find(s => s.id === 'pollinators');
  assert.deepEqual([poll.found, poll.complete], [3, true]);
  const pond = g.sets.find(s => s.id === 'pond');
  assert.deepEqual(pond.slots.map(s => s.found?.name ?? null), [null, null, null, null]);
  assert.equal(pond.slots[0].hint, 'Something that hops');
  let state = Dex.parse(null);
  let u = Dex.update(state, sp, g, '2024-03-01');
  assert.deepEqual(u.completed.map(s => s.id), ['pollinators']);
  assert.equal(u.added.length, 3); assert.equal(u.evolved.length, 0, 'first sighting is a new card, not an evolution');
  assert.deepEqual(Dex.rewards(u.state).map(r => [r.id, r.item]), [['pollinators', 'Honey pot']]);
  const again = Dex.update(u.state, sp, g, '2024-03-02');
  assert.deepEqual([again.completed.length, again.added.length, again.evolved.length], [0, 0, 0], 'nothing celebrated twice');
  // Two more bees: stage 1, an evolution.
  const sp2 = L.species([...many('Bumble bee', 3, 'insect'), ...many('Monarch butterfly', 1, 'insect'), ...many('Poppy', 1, 'plant')]);
  const evo = Dex.update(again.state, sp2, Dex.guide(sp2, L.KINDS), '2024-03-03');
  assert.deepEqual(evo.evolved.map(s => [s.name, s.form]), [['Bumble bee', 'Bee']]);
  // Stages never go backwards (deleting records doesn't "un-evolve" the celebration log).
  assert.equal(Dex.update(evo.state, sp, g, '2024-03-04').state.stages[sp2[0].key], 1);
  // Moving the reward is remembered; damaged data is rejected.
  const moved = Dex.move(evo.state, 'pollinators', 0.3333, 7);
  assert.deepEqual(Dex.rewards(moved)[0].x, 0.333); assert.equal(Dex.rewards(moved)[0].y, 1);
  assert.deepEqual(Dex.parse(JSON.stringify(moved)), moved);
  for (const bad of [{ version: 2 }, { version: 1, stages: { a: 5 }, sets: {}, spots: {} }, { version: 1, stages: {}, sets: { nope: '2024-01-01' }, spots: {} }, { version: 1, stages: {}, sets: {}, spots: { pond: { x: 3, y: 0 } } }])
    assert.throws(() => Dex.parse(JSON.stringify(bad)), /Unsupported/);
  for (const set of Dex.SETS) for (const kind of set.kinds) assert.ok(L.KINDS[kind], `${set.id}: ${kind}`);
});
