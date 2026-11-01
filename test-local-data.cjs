const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('./local-data.js');
const logic = fs.readFileSync('index.html', 'utf8').match(/<script id="field-summary-logic">([\s\S]*?)<\/script>/)[1];
const F = vm.runInNewContext(logic + '\nFieldSummary;', { TerraData: D });
const base = { version: 1, space: D.SPACE };
const point = (x, y) => ({ ...base, kind: 'point', x, y });
const region = (x1, y1, x2, y2) => ({ ...base, kind: 'region', x1, y1, x2, y2 });
const boundary = { ...base, x1: 20, y1: 20, x2: 80, y2: 80 };
const p = { id: 'p', title: 'Site', type: 'site', date: '', site: 'Local site', species: '', notes: '', complete: false, observationIds: [] };
const r = { id: 'r', type: 'plant', name: 'Oak', date: '2024-02-29', notes: '', privacy: 'exact', location: point(50, 50) };

test('dates: today/past only, strict leap dates and local calendar', () => {
  assert.equal(D.today(new Date(2024, 1, 29, 23, 59)), '2024-02-29');
  for (const v of [D.today(), '2024-02-29', '0001-01-01']) assert.equal(D.observationDate(v), true);
  for (const v of ['9999-12-31', '2025-02-29', '1900-02-29', '0000-01-01', '2024-2-29', '', null]) assert.equal(D.observationDate(v), false);
});
test('privacy is a strict precision ceiling; hidden cannot carry coordinates', () => {
  assert.ok(D.location(point(5, 7), 'exact'));
  assert.ok(D.location(region(10, 20, 40, 50), 'approximate'));
  assert.ok(D.location({ ...base, kind: 'withheld' }, 'hidden'));
  for (const l of [point(5, 7), region(10, 20, 40, 50), { ...base, kind: 'withheld', x: 0 }, { ...base, kind: 'withheld', coordinates: [1, 2] }]) assert.equal(D.location(l, 'hidden'), false);
  for (const l of [point(5, 7), region(11, 20, 40, 50), region(10, 20, 20, 30), { ...region(10, 20, 40, 50), x: 11 }]) assert.equal(D.location(l, 'approximate'), false);
  assert.equal(D.location({ ...point(1, 2), space: 'geographic' }, 'exact'), false);
  assert.equal(D.location(null, 'exact'), false);
});
test('trash: 72 hours inclusive expiry, active filtering, immutable retention and optional field roundtrip', () => {
  const now = Date.parse('2026-10-30T12:00:00.000Z');
  const trashed = { ...r, deletedAt: new Date(now).toISOString() };
  assert.ok(D.optional(trashed)); assert.ok(D.optional({ ...r, location: undefined }) === false);
  assert.equal(D.expired(trashed, now + D.RETENTION - 1), false);
  assert.equal(D.expired(trashed, now + D.RETENTION), true);
  assert.deepEqual(D.active([r, trashed]), [r]);
  assert.deepEqual(D.retain([r, trashed], now + D.RETENTION), [r]);
  assert.deepEqual(D.pick({ ...trashed, photo: 'ignore', coordinates: [1, 2] }), trashed);
  assert.ok(trashed.deletedAt); assert.equal(D.optional({ ...r, deletedAt: 'invalid' }), false);
});
test('project inclusive ranges, day choices, species exact/manual values and optional schema roundtrip', () => {
  const range = { ...p, type: 'day', date: '2024-02-01', endDate: '2024-03-01', groupValue: '2024-02-29' };
  assert.ok(F.valid(range)); assert.ok(F.matches(range, r));
  for (const d of ['2024-01-31', '2024-02-01', '2024-03-01', '2024-03-02']) assert.equal(F.matches(range, { ...r, date: d }), false);
  const { groupValue, ...all } = range;
  assert.ok(F.matches(all, { ...r, date: '2024-02-01' })); assert.ok(F.matches(all, { ...r, date: '2024-03-01' }));
  assert.equal(F.valid({ ...range, endDate: '2024-01-01' }), false);
  assert.equal(F.valid({ ...range, groupValue: '2024-04-01' }), false);
  const manual = '<img src=x onerror=bad()>';
  const species = { ...p, type: 'species', species: manual };
  assert.ok(F.valid(species)); assert.ok(F.matches(species, { ...r, name: manual }));
  assert.equal(F.matches(species, r), false);
  assert.deepEqual(JSON.parse(JSON.stringify(F.parse(F.encode([range, { ...p, id: 'b', boundary }])))), [range, { ...p, id: 'b', boundary }]);
});
test('boundary containment includes edges, rejects overlaps/unknown/hidden and wrong grid', () => {
  for (const l of [point(20, 20), point(80, 80), region(20, 20, 80, 80)]) assert.ok(D.inside(boundary, l));
  for (const l of [point(19, 50), point(81, 50), region(10, 20, 80, 80), null, { ...base, kind: 'withheld' }, { ...point(50, 50), space: 'other' }]) assert.equal(D.inside(boundary, l), false);
  assert.equal(D.boundary({ ...boundary, x2: 20 }), false);
});
test('all membership paths reject outside/deleted; boundary edit summaries never mutate journal', () => {
  const project = { ...p, boundary, observationIds: [r.id] };
  assert.ok(F.matches(project, r));
  for (const record of [{ ...r, location: point(1, 1) }, { ...r, location: undefined }, { ...r, deletedAt: '2026-10-30T12:00:00.000Z' }]) assert.throws(() => F.addMember([project], p.id, record), /scope/);
  const journal = [r], bytes = JSON.stringify(journal);
  const edited = { ...project, boundary: { ...boundary, x2: 40 } };
  assert.equal(F.summarize(edited, journal).total, 0);
  assert.equal(F.summarize(project, journal).total, 1);
  assert.equal(JSON.stringify(journal), bytes);
});
