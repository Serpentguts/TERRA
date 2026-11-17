// Run with Flask on :8080. Spreadsheet export from Journal and Projects: dialog, both column
// styles, exact-location opt-in, downloaded .xlsx contents, empty journal, phone width, no network.
require('./test-screens.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const zlib = require('node:zlib');

function unzip(buf) {
  const out = {}, end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
    const crc = buf.readUInt32LE(at + 16), size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28), local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen), start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    assert.equal(zlib.crc32(data), crc, name);
    out[name] = data.toString('utf8');
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return out;
}
const texts = xml => [...xml.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map(m => m[1]);

(async () => {
  const browser = await chromium.launch();
  try {
    const origin = 'http://127.0.0.1:8080', errors = [], outbound = [];
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, acceptDownloads: true });
    await context.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      outbound.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(() => {
      for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[api] = () => { throw Error('No network'); };
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const download = async () => {
      const wait = page.waitForEvent('download');
      await page.click('#sheet-download');
      const file = await wait;
      return { name: file.suggestedFilename(), files: unzip(await fs.readFile(await file.path())) };
    };

    // Empty journal: the dialog opens and explains there's nothing yet.
    await page.goto(origin + '/#journal');
    await page.click('#sheet-export-open');
    assert.equal(await page.locator('#sheet-export').isVisible(), true);
    assert.equal(await page.locator('input[name="sheet-style"][value="terra"]').isChecked(), true);
    assert.equal(await page.locator('#sheet-exact').isChecked(), false, 'exact locations are opt-in');
    await page.click('#sheet-download');
    assert.match(await page.locator('#sheet-status').textContent(), /Nothing to export yet/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sheet-export').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'sheet-export-open', 'focus returns to the button');

    // A journal with all three privacy levels, a deleted record and a project.
    const GEO = 'terra-geo-v1';
    const records = [
      { id: 'o1', type: 'plant', name: 'Sword fern', notes: '=SUM(1,2) looks like a formula', date: '2024-03-12', privacy: 'exact', location: { version: 1, space: GEO, kind: 'point', x: -122.41234, y: 37.77654 } },
      { id: 'o2', type: 'fungus', name: 'Turkey tail', notes: 'On a fallen oak.', date: '2024-03-13', privacy: 'approximate', location: { version: 1, space: GEO, kind: 'region', x1: -122.5, x2: -122.3, y1: 37.7, y2: 37.9 } },
      { id: 'o3', type: 'bird', name: 'Unknown', notes: '', date: '2024-03-13', privacy: 'hidden' },
      { id: 'o4', type: 'plant', name: 'Deleted thing', notes: '', date: '2024-03-10', privacy: 'hidden', deletedAt: new Date().toISOString() }
    ];
    const projects = { format: 'terra-projects', version: 1, projects: [{ id: 'p1', title: 'Spring survey', type: 'custom', date: '2024-03-01', endDate: '2024-03-31', site: '', species: '', notes: '', complete: false, observationIds: ['o1', 'o2', 'gone'] }] };
    await page.evaluate(({ records, projects }) => {
      localStorage.setItem('terra.observations.v1', JSON.stringify(records));
      localStorage.setItem('terra.projects.v1', JSON.stringify(projects));
    }, { records, projects });
    await page.reload();

    // Plain-language export: exact point generalized, Trash left out, formula text kept as text.
    await page.click('#sheet-export-open');
    let out = await download();
    assert.match(out.name, /^terra-journal-\d{4}-\d{2}-\d{2}\.xlsx$/);
    assert.match(out.files['xl/workbook.xml'], /<sheet name="Observations".*<sheet name="Projects".*<sheet name="Project members".*<sheet name="About"/);
    let obs = out.files['xl/worksheets/sheet1.xml'];
    const words = texts(obs);
    assert.ok(words.includes('Sword fern') && words.includes('Turkey tail') && !words.includes('Deleted thing'));
    assert.ok(words.includes('=SUM(1,2) looks like a formula')); assert.doesNotMatch(obs, /<f>/);
    assert.ok(words.includes('Generalized (exact not included)') && words.includes('Approximate area') && words.includes('Hidden'));
    assert.doesNotMatch(obs, /37\.77654|-122\.41234/, 'exact point not in the default export');
    assert.ok(texts(out.files['xl/worksheets/sheet3.xml']).includes('Missing or out of scope (not counted)'));
    assert.match(await page.locator('#sheet-status').textContent(), /Downloaded 3 observations and 1 project\. Open it in Excel, or import it into Google Sheets\./);

    // Darwin Core with exact locations ticked.
    await page.check('input[name="sheet-style"][value="dwc"]');
    await page.check('#sheet-exact');
    out = await download();
    assert.match(out.name, /^terra-darwin-core-/);
    obs = out.files['xl/worksheets/sheet1.xml'];
    assert.match(out.files['xl/workbook.xml'], /<sheet name="Occurrences"/);
    assert.ok(texts(obs).includes('decimalLatitude') && texts(obs).includes('HumanObservation'));
    assert.match(obs, /<v>37.77654<\/v>/, 'exact point included when asked');
    assert.match(await page.locator('#sheet-status').textContent(), /with exact locations\. Keep this file private\./);
    await page.keyboard.press('Escape');

    // Same dialog from Projects.
    await page.goto(origin + '/#projects');
    await page.click('#project-sheet-export');
    assert.equal(await page.locator('#sheet-export').isVisible(), true);
    assert.equal(await page.locator('.sheet-google a').getAttribute('rel'), 'noopener');
    await page.click('#sheet-export .post-viewer-close button');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'project-sheet-export');

    // Phone width: the dialog fits.
    await page.setViewportSize({ width: 360, height: 760 });
    await page.goto(origin + '/#journal');
    await page.click('#sheet-export-open');
    const box = await page.locator('#sheet-export').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 360, 'dialog fits a phone');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
    console.log('PASS: spreadsheet export from Journal and Projects, empty-journal message, plain-language and Darwin Core workbooks, exact locations opt-in only, Trash excluded, formula text kept as text, project members, focus return, phone width, no network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
