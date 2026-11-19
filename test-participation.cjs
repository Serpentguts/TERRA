const assert = require('node:assert/strict');
const test = require('node:test');
const X = require('./xp.js');
const V = require('./validators.js');
const R = require('./rewards.js');
const D = require('./local-data.js');

const rec = (id, date, extra = {}) => ({ id, type: 'plant', name: 'Unknown', notes: '', date, privacy: 'hidden', ...extra });
const longNote = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';

test('XP rewards quality and consistency, caps daily volume, and maps to levels', () => {
  assert.equal(X.compute([]).xp, 0);
  assert.deepEqual([X.compute([]).level, X.compute([]).name], [1, 'Seedling']);
  const one = X.compute([rec('a', '2024-03-01', { name: 'Sword fern', notes: longNote, taxon: { scientificName: 'Polystichum munitum', source: 'plantnet' } })]);
  // 10 observation + 10 field day + 15 new species + 5 notes + 5 identified
  assert.equal(one.xp, 45);
  // 20 observations on one day only earn for 5; one field day; repeats aren't new species.
  const spam = X.compute(Array.from({ length: 20 }, (_, i) => rec(`s${i}`, '2024-03-01', { name: 'Dandelion' })));
  assert.equal(spam.xp, 5 * 10 + 10 + 15);
  const spread = X.compute(Array.from({ length: 20 }, (_, i) => rec(`d${i}`, `2024-03-${String(i + 1).padStart(2, '0')}`, { name: `Species ${i}` })), { longestStreak: 20 });
  assert.equal(spread.xp, 20 * 10 + 20 * 10 + 20 * 15 + 25 + 50 + 100);
  assert.ok(spread.xp > spam.xp * 5, 'twenty days of variety beats one day of repetition');
  const extras = X.compute([], { quests: 2, rares: 1, reviews: 10, correct: 7 });
  assert.equal(extras.xp, 40 + 30 + 20 + 21);
  assert.equal(X.compute([], {}).breakdown.length, 9);
  assert.deepEqual(X.level(99).level, 1); assert.deepEqual(X.level(100).level, 2);
  assert.equal(X.level(175).progress, 0.5);
  assert.deepEqual([X.level(5000).level, X.level(5000).next, X.level(5000).progress], [7, null, 1]);
  assert.equal(X.level(240).toNext, 10);
});

test('rest leaves cover one or two missed days, once, and never fake a streak', () => {
  const days = ['2024-03-05', '2024-03-06', '2024-03-07'].map(d => rec(d, d));
  const empty = R.parseStreak(null);
  assert.deepEqual(empty, { version: 1, used: [], level: 0 });
  // Missed the 8th; on the 9th one leaf covers it.
  let p = R.protect(days, D.observationDate, '2024-03-09', empty, 1);
  assert.deepEqual([p.spent, p.available], [['2024-03-08'], 0]);
  let s = R.streak(days, D.observationDate, '2024-03-09', new Set(p.state.used));
  assert.deepEqual([s.current, s.atRisk], [3, true], 'protected day keeps the streak but does not add to it');
  assert.equal(R.streak(days, D.observationDate, '2024-03-09').current, 0, 'without the leaf it would have broken');
  // Already covered: nothing more is spent on a reload.
  assert.deepEqual(R.protect(days, D.observationDate, '2024-03-09', p.state, 1).spent, []);
  // Two missed days need two leaves; three missed days can't be covered.
  assert.deepEqual(R.protect(days, D.observationDate, '2024-03-10', empty, 1).spent, []);
  assert.deepEqual(R.protect(days, D.observationDate, '2024-03-10', empty, 2).spent, ['2024-03-08', '2024-03-09']);
  assert.deepEqual(R.protect(days, D.observationDate, '2024-03-11', empty, 5).spent, []);
  // Nothing to protect when you recorded yesterday or today, or have no leaves or no history.
  assert.deepEqual(R.protect(days, D.observationDate, '2024-03-08', empty, 3).spent, []);
  assert.deepEqual(R.protect([], D.observationDate, '2024-03-08', empty, 3).spent, []);
  assert.deepEqual(R.protect(days, D.observationDate, '2024-03-09', empty, 0).spent, []);
  // Leaves already spent count against what you've earned.
  assert.equal(R.protect(days, D.observationDate, '2024-03-09', { ...empty, used: ['2024-02-01'] }, 1).spent.length, 0);
  for (const bad of [{ version: 2, used: [], level: 0 }, { version: 1, used: ['nope'], level: 0 }, { version: 1, used: [], level: -1 }, { version: 1, used: {}, level: 0 }])
    assert.throws(() => R.parseStreak(JSON.stringify(bad)), /Unsupported/);
});

