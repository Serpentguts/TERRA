const assert = require('node:assert/strict');
const test = require('node:test');
const R = require('./rewards.js');
const D = require('./local-data.js');
const record = (day, extra = {}) => ({ id: `r${day}`, type: 'plant', name: 'Unknown', notes: '', privacy: 'hidden', date: `2024-02-${String(day).padStart(2, '0')}`, ...extra });
const eligible = (records, projects = [], matches = () => true) => R.eligible(records, projects, D.observationDate, matches);

test('transparent participation only; no verification, rarity, location or transactions award', () => {
  assert.deepEqual(eligible([]), []);
  assert.deepEqual(eligible([record(1)]), ['first']);
  assert.deepEqual(eligible(Array.from({ length: 5 }, (_, i) => record(1, { id: `id${i}`, verified: true, rarity: 'rare' }))), ['first']);
  assert.deepEqual(eligible([record(1, { deletedAt: new Date().toISOString() }), record(1, { date: '9999-12-31' }), record(1, { date: '2024-02-30' })]), []);
});
test('seven distinct consecutive observation days; duplicates/gaps/future/trash do not extend streak', () => {
  const week = Array.from({ length: 7 }, (_, i) => record(i + 1));
  assert.deepEqual(eligible(week), ['first', 'week']);
  assert.deepEqual(eligible([...week].reverse()), ['first', 'week']);
  assert.deepEqual(eligible(Array.from({ length: 20 }, () => record(1))), ['first']);
  assert.deepEqual(eligible(week.filter(r => r.id !== 'r4')), ['first']);
  assert.deepEqual(eligible(week.map(r => r.id === 'r4' ? { ...r, deletedAt: '2024-03-01T00:00:00Z' } : r)), ['first']);
  assert.deepEqual(eligible([record(28), record(29), ...[1, 2, 3, 4, 5].map(day => record(day, { date: `2024-03-0${day}` }))]), ['first', 'week']);
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
  const first = R.award(empty, ['first', 'first', 'verified', 'week', 'project'], random);
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
  for (const second of [{ ...grant }, { ...grant, badge: 'week' }, { ...grant, badge: 'verified' }, { ...grant, placed: 1 }]) {
    assert.throws(() => R.parse(JSON.stringify({ version: 1, grants: [grant, second] })));
  }
});
