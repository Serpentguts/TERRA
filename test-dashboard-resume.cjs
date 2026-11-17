const assert = require('node:assert/strict');
const test = require('node:test');
const Dash = require('./dashboard.js');
const Res = require('./resume.js');
const X = require('./xp.js');
const V = require('./validators.js');

const geo = { version: 1, space: 'terra-geo-v1', kind: 'point', x: -122.4, y: 37.7 };
const notes = 'Under alders by the creek, about twenty fronds in deep shade with moss on the rocks and a wren singing.';
const records = [
  { id: 'a', type: 'plant', name: 'Western sword fern', notes, date: '2024-03-01', privacy: 'exact', location: geo, taxon: { scientificName: 'Polystichum munitum', source: 'plantnet' } },
  { id: 'b', type: 'plant', name: 'Western sword fern', notes: '', date: '2024-03-02', privacy: 'hidden', location: { version: 1, space: 'terra-geo-v1', kind: 'withheld' } },
  { id: 'c', type: 'fungus', name: 'Unknown', notes: 'Secret spot near my house at 12 Elm St', date: '2024-02-10', privacy: 'hidden' },
  { id: 'd', type: 'bird', name: 'Robin', notes: '', date: '2023-12-31', privacy: 'hidden' },
  { id: 'gone', type: 'bird', name: 'Deleted bird', notes: '', date: '2024-03-01', privacy: 'hidden', deletedAt: '2024-03-02T00:00:00Z' }
];
const projects = [{ id: 'p1', title: 'Creek survey', type: 'custom', date: '2024-03-01', endDate: '2024-03-31', site: '', species: '', notes: '', complete: true, observationIds: ['a', 'b', 'gone'] }];

test('dashboard summary: species, groups, months, data quality and readiness', () => {
  const s = Dash.summary(records, projects, { today: '2024-03-15', photoCounts: new Map([['a', 2]]) });
  assert.equal(s.n, 4, 'Trash left out');
  assert.equal(s.species, 2, 'Sword fern (by scientific name) and Robin; Unknown is not a species');
  assert.deepEqual(s.groups.map(g => [g.id, g.count]), [['plant', 2], ['fungus', 1], ['bird', 1]]);
  assert.equal(s.perMonth.length, 12);
  assert.deepEqual(s.perMonth.slice(-4).map(m => [m.month, m.count]), [['2023-12', 1], ['2024-01', 0], ['2024-02', 1], ['2024-03', 2]]);
  assert.deepEqual(s.top[0], { name: 'Western sword fern', scientific: 'Polystichum munitum', count: 2 });
  const q = s.quality;
  assert.deepEqual([q.total, q.identified, q.named, q.located, q.exact, q.hidden, q.notes, q.photos, q.first, q.last], [4, 1, 3, 1, 1, 3, 1, 1, '2023-12-31', '2024-03-02']);
  assert.deepEqual(s.projects[0], { id: 'p1', title: 'Creek survey', complete: true, counted: 2, missing: 1, start: '2024-03-01', end: '2024-03-31', identified: 0.5, located: 0.5 });
  assert.deepEqual(s.checks.map(c => [c.id, c.ok]), [['records', true], ['identified', false], ['located', false], ['notes', false], ['projects', false]]);
  const empty = Dash.summary([], [], { today: '2024-03-15' });
  assert.deepEqual([empty.n, empty.species, empty.checks[0].ok, empty.checks[4].ok], [0, 0, false, true]);
});

test('résumé: built from the journal, never includes notes or locations, and says what is unverified', () => {
  const active = records.filter(r => !r.deletedAt);
  const xp = X.compute(active, { longestStreak: 2 });
  const p = { xp, streak: { current: 0, longest: 2 }, review: V.record(V.parse(null)), standing: V.standing(xp.level, V.record(V.parse(null))) };
  const r = Res.build({ profile: { name: 'Ada Field', bio: 'Weekend naturalist.', credentials: 'BSc Ecology' }, records: active, projects, p,
    achievements: ['First observation'], rares: [{ name: 'Glowing mushroom', seen: '2024-03-01' }, { name: 'White fawn', seen: null }], today: '2024-03-15' });
  assert.equal(r.name, 'Ada Field');
  assert.match(r.headline, /Sprout field naturalist · Level 2 · 120 field XP/);
  assert.deepEqual(Object.fromEntries(r.stats).Observations, 4);
  assert.equal(Object.fromEntries(r.stats)['Longest streak'], '2 days');
  assert.equal(Object.fromEntries(r.stats)['Scientific names'], '25%');
  assert.deepEqual(r.projects, [{ title: 'Creek survey', start: '2024-03-01', end: '2024-03-31', records: 2 }]);
  assert.deepEqual(r.rares, ['Glowing mushroom']);
  const text = Res.text(r);
  assert.match(text, /^Ada Field\n/);
  assert.match(text, /Credentials \(self-described\): BSc Ecology/);
  assert.match(text, /Western sword fern \(Polystichum munitum\) × 2/);
  assert.match(text, /Creek survey \(2024-03-01 – 2024-03-31\): 2 records/);
  assert.match(text, /not yet community- or expert-verified\. Locations are not included\./);
  assert.doesNotMatch(text, /Elm St|alders|creek, about|-122|37\.7|Deleted bird/, 'no notes, coordinates or deleted records');
});
