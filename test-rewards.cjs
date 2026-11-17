const assert = require('node:assert/strict');
const test = require('node:test');
const R = require('./rewards.js');
const D = require('./local-data.js');
const record = (day, extra = {}) => ({ id: `r${day}`, type: 'plant', name: 'Unknown', notes: '', privacy: 'hidden', date: `2024-02-${String(day).padStart(2, '0')}`, ...extra });
const eligible = (records, projects = [], matches = () => true) => R.eligible(records, projects, D.observationDate, matches);

test('transparent participation only; no verification, rarity, location or transactions award', () => {
  assert.deepEqual(eligible([]), []);
  assert.deepEqual(eligible([record(1)]), ['first']);
  assert.deepEqual(eligible(Array.from({ length: 4 }, (_, i) => record(1, { id: `id${i}`, verified: true, rarity: 'rare', followers: 99 }))), ['first']);
  assert.deepEqual(eligible([record(1, { deletedAt: new Date().toISOString() }), record(1, { date: '9999-12-31' }), record(1, { date: '2024-02-30' })]), []);
});
test('seven distinct consecutive observation days; duplicates/gaps/future/trash do not extend streak', () => {
  const week = Array.from({ length: 7 }, (_, i) => record(i + 1));
  assert.deepEqual(eligible(week), ['first', 'obs5', 'week']);
  assert.deepEqual(eligible([...week].reverse()), ['first', 'obs5', 'week']);
  assert.deepEqual(eligible(Array.from({ length: 4 }, () => record(1))), ['first']);
  assert.ok(!eligible(Array.from({ length: 20 }, () => record(1))).includes('week'));
  assert.ok(!eligible(week.filter(r => r.id !== 'r4')).includes('week'));
  assert.ok(!eligible(week.map(r => r.id === 'r4' ? { ...r, deletedAt: '2024-03-01T00:00:00Z' } : r)).includes('week'));
  assert.ok(eligible([record(28), record(29), ...[1, 2, 3, 4, 5].map(day => record(day, { date: `2024-03-0${day}` }))]).includes('week'));
});
test('completed nonempty project needs real active referenced eligible record, not just complete flag', () => {
  const p = { complete: true, observationIds: ['r1'] };
  assert.deepEqual(eligible([record(1)], [p]), ['first', 'project']);
  assert.deepEqual(eligible([], [p]), []);
  assert.deepEqual(eligible([record(1)], [{ ...p, observationIds: [] }]), ['first']);
  assert.deepEqual(eligible([record(1)], [p], () => false), ['first']);
  assert.deepEqual(eligible([record(1)], [{ ...p, complete: false }]), ['first']);
});
test('idempotent grants: repeated events, completion toggles, restore/import/reload never reroll or multiply', () => {
  let calls = 0;
  const random = () => (++calls).toString(16).padStart(32, '0');
  const empty = R.parse(null);
  const first = R.award(empty, ['first', 'first', 'verified', 'verified1', 'followers10', 'week', 'project'], random);
  assert.equal(calls, 3); assert.deepEqual(empty, { version: 1, grants: [] });
  for (let i = 0; i < 10; i++) assert.deepEqual(R.award(R.parse(JSON.stringify(first)), ['first', 'week', 'project'], random), first);
  assert.deepEqual(R.award(first, [], random), first); assert.equal(calls, 3);
  assert.equal(new Set(first.grants.map(g => g.token)).size, 3);
});
test('randomized primitives stable per serial, varied between serials, collision retries bounded', () => {
  const zero = { badge: 'first', token: '00'.repeat(16), placed: true };
  const other = { badge: 'week', token: 'ff'.repeat(16), placed: true };
  assert.deepEqual(R.decoration(zero), R.decoration(zero));
  assert.notDeepEqual(R.decoration(zero), R.decoration(other));
  const prior = { version: 1, grants: [zero] };
  let n = 0;
  const next = R.award(prior, ['week'], () => ++n < 3 ? zero.token : other.token);
  assert.equal(n, 3); assert.equal(next.grants[1].token, other.token);
  assert.throws(() => R.award(prior, ['week'], () => zero.token), /distinct/);
  assert.equal(prior.grants.length, 1);
});
test('versioned reward persistence fails closed for corruption, duplicate serials or badges', () => {
  for (const raw of ['{}', 'null', '[]', '{"version":2,"grants":[]}', '{', '{"version":1,"grants":[null]}']) assert.throws(() => R.parse(raw));
  const grant = { badge: 'first', token: 'ab'.repeat(16), placed: false };
  assert.deepEqual(R.parse(JSON.stringify({ version: 1, grants: [grant] })).grants, [grant]);
  for (const second of [{ ...grant }, { ...grant, badge: 'week' }, { ...grant, badge: 'verified' }, { ...grant, badge: 'verified1', token: 'cd'.repeat(16) }, { ...grant, badge: 'followers10', token: 'cd'.repeat(16) }, { ...grant, placed: 1 }]) {
    assert.throws(() => R.parse(JSON.stringify({ version: 1, grants: [grant, second] })));
  }
});

