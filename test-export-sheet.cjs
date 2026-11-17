const assert = require('node:assert/strict');
const test = require('node:test');
const zlib = require('node:zlib');
const X = require('./xlsx-writer.js');
const E = require('./export-sheet.js');
const D = require('./local-data.js');

// Read a stored (uncompressed) zip back into { name: text }, checking every CRC.
function unzip(bytes) {
  const buf = Buffer.from(bytes), out = {};
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end > 0, 'has end-of-central-directory');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50);
    const crc = buf.readUInt32LE(at + 16), size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28), local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    assert.equal(zlib.crc32(data), crc, `CRC of ${name}`);
    out[name] = data.toString('utf8');
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return out;
}
const rec = (id, extra = {}) => ({ id, type: 'plant', name: 'Sword fern', notes: '', date: '2024-03-13', privacy: 'hidden', ...extra });
const exactPoint = { version: 1, space: D.GEO, kind: 'point', x: -122.41234, y: 37.77654 };
const area = { version: 1, space: D.GEO, kind: 'region', x1: -122.5, x2: -122.3, y1: 37.7, y2: 37.9 };

test('workbook is a valid zip with sheets, frozen headers, filters, dates and plain-text cells', () => {
  const files = unzip(X.build([
    { name: 'Obs', columns: [{ header: 'ID' }, { header: 'Date', type: 'date' }, { header: 'Lat', type: 'number' }, { header: 'Notes', type: 'wrap' }],
      rows: [['a', '2024-03-13', 37.5, '=HYPERLINK("http://x") & <b> 🍄'], ['b', 'not a date', null, '']] },
    { name: 'About: [info]?', columns: [{ header: 'K' }, { header: 'V' }], rows: [], filter: false }
  ]));
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'docProps/core.xml']) assert.ok(files[part], part);
  const s1 = files['xl/worksheets/sheet1.xml'];
  assert.match(s1, /state="frozen"/); assert.match(s1, /<autoFilter ref="A1:D3"\/>/);
  assert.match(s1, /<c r="B2" s="2"><v>45364<\/v><\/c>/, '2024-03-13 is Excel day 45364');
  assert.match(s1, /<c r="C2"><v>37.5<\/v><\/c>/);
  assert.match(s1, /<c r="D2" t="inlineStr" s="3"><is><t xml:space="preserve">=HYPERLINK\(&quot;http:\/\/x&quot;\) &amp; &lt;b&gt; 🍄<\/t><\/is><\/c>/);
  assert.doesNotMatch(s1, /<f>/, 'no formulas, ever');
  assert.match(s1, /<c r="B3" t="inlineStr"><is><t xml:space="preserve">not a date<\/t>/);
  assert.match(files['xl/workbook.xml'], /<sheet name="About info" sheetId="2"/);
  assert.doesNotMatch(files['xl/worksheets/sheet2.xml'], /autoFilter/);
  assert.equal(X.colName(0), 'A'); assert.equal(X.colName(25), 'Z'); assert.equal(X.colName(26), 'AA'); assert.equal(X.colName(701), 'ZZ'); assert.equal(X.colName(702), 'AAA');
});

test('locations follow privacy: hidden stays hidden, approximate stays an area, exact is generalized unless asked', () => {
  const opts = { geo: D.GEO, cell: D.GEO_CELL };
  assert.deepEqual(E.place(rec('h', { privacy: 'hidden', location: { version: 1, space: D.GEO, kind: 'withheld' } }), opts).shown, 'Hidden');
  assert.equal(E.place(rec('n', { privacy: 'exact' }), opts).shown, 'Hidden', 'no location saved');
  const general = E.place(rec('e', { privacy: 'exact', location: exactPoint }), opts);
  assert.equal(general.shown, 'Generalized (exact not included)');
  assert.deepEqual(general.box, { x1: -122.5, y1: 37.7, x2: -122.4, y2: 37.8 });
  assert.ok(general.uncertainty > 5000 && general.uncertainty < 8000, `${general.uncertainty} m`);
  assert.notEqual(general.lat, exactPoint.y);
  const exact = E.place(rec('e', { privacy: 'exact', location: exactPoint }), { ...opts, exact: true });
  assert.deepEqual([exact.shown, exact.lat, exact.lon], ['Exact', 37.77654, -122.41234]);
  const approx = E.place(rec('a', { privacy: 'approximate', location: area }), { ...opts, exact: true });
  assert.equal(approx.shown, 'Approximate area', 'ticking exact never sharpens an approximate record');
  assert.deepEqual([approx.lat, approx.lon], [37.8, -122.4]);
  const schematic = E.place(rec('s', { privacy: 'exact', location: { version: 1, space: D.SPACE, kind: 'point', x: 40, y: 40 } }), opts);
  assert.equal(schematic.lat, undefined); assert.match(schematic.shown, /Schematic/);
  // Southern and western hemispheres snap down to the containing cell.
  assert.deepEqual(E.place(rec('s', { privacy: 'exact', location: { ...exactPoint, x: 174.76, y: -36.85 } }), opts).box, { x1: 174.7, y1: -36.9, x2: 174.8, y2: -36.8 });
});