test('validators: participation unlocks tiers, accuracy sets weight, and answers are final', () => {
  assert.equal(V.PRACTICE.length, 22);
  for (const p of V.PRACTICE) assert.ok(p.options.length === 4 && p.answer >= 0 && p.answer < 4 && p.clue && p.why && new Set(p.options).size === 4, p.id);
  let s = V.parse(null);
  const first = V.PRACTICE[0];
  s = V.answer(s, first.id, first.answer);
  assert.equal(V.answer(s, first.id, (first.answer + 1) % 4), s, 'an answer cannot be changed');
  assert.equal(V.answer(s, 'nope', 0), s);
  assert.equal(V.answer(s, V.PRACTICE[1].id, 7), s);
  assert.deepEqual(V.parse(JSON.stringify(s)), s);
  assert.throws(() => V.parse(JSON.stringify({ version: 1, answers: { p01: 9 } })), /Unsupported/);
  assert.throws(() => V.parse(JSON.stringify({ version: 1, answers: { zz: 0 } })), /Unsupported/);

  // Level gates tiers.
  const perfect = n => V.PRACTICE.slice(0, n).reduce((st, p) => V.answer(st, p.id, p.answer), V.parse(null));
  assert.equal(V.standing(1, V.record(V.parse(null))).tier.id, 'observer');
  assert.equal(V.standing(2, V.record(V.parse(null))).tier.id, 'apprentice');
  assert.equal(V.standing(2, V.record(perfect(22))).tier.id, 'apprentice', 'great reviews alone do not skip levels');
  const twelve = V.record(perfect(12));
  assert.equal(V.standing(3, twelve).tier.id, 'validator');
  assert.equal(V.standing(3, twelve).weight, 1.26);
  // Volume alone never adds weight: 22 reviews with many wrong answers stay below validator.
  const sloppy = V.PRACTICE.reduce((st, p, i) => V.answer(st, p.id, i % 2 ? p.answer : (p.answer + 1) % 4), V.parse(null));
  const sr = V.record(sloppy);
  assert.equal(sr.reviews, 22); assert.equal(sr.correct, 11);
  assert.equal(V.standing(7, sr).tier.id, 'apprentice');
  assert.match(V.standing(7, sr).needs.join(' '), /reliability of 60%/);
  const senior = V.standing(5, V.record(perfect(22)));
  assert.equal(senior.tier.id, 'senior'); assert.ok(senior.weight <= V.MAX_WEIGHT); assert.equal(senior.next, null);
  // Wilson lower bound is cautious with small samples.
  assert.ok(V.wilson(3, 3) < V.wilson(30, 30));
  assert.equal(V.wilson(0, 0), 0);
});

test('community agreement caps any single voter and needs real agreement', () => {
  assert.equal(V.consensus([]).status, 'needs-more');
  assert.equal(V.consensus([{ name: 'Oak', weight: 2 }]).status, 'needs-more', 'one voter never decides');
  assert.equal(V.consensus([{ name: 'Oak', weight: 0.5 }, { name: 'Oak', weight: 0.5 }]).status, 'needs-more', 'too little weight');
  const agreed = V.consensus([{ name: 'Oak', weight: 1.2 }, { name: 'oak ', weight: 1 }, { name: 'Maple', weight: 1 }]);
  assert.deepEqual([agreed.status, agreed.leader, agreed.voters], ['agreed', 'Oak', 3]);
  assert.equal(V.consensus([{ name: 'Oak', weight: 1 }, { name: 'Maple', weight: 1 }]).status, 'disputed');
  assert.equal(V.consensus([{ name: 'Oak', weight: 1 }, { name: 'Oak', weight: 1 }]).status, 'agreed', 'two validators who agree are enough');
  // A heavy voter is capped at 40% of the total, so two others can outvote them.
  const capped = V.consensus([{ name: 'Maple', weight: 2 }, { name: 'Oak', weight: 1 }, { name: 'Oak', weight: 1 }]);
  assert.equal(capped.leader, 'Oak');
  assert.equal(V.consensus([{ name: 'Oak', weight: 0 }, { name: 'Oak', weight: 0 }]).voters, 0, 'zero-weight votes do not count');
});
