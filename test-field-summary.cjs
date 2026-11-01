const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const logic = html.match(/<script id="field-summary-logic">([\s\S]*?)<\/script>/)[1];
const F = vm.runInNewContext(logic + '\nFieldSummary;');
const plain = value => JSON.parse(JSON.stringify(value));
const project = { id: 'p1', title: 'Field day', type: 'custom', date: '', site: '', species: '', notes: '', complete: false, observationIds: ['a', 'b', 'c', 'd', 'missing'] };
const records = [
  { id: 'a', date: '2024-02-29', name: 'Oak', type: 'plant', notes: 'one', privacy: 'hidden' },
  { id: 'b', date: '2024-02-29', name: 'Oak', type: 'plant', notes: 'two', privacy: 'hidden' },
  { id: 'c', date: '2025-01-01', name: 'Unknown', type: 'other', notes: '', privacy: 'approximate' },
  { id: 'd', date: '2025-01-01', name: ' oak ', type: 'plant', notes: '', privacy: 'exact' },
  { id: 'excluded', date: '2025-01-01', name: 'Birch', type: 'plant', notes: '', privacy: 'hidden' }
];
test('absence is read-only compatibility; versioned ID-only roundtrip; ignore unknown fields', () => {
  assert.deepEqual(plain(F.parse(null)), []);
  assert.deepEqual(plain(F.parse(F.encode([project]))), [project]);
  const raw = F.encode([{ ...project, observations: records, futureField: true }]);
  assert.deepEqual(plain(F.parse(raw)), [project]);
});
test('all invalid/unsupported project data fail closed, including duplicate IDs', () => {
  for (const raw of ['{broken', 'null', '[]', '{}', JSON.stringify({ format: 'terra-projects', version: 2, projects: [] }), JSON.stringify({ format: 'other', version: 1, projects: [] }), F.encode([project, project])]) assert.throws(() => F.parse(raw), undefined, raw);
  for (const patch of [
    { id: '' }, { id: 2 }, { title: ' ' }, { title: 'x'.repeat(121) }, { type: 'trend' },
    { date: '2025-02-29' }, { date: '0000-01-01' }, { date: '10000-01-01' }, { date: '2025-1-01' },
    { type: 'day', date: '' }, { type: 'species', species: ' ' }, { type: 'site', site: '' },
    { notes: 'x'.repeat(3001) }, { notes: null }, { complete: 'true' }, { observationIds: ['a', 'a'] },
    { observationIds: [null] }, { observationIds: 'a' }, { observationIds: [' '] }
  ]) { assert.equal(Boolean(F.valid({ ...project, ...patch })), false, JSON.stringify(patch)); assert.throws(() => F.parse(F.encode([{ ...project, ...patch }]))); }
  assert.equal(F.valid({ ...project, type: 'day', date: '0001-01-01' }), true);
  assert.equal(F.valid({ ...project, type: 'day', date: '9999-12-31' }), true);
  assert.equal(F.valid({ ...project, type: 'day', date: '2024-02-29' }), true);
});
test('deterministic counts derive only from references; unknown excluded only from unique labels', () => {
  const before = JSON.stringify({ project, records });
  const summary = plain(F.summarize(project, records));
  assert.equal(summary.total, 4); assert.equal(summary.uniqueTaxa, 2);
  assert.deepEqual(summary.missing, ['missing']);
  assert.deepEqual(summary.dates, [['2024-02-29', ['a', 'b']], ['2025-01-01', ['c', 'd']]]);
  assert.deepEqual(summary.species, [['Oak', ['a', 'b']], ['Unknown', ['c']], ['oak', ['d']]]);
  assert.deepEqual(plain(F.summarize(project, [...records].reverse())), summary);
  assert.equal(summary.species.reduce((total, [, ids]) => total + ids.length, 0), summary.total);
  assert.equal(summary.dates.reduce((total, [, ids]) => total + ids.length, 0), summary.total);
  assert.equal(JSON.stringify({ project, records }), before);
  assert.equal(F.summarize(project, []).total, 0);
  assert.equal(F.summarize({ ...project, observationIds: [] }, records).uniqueTaxa, 0);
  assert.equal(F.summarize({ ...project, observationIds: ['c'] }, [{ ...records[2], name: 'UNKNOWN' }]).uniqueTaxa, 0);
});
test('day and species eligibility is exact, site/custom never invent geolocation', () => {
  assert.equal(F.matches({ ...project, type: 'day', date: '2024-02-29' }, records[0]), true);
  assert.equal(F.matches({ ...project, type: 'day', date: '2025-01-01' }, records[0]), false);
  assert.equal(F.matches({ ...project, type: 'species', species: ' Oak ' }, records[0]), true);
  assert.equal(F.matches({ ...project, type: 'species', species: 'oak' }, records[0]), false);
  assert.equal(F.matches({ ...project, type: 'site', site: 'Unknown site' }, records[0]), true);
});
test('CSV has source rows, scope/counts, missing/empty rows, quote escaping and spreadsheet safety', () => {
  const csv = F.csv(project, records);
  assert.match(csv, /unique_taxa_labels/); assert.match(csv, /missing \(not counted\)/);
  assert.doesNotMatch(csv, /Birch/);
  assert.match(F.csv({ ...project, observationIds: [] }, records), /"empty"/);
  const hostile = { ...project, title: '=HYPERLINK("bad")', site: ' +CMD', notes: 'line1\nline2,"quoted"', observationIds: ['a'] };
  const result = F.csv(hostile, [{ ...records[0], name: '@SUM(1)', notes: '\t=1' }]);
  assert.match(result, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(result, /"'@SUM\(1\)"/); assert.match(result, /"'\t=1"/);
  assert.match(result, /line1\nline2,""quoted""/);
  assert.equal(F.csv(project, records), F.csv(project, records));
});
test('every inline JS block parses', () => {
  for (const m of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
});