test('TERRA columns: active records only, projects listed, members with missing references', () => {
  const records = [
    rec('r2', { date: '2024-03-14', type: 'fungus', name: 'Turkey tail', notes: '+cmd|calc', privacy: 'exact', location: exactPoint }),
    rec('r1', { privacy: 'approximate', location: area }),
    rec('gone', { deletedAt: '2024-03-15T00:00:00.000Z' })
  ];
  const projects = [{ id: 'p1', title: 'Fern survey', type: 'custom', date: '2024-03-01', endDate: '2024-03-31', site: '', species: '', notes: '', complete: false, observationIds: ['r1', 'gone'] }];
  const [obs, proj, members, about] = E.sheets(records, projects, { photoCounts: new Map([['r2', 3]]), now: new Date('2024-03-16T00:00:00Z'), geo: D.GEO, cell: D.GEO_CELL });
  assert.equal(obs.name, 'Observations');
  assert.deepEqual(obs.rows.map(r => r[0]), ['r1', 'r2'], 'oldest first, Trash excluded');
  const head = obs.columns.map(c => c.header);
  const row = id => Object.fromEntries(head.map((h, i) => [h, obs.rows.find(r => r[0] === id)[i]]));
  assert.equal(row('r1')['Location in this export'], 'Approximate area');
  assert.equal(row('r1').Projects, 'Fern survey');
  assert.equal(row('r2').Group, 'Fungus'); assert.equal(row('r2').Photos, 3); assert.equal(row('r2').Notes, '+cmd|calc');
  assert.equal(row('r2')['Location in this export'], 'Generalized (exact not included)');
  assert.deepEqual(proj.rows[0].slice(0, 5), ['p1', 'Fern survey', 'Custom', '2024-03-01', '2024-03-31']);
  assert.deepEqual(proj.rows[0].slice(8), ['Open', 1, 1, 'No']);
  assert.deepEqual(members.rows.map(r => r[5]), ['Included', 'Missing or out of scope (not counted)']);
  assert.equal(about.filter, false);
  const facts = Object.fromEntries(about.rows);
  assert.equal(facts.Observations, 2); assert.equal(facts['With coordinates in this export'], 2);
  assert.match(facts.Locations, /No exact points/); assert.match(facts['Google Sheets'], /File → Import/);
  // The whole workbook builds and every notes cell stays text.
  const files = unzip(X.build(E.sheets(records, projects, { exact: true, geo: D.GEO, cell: D.GEO_CELL })));
  assert.match(files['xl/worksheets/sheet1.xml'], /t="inlineStr" s="3"><is><t xml:space="preserve">\+cmd\|calc/);
  assert.match(files['xl/worksheets/sheet1.xml'], /<v>37.77654<\/v>/);
});

test('Darwin Core columns use standard terms and withhold what the observer withheld', () => {
  const records = [rec('r1', { type: 'insect', name: 'Seven-spotted ladybug', privacy: 'approximate', location: area }), rec('r2', { name: 'Unknown', type: 'bird' })];
  const [occ] = E.sheets(records, [], { style: 'dwc', geo: D.GEO, cell: D.GEO_CELL });
  assert.equal(occ.name, 'Occurrences');
  const head = occ.columns.map(c => c.header);
  for (const term of ['occurrenceID', 'basisOfRecord', 'eventDate', 'verbatimIdentification', 'kingdom', 'decimalLatitude', 'decimalLongitude', 'geodeticDatum', 'coordinateUncertaintyInMeters', 'informationWithheld', 'dataGeneralizations']) assert.ok(head.includes(term), term);
  const row = id => Object.fromEntries(head.map((h, i) => [h, occ.rows.find(r => r[0] === id)[i]]));
  assert.deepEqual([row('r1').basisOfRecord, row('r1').kingdom, row('r1').class, row('r1').geodeticDatum], ['HumanObservation', 'Animalia', 'Insecta', 'WGS84']);
  assert.match(row('r1').dataGeneralizations, /approximate area/);
  assert.ok(row('r1').coordinateUncertaintyInMeters > 10000);
  assert.equal(row('r2').verbatimIdentification, '', 'Unknown is left blank, not invented');
  assert.equal(row('r2').decimalLatitude, ''); assert.match(row('r2').informationWithheld, /withheld/);
  assert.equal(E.filename('dwc', '2024-03-13'), 'terra-darwin-core-2024-03-13.xlsx');
  assert.equal(E.filename('terra', '2024-03-13'), 'terra-journal-2024-03-13.xlsx');
});
