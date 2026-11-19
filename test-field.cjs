const assert = require('node:assert/strict');
const test = require('node:test');
const F = require('./field.js');
const D = require('./local-data.js');

const draft = extra => ({ group: 'plant', capturedAt: '2024-03-13T09:41', location: { lat: 37.77491, lon: -122.41942, accuracy: 20, source: 'photo' }, chosen: 0,
  guesses: [{ scientificName: 'Polystichum munitum', commonName: 'Western sword fern', family: 'Dryopteridaceae', score: 0.81, gbifKey: 5274864, source: 'plantnet' },
    { scientificName: 'Blechnum spicant', commonName: 'Deer fern', score: 0.06, source: 'plantnet' }],
  species: { gbif: { key: 5274864, canonicalName: 'Polystichum munitum', rank: 'SPECIES', kingdom: 'Plantae', class: 'Polypodiopsida', order: 'Polypodiales', family: 'Dryopteridaceae' },
    inat: { commonName: 'Western Sword Fern', conservation: null }, wikipedia: { extract: 'Polystichum munitum is an evergreen fern. It grows in moist forests.' } },
  nearby: { radiusKm: 10, species: { nearby: 214, months: [1, 1, 9, 12, 15, 1, 1, 1, 1, 1, 1, 1] }, common: [{ name: 'Oxalis oregana', commonName: 'Redwood Sorrel', count: 80 }] },
  nameFromAgent: 'Western Sword Fern', ...extra });

test('season finds the busy stretch of the year', () => {
  assert.equal(F.season([1, 1, 9, 12, 15, 1, 1, 1, 1, 1, 1, 1]), 'Apr to May');
  assert.equal(F.season([0, 0, 0, 0, 0, 0, 30, 0, 0, 0, 0, 0]), 'Jul');
  assert.equal(F.season([10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12]), 'Dec to Jan', 'wraps around the new year');
  assert.equal(F.season([1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1]), null, 'too few records');
  assert.equal(F.season([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), null, 'no clear season');
});

test('the write-up uses only what the agent found, and says what it is', () => {
  const w = F.compose(draft());
  assert.match(w.summary, /^Best guess: Western sword fern \(Polystichum munitum\), 81% match from Pl@ntNet\./);
  assert.match(w.summary, /Also possible: Deer fern \(6%\)\./);
  assert.match(w.summary, /Taxonomy: family Dryopteridaceae, order Polypodiales\./);
  assert.match(w.summary, /Near here: 214 iNaturalist observations within 10 km, mostly Apr to May\./);
  assert.match(w.summary, /Commonly seen nearby \(plant\): Redwood Sorrel\./);
  assert.match(w.summary, /Polystichum munitum is an evergreen fern\.\n/);
  assert.match(w.summary, /This is a draft from the TERRA agent\. Check it against what you saw\.$/);
  assert.deepEqual(w.sources.sort(), ['GBIF', 'Pl@ntNet', 'Wikipedia', 'iNaturalist']);
  const fungus = F.compose({ group: 'fungus', guesses: [], location: null, nearby: null });
  assert.match(fungus.summary, /No photo ID for mushroom yet/);
  assert.match(fungus.summary, /No location/);
  const rare = F.compose(draft({ nearby: { radiusKm: 10, species: { nearby: 0, months: Array(12).fill(0) }, common: [] } }));
  assert.match(rare.summary, /no iNaturalist observations within 10 km\. It may be unusual here, or the ID may be off/);
});

test('approved drafts become valid journal records; location follows privacy', () => {
  const base = { id: 'r1', name: 'Western Sword Fern', group: 'plant', notes: ' Under alders. ', today: '2024-03-20', GEO: D.GEO, GEO_CELL: D.GEO_CELL };
  const d = draft({ writeUp: F.compose(draft()) });
  const approx = F.toRecord(d, { ...base, privacy: 'approximate' });
  assert.ok(D.optional(approx) && D.location(approx.location, 'approximate'), JSON.stringify(approx.location));
  assert.deepEqual(approx.location, { version: 1, space: D.GEO, kind: 'region', x1: -122.6, y1: 37.6, x2: -122.3, y2: 37.9 });
  assert.ok(approx.location.x1 < -122.41942 && approx.location.x2 > -122.41942 && approx.location.y1 < 37.77491 && approx.location.y2 > 37.77491, 'contains the spot');
  assert.deepEqual([approx.date, approx.notes, approx.type, approx.privacy], ['2024-03-13', 'Under alders.', 'plant', 'approximate']);
  assert.deepEqual(approx.taxon, { scientificName: 'Polystichum munitum', source: 'plantnet', gbifKey: 5274864, score: 0.81, rank: 'species', family: 'Dryopteridaceae', kingdom: 'Plantae', class: 'Polypodiopsida' });
  assert.match(approx.agent.summary, /Best guess/);
  const exact = F.toRecord(d, { ...base, privacy: 'exact' });
  assert.deepEqual(exact.location, { version: 1, space: D.GEO, kind: 'point', x: -122.41942, y: 37.77491 });
  assert.ok(D.optional(exact));
  const hidden = F.toRecord(d, { ...base, privacy: 'hidden' });
  assert.deepEqual(hidden.location, { version: 1, space: D.GEO, kind: 'withheld' });
  assert.ok(D.optional(hidden));
  // A renamed record drops the agent's taxon; a draft without location is hidden.
  assert.equal(F.toRecord(d, { ...base, name: 'Some other fern', privacy: 'exact' }).taxon, undefined);
  const noSpot = F.toRecord(draft({ location: null }), { ...base, privacy: 'exact' });
  assert.deepEqual([noSpot.privacy, noSpot.location.kind], ['hidden', 'withheld']);
  // A photo "taken" in the future (wrong camera clock) is dated today.
  assert.equal(F.toRecord(draft({ capturedAt: '2030-01-01T10:00' }), { ...base, privacy: 'hidden' }).date, '2024-03-20');
  assert.equal(F.toRecord(draft(), { ...base, name: '  ', privacy: 'hidden' }).name, 'Unknown');
});

test('iNaturalist gets your name, date, place and notes, never the write-up', () => {
  const r = F.toRecord(draft({ writeUp: { summary: 'MACHINE TEXT', sources: [] } }), { id: 'r', name: 'Western Sword Fern', group: 'plant', notes: 'Mine.', privacy: 'approximate', today: '2024-03-20', GEO: D.GEO, GEO_CELL: D.GEO_CELL });
  const f = F.inatFields(r);
  assert.deepEqual(Object.keys(f).sort(), ['accuracy', 'date', 'lat', 'lon', 'name', 'notes', 'privacy', 'scientificName']);
  assert.deepEqual([f.name, f.scientificName, f.date, f.privacy, f.notes, f.lat, f.lon], ['Western Sword Fern', 'Polystichum munitum', '2024-03-13', 'approximate', 'Mine.', 37.75, -122.45]);
  assert.ok(f.accuracy > 15000 && f.accuracy < 25000, String(f.accuracy));
  assert.doesNotMatch(JSON.stringify(f), /MACHINE/);
  assert.equal(F.tokenFresh({ token: 'a.b.c', saved: 0 }, 23 * 3600e3), true);
  assert.equal(F.tokenFresh({ token: 'a.b.c', saved: 0 }, 25 * 3600e3), false, 'tokens last 24 hours');
  assert.equal(F.tokenFresh(null), false);
});
