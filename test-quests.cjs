const assert = require('node:assert/strict');
const test = require('node:test');
const Q = require('./quests.js');
const L = require('./terrarium-life.js');

const rec = (date, extra = {}) => ({ id: `${date}-${Math.random().toString(16).slice(2, 8)}`, type: 'plant', name: 'Unknown', notes: '', privacy: 'hidden', date, ...extra });
let n = 0;
const token = () => (++n).toString(16).padStart(32, '0');

test('quest board is stable for a day, always includes a base quest, and weeks start on Monday', () => {
  const a = Q.board([], '2024-03-13'), b = Q.board([], '2024-03-13');
  assert.deepEqual(a, b);
  assert.equal(a.daily.length, 3); assert.equal(a.weekly.length, 2);
  assert.equal(a.daily[0].id, 'any');
  assert.equal(new Set(a.daily.map(q => q.id)).size, 3);
  assert.equal(a.week, '2024-03-11');
  assert.equal(Q.weekStart('2024-03-17'), '2024-03-11'); assert.equal(Q.weekStart('2024-03-18'), '2024-03-18');
  assert.deepEqual(Q.board([], '2024-03-14').weekly.map(q => q.id), a.weekly.map(q => q.id), 'same weekly quests all week');
  // Never two color or two group quests on the same day.
  for (let d = 1; d <= 28; d++) {
    const day = `2024-02-${String(d).padStart(2, '0')}`, kinds = Q.board([], day).daily.map(q => Q.DAILY.find(x => x.id === q.id).kind);
    assert.ok(kinds.filter(k => k === 'color').length <= 1 && kinds.filter(k => k === 'group').length <= 1, day);
  }
});

