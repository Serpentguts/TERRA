const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const script = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
const F = vm.runInNewContext(script('field-summary-logic') + '\nFieldSummary;');
const dna = vm.runInNewContext(script('genetic-preview-logic') + '\nvalidateLocalDNA;');
const plain = x => JSON.parse(JSON.stringify(x));
const p = { id: 'p', title: 'Test', type: 'custom', date: '', site: '', species: '', notes: '', complete: false, observationIds: ['old', 'missing'] };
const r = { id: 'new', date: '2024-02-29', name: 'Oak', type: 'plant', notes: '', privacy: 'hidden' };
test('explicit project membership is ID-only, immutable and idempotent', () => {
  const before = JSON.stringify(p);
  const next = F.addMember([p], 'p', r);
  assert.deepEqual(plain(next[0].observationIds), ['old', 'missing', 'new']);
  assert.deepEqual(plain(F.addMember(next, 'p', r)), plain(next));
  assert.equal(JSON.stringify(p), before);
  assert.equal(Object.hasOwn(next[0], 'observations'), false);
});
test('missing, completed and nonmatching projects reject additions', () => {
  assert.throws(() => F.addMember([], 'p', r), /existing/);
  assert.throws(() => F.addMember([{ ...p, complete: true }], 'p', r), /complete/);
  for (const patch of [{ type: 'day', date: '2024-03-01' }, { type: 'species', species: 'oak' }]) assert.throws(() => F.addMember([{ ...p, ...patch }], 'p', r), /scope/);
  for (const patch of [{ type: 'day', date: r.date }, { type: 'species', species: ' Oak ' }, { type: 'site', site: 'Manual label' }]) assert.equal(F.addMember([{ ...p, ...patch }], 'p', r)[0].observationIds.length, 3);
});
test('temporary DNA preview validates plain/single FASTA IUPAC, reports syntax only', () => {
  assert.deepEqual(plain(dna(' acgt ry\nN ')), { length: 7, ambiguous: 3 });
  assert.deepEqual(plain(dna('>private header\r\nACGT\r\nN')), { length: 5, ambiguous: 1 });
  assert.deepEqual(plain(dna('A'.repeat(10000))), { length: 10000, ambiguous: 0 });
  for (const value of ['', '  ', '>', '>header', 'ACGU', 'AC-G', 'AC12', 'AC>header', '>one\nAC\n>two\nGT', 'A'.repeat(10001), '<script>']) assert.throws(() => dna(value), undefined, value.slice(0, 20));
});
