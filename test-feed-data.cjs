const assert = require('node:assert/strict');
const { test } = require('node:test');
const Feed = require('./feed-data.js');
const post = () => ({ id: 'p1', type: 'observation', title: 'My caption', body: '', observationId: 'o1', terra: true, inaturalist: false, createdAt: '2024-02-01T12:00:00.000Z' });
const state = posts => JSON.stringify({ version: 1, following: [], posts });
test('empty feed and varied fictional samples do not imply real social data', () => {
  assert.deepEqual(Feed.parse(null), { version: 1, following: [], posts: [] });
  assert.equal(new Set(Feed.samples.map(p => p.type)).size, 4);
  assert(Feed.profiles.every(p => /mock/.test(p.name)));
});
test('TERRA, preparation, and both use an ID reference, not observation copies', () => {
  for (const [terra, inaturalist] of [[true, false], [false, true], [true, true]]) {
    const p = { ...post(), terra, inaturalist, location: { x: 10 }, notes: 'private', published: true };
    assert.deepEqual(Feed.parse(state([p])).posts, [{ ...post(), terra, inaturalist }]);
  }
});
test('reject invalid destinations, sources, post types, lengths and dates', () => {
  for (const patch of [{ terra: false }, { observationId: null }, { type: 'offering', inaturalist: true }, { type: 'unknown' },
    { title: ' ' }, { title: 'a'.repeat(121) }, { body: 'a'.repeat(3001) }, { createdAt: 'yesterday' }, { terra: 'yes' }]) {
    assert.equal(Feed.validPost({ ...post(), ...patch }), false, JSON.stringify(patch));
    assert.throws(() => Feed.parse(state([{ ...post(), ...patch }])));
  }
  for (const type of ['offering', 'cultivated', 'update']) assert(Feed.validPost({ ...post(), type, observationId: null }));
});
test('fail closed on corrupt/unsupported state, duplicates or invented follows', () => {
  for (const raw of ['oops', '{}', 'null', state([post(), post()]), JSON.stringify({ version: 1, following: ['real-account'], posts: [] }),
    JSON.stringify({ version: 1, following: ['fern', 'fern'], posts: [] })]) assert.throws(() => Feed.parse(raw));
});