test('progress counts only the right day or week', () => {
  const today = '2024-03-13';
  const records = [rec(today), rec('2024-03-12', { type: 'fungus' }), rec('2024-03-11', { type: 'fungus' }), rec('2024-03-10', { type: 'fungus' })];
  const board = Q.board(records, today);
  assert.equal(board.daily[0].count, 1); assert.equal(board.daily[0].done, true);
  const fungi = Q.WEEKLY.find(q => q.id === 'fungi3');
  assert.equal(fungi.count(records.filter(r => r.date >= '2024-03-11')), 2, 'Sunday belongs to last week');
  const purple = Q.DAILY.find(q => q.id === 'color-purple');
  assert.equal(purple.count([rec(today, { name: 'Purple lupine' }), rec(today, { notes: 'a pale violet bloom' }), rec(today, { name: 'Purpleish' })]), 2);
  const notes = Q.DAILY.find(q => q.id === 'notes');
  assert.equal(notes.count([rec(today, { notes: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen' }), rec(today, { notes: 'short' })]), 1);
  const fresh = Q.WEEKLY.find(q => q.id === 'new2');
  assert.equal(fresh.count([rec(today, { name: 'Oak' }), rec(today, { name: 'Fern' }), rec(today, { name: 'Unknown' })], [rec('2024-01-01', { name: 'oak' })]), 1);
});

test('claiming rewards once per quest: seeds for daily, decorations for weekly', () => {
  const today = '2024-03-13';
  const records = [rec(today), rec(today), rec('2024-03-12'), rec('2024-03-11')];
  const board = Q.board(records, today);
  const empty = Q.parse(null);
  const first = Q.claim(empty, board, token);
  const done = [...board.daily, ...board.weekly].filter(q => q.done);
  assert.equal(first.earned.length, done.length);
  assert.ok(first.earned.every(e => (e.quest.scope === 'daily') === (e.reward.type === 'seed')));
  assert.ok(first.earned.every(e => e.reward.icon && e.reward.item));
  const again = Q.claim(first.state, board, token);
  assert.equal(again.earned.length, 0, 'no double rewards on reload');
  assert.deepEqual(Q.parse(JSON.stringify(first.state)), first.state);
  assert.deepEqual(empty, { version: 1, claimed: {}, spots: {} }, 'claim does not mutate');
  const stats = Q.stats(first.state);
  assert.equal(stats.questDays, 1); assert.equal(stats.quests, done.length);
  const inv = Q.inventory(first.state);
  assert.equal(inv.seeds.length, stats.seeds); assert.ok(inv.seeds.every(s => s.planted === today));
  // Missing days costs nothing: totals never go down.
  const later = Q.claim(first.state, Q.board(records, '2024-03-20'), token);
  assert.ok(Q.stats(later.state).questDays >= stats.questDays);
});

test('decorations remember where they were moved; damaged data is rejected', () => {
  const s = Q.claim(Q.parse(null), Q.board([rec('2024-03-11'), rec('2024-03-12'), rec('2024-03-13'), rec('2024-03-13'), rec('2024-03-13')], '2024-03-13'), token).state;
  const decor = Q.inventory(s).decor;
  if (decor.length) {
    const moved = Q.move(s, decor[0].token, 0.12345, 4);
    assert.deepEqual(moved.spots[decor[0].token], { x: 0.123, y: 1 });
    assert.equal(Q.inventory(moved).decor[0].x, 0.123);
    assert.deepEqual(Q.parse(JSON.stringify(moved)), moved);
  }
  for (const bad of [
    { version: 2, claimed: {}, spots: {} },
    { version: 1, claimed: { 'nope': { type: 'seed', id: 'rose', token: 'a'.repeat(32) } }, spots: {} },
    { version: 1, claimed: { '2024-03-13/daily/any': { type: 'seed', id: 'gold', token: 'a'.repeat(32) } }, spots: {} },
    { version: 1, claimed: { '2024-03-13/daily/any': { type: 'seed', id: 'rose', token: 'xyz' } }, spots: {} },
    { version: 1, claimed: {}, spots: { ['a'.repeat(32)]: { x: 2, y: 0 } } },
    { version: 1, claimed: [], spots: {} }
  ]) assert.throws(() => Q.parse(JSON.stringify(bad)), /Unsupported/);
});

test('journal finds become creatures and plants in the jar', () => {
  const kind = (name, type = 'other') => L.kindFor({ name, type });
  assert.equal(kind('Pacific tree frog'), 'frog');
  assert.equal(kind('Sword fern', 'plant'), 'fern');
  assert.equal(kind('Turkey tail', 'fungus'), 'shelf');
  assert.equal(kind('Seven-spotted ladybug', 'insect'), 'ladybug');
  assert.equal(kind('Rainbow trout', 'fish'), 'fish');
  assert.equal(kind('Coast live oak', 'plant'), 'sapling');
  assert.equal(kind('Unknown', 'fungus'), 'lbm');
  assert.equal(kind('Unknown', 'bird'), 'sparrow');
  assert.equal(kind('Something odd'), 'lichen');
  for (const k of Object.values(L.KINDS)) assert.ok(k.name && k.fact && k.move && (k.icon || k.draw));
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, name: i < 6 ? 'Frog' : `Plant ${i}`, type: 'plant', date: `2024-01-${String(1 + (i % 28)).padStart(2, '0')}` }));
  const living = L.inhabitants(many);
  assert.ok(living.length <= 24);
  assert.ok(living.filter(l => l.kind === 'frog').length <= 3);
  assert.ok(living.every((l, i) => i === 0 || living[i - 1].date >= l.date), 'newest first');
});

test('rare variants have tiers, odds and facts', () => {
  assert.deepEqual(L.RARES.map(r => r.tier), ['Rare', 'Rare', 'Rare', 'Legendary', 'Legendary']);
  for (const r of L.RARES) assert.ok(r.odds > 0 && r.odds < 0.1 && r.fact && r.icon);
  assert.ok(L.RARES.filter(r => r.tier === 'Legendary').every(r => r.odds <= 0.02));
});