test('observation milestones unlock tiered nature items exactly at their thresholds', () => {
  const many = n => Array.from({ length: n }, (_, i) => record(1, { id: `m${i}` }));
  assert.deepEqual(eligible(many(4)), ['first']);
  assert.deepEqual(eligible(many(5)), ['first', 'obs5']);
  assert.deepEqual(eligible(many(10)), ['first', 'obs5', 'obs10']);
  assert.deepEqual(eligible(many(25)), ['first', 'obs5', 'obs10', 'obs25']);
  assert.deepEqual(eligible(many(50)), ['first', 'obs5', 'obs10', 'obs25', 'obs50']);
  assert.deepEqual(eligible([...many(5), ...many(5).map(r => ({ ...r, id: `t${r.id}`, deletedAt: '2024-03-01T00:00:00Z' }))]), ['first', 'obs5'], 'Trashed records do not count');
});
test('variety counts distinct organism groups and named organisms, ignoring Other and Unknown', () => {
  const at = (type, name, i) => record(1, { id: `v${i}`, type, name });
  assert.equal(R.progress([at('plant', 'Oak', 1), at('plant', 'Fern', 2), at('fungus', 'x', 3), at('other', 'y', 4)], [], D.observationDate, () => true).groups, 2);
  assert.ok(eligible([at('plant', 'A', 1), at('fungus', 'B', 2), at('bird', 'C', 3)]).includes('groups3'));
  const names = Array.from({ length: 9 }, (_, i) => at('plant', ` Name ${i} `, i));
  assert.ok(!eligible([...names, at('plant', 'Unknown', 20), at('plant', 'UNKNOWN', 21), at('plant', 'Name 0', 22)]).includes('names10'));
  assert.ok(eligible([...names, at('plant', 'Name 9', 30)]).includes('names10'));
});
test('progress reports counts for the collection and nulls for unavailable sources', () => {
  const counts = R.progress([record(1), record(2), record(3, { name: 'Oak' })], [], D.observationDate, () => true);
  assert.deepEqual(counts, { observations: 3, days: 3, streak: 3, groups: 1, names: 1, projects: 0, followers: null, verified: null });
  for (const a of R.CATALOG) assert.ok(Object.hasOwn(counts, a.metric), a.id);
  assert.deepEqual(R.CATALOG.filter(a => a.source === 'unavailable').map(a => a.id), ['followers10', 'verified1']);
  assert.equal(new Set(R.CATALOG.map(a => a.icon)).size, R.CATALOG.length, 'Every achievement has its own nature item');
});
test('legacy v1 grants keep their serials and placement under the expanded catalog', () => {
  const legacy = { version: 1, grants: [{ badge: 'first', token: '12'.repeat(16), placed: false }, { badge: 'week', token: '34'.repeat(16), placed: true }, { badge: 'project', token: '56'.repeat(16), placed: true }] };
  const parsed = R.parse(JSON.stringify(legacy));
  assert.deepEqual(parsed, legacy);
  assert.equal(R.decoration(legacy.grants[0]).icon, '🌱');
  const next = R.award(parsed, ['first', 'week', 'project', 'obs5'], () => 'ef'.repeat(16));
  assert.deepEqual(next.grants.slice(0, 3), legacy.grants);
  assert.equal(next.grants[3].badge, 'obs5');
});
test('terrarium layout is deterministic, keeps flyers in the air and spaces ground items apart', () => {
  const ids = ['first', 'obs5', 'obs10', 'week', 'groups3', 'project'];
  const grants = ids.map((badge, i) => ({ badge, token: String(i).repeat(32).slice(0, 32).replace(/\d/g, d => 'abcdef0123456789'[d]), placed: true }));
  const items = R.layout(grants);
  assert.deepEqual(R.layout(grants), items);
  assert.equal(items.find(i => i.grant.badge === 'groups3').layer, 'air');
  const ground = items.filter(i => i.layer === 'ground').map(i => i.x);
  for (const [a, x] of ground.entries()) for (const y of ground.slice(a + 1)) assert.ok(Math.abs(x - y) >= 12, `${x} vs ${y}`);
  assert.ok(items.every(i => i.x >= 10 && i.x <= 90));
});

test('decorations are earned like other items and can remember where they were moved', () => {
  assert.deepEqual(R.CATALOG.filter(a => a.kind === 'decoration').map(a => a.id), ['project', 'projects3', 'days30', 'groups5', 'verified1']);
  assert.ok(R.CATALOG.every(a => a.kind === 'living' || a.kind === 'decoration'));
  const days = Array.from({ length: 30 }, (_, i) => record(1, { id: `d${i}`, date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10) }));
  assert.ok(eligible(days).includes('days30'));
  assert.ok(!eligible(days.slice(1)).includes('days30'));
  const state = R.award({ version: 1, grants: [] }, ['project'], () => 'ab'.repeat(16));
  const moved = R.move(state, 'project', 0.123456, 1.4);
  assert.deepEqual(moved.grants[0], { badge: 'project', token: 'ab'.repeat(16), placed: true, x: 0.123, y: 1 });
  assert.deepEqual(R.parse(JSON.stringify(moved)), moved);
  for (const bad of [{ x: 2, y: 0.5 }, { x: 0.5 }, { x: '0.5', y: 0.5 }, { x: NaN, y: 0.5 }]) {
    assert.throws(() => R.parse(JSON.stringify({ version: 1, grants: [{ ...state.grants[0], ...bad }] })), /Unsupported/);
  }
  assert.deepEqual(state.grants[0], { badge: 'project', token: 'ab'.repeat(16), placed: true }, 'move() does not change the original');
});
