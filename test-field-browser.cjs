// Run with Flask on :8080. Field session end to end, with the agent APIs mocked:
// start → add photos (GPS from EXIF; device location fallback) → agent drafts (Pl@ntNet guesses,
// species info, nearby records, write-up) → review: switch guess, approve, edit in form, delete,
// approve all → journal records with taxon, agent write-up and privacy-respecting location →
// post to iNaturalist with your token (only your notes) → offline drafts wait and resume.
require('./test-screens.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const SF = fs.readFileSync(__dirname + '/test-fixtures/gps-sf.jpg');
const NOGPS = fs.readFileSync(__dirname + '/test-fixtures/nogps.jpg');
const TOKEN = 'eyJhbGciOiJIUzUxMiJ9.eyJ1c2VyX2lkIjoxfQ.c2lnbmF0dXJl';
const SPECIES = { 'Polystichum munitum': { gbif: { key: 5274864, canonicalName: 'Polystichum munitum', rank: 'SPECIES', kingdom: 'Plantae', class: 'Polypodiopsida', order: 'Polypodiales', family: 'Dryopteridaceae', matchType: 'EXACT' }, inat: { commonName: 'Western Sword Fern' }, wikipedia: { extract: 'An evergreen fern of western North America.' }, sources: ['GBIF', 'iNaturalist', 'Wikipedia'] },
  'Blechnum spicant': { gbif: { key: 2650863, canonicalName: 'Blechnum spicant', rank: 'SPECIES', kingdom: 'Plantae', family: 'Blechnaceae', matchType: 'EXACT' }, inat: { commonName: 'Deer Fern' }, sources: ['GBIF'] },
  'Amanita muscaria': { gbif: { key: 2526528, canonicalName: 'Amanita muscaria', rank: 'SPECIES', kingdom: 'Fungi', class: 'Agaricomycetes', family: 'Amanitaceae', matchType: 'EXACT' }, inat: { commonName: 'Fly Agaric' }, sources: ['GBIF'] } };

(async () => {
  const browser = await chromium.launch();
  try {
    const origin = 'http://127.0.0.1:8080', errors = [], outbound = [], calls = [];
    let online = true, inatBody = null, inatToken = null;
    const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, geolocation: { latitude: 37.8044, longitude: -122.2712 }, permissions: ['geolocation'] });
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (!url.startsWith(origin)) { outbound.push(url); return route.abort(); }
      const u = new URL(url);
      if (!u.pathname.startsWith('/api/') || u.pathname === '/api/health') return route.continue();
      calls.push(u.pathname + u.search);
      if (!online) return route.abort();
      if (u.pathname === '/api/identify') return route.fulfill({ json: { source: 'plantnet', remaining: 400, results: [
        { scientificName: 'Polystichum munitum', commonNames: ['Western sword fern'], family: 'Dryopteridaceae', score: 0.81, gbifKey: 5274864 },
        { scientificName: 'Blechnum spicant', commonNames: ['Deer fern'], family: 'Blechnaceae', score: 0.06, gbifKey: 2650863 }] } });
      if (u.pathname === '/api/species') return route.fulfill({ json: { query: u.searchParams.get('name'), ...SPECIES[u.searchParams.get('name')] } });
      if (u.pathname === '/api/nearby') {
        const fungus = u.searchParams.get('group') === 'fungus';
        return route.fulfill({ json: { lat: Number(u.searchParams.get('lat')), lon: Number(u.searchParams.get('lon')), radiusKm: 10, source: 'iNaturalist',
          species: u.searchParams.get('name') ? { taxonId: 52611, name: u.searchParams.get('name'), nearby: 214, months: [1, 1, 9, 12, 15, 1, 1, 1, 1, 1, 1, 1] } : null,
          common: fungus ? [{ name: 'Amanita muscaria', commonName: 'Fly Agaric', count: 300 }, { name: 'Trametes versicolor', commonName: 'Turkey Tail', count: 90 }] : [{ name: 'Oxalis oregana', commonName: 'Redwood Sorrel', count: 80 }] } });
      }
      if (u.pathname === '/api/inat/observations') {
        inatToken = route.request().headers()['x-inat-token'];
        inatBody = route.request().postDataBuffer().toString('latin1');
        return route.fulfill({ json: { id: 987654, url: 'https://www.inaturalist.org/observations/987654', photos: 1 } });
      }
      return route.fulfill({ status: 404, json: { error: 'nope' } });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const journal = () => page.evaluate(() => JSON.parse(localStorage.getItem('terra.observations.v1') || '[]'));
    const ready = n => page.waitForFunction(n => document.querySelectorAll('.draft-card.ready').length === n, n, { timeout: 20000 });

    await page.goto(origin + '/#record');
    assert.equal(await page.locator('#field-active').isVisible(), false);
    assert.match(await page.locator('#inbox-list').textContent(), /No drafts yet/);
    await page.selectOption('#field-privacy', 'approximate');
    await page.click('#field-start');
    await page.locator('#field-active').waitFor();
    assert.match(await page.locator('#field-meta').textContent(), /Field session · .* · 0 photos/);

    // A plant photo with GPS in its EXIF.
    await page.setInputFiles('#field-photos', { name: 'fern.jpg', mimeType: 'image/jpeg', buffer: SF });
    await ready(1);
    let card = page.locator('.draft-card').first();
    assert.match(await card.locator('.draft-meta').textContent(), /Mar 13, 2024.*37\.775, -122\.419 \(from photo\)/);
    assert.deepEqual(await card.locator('.draft-guess').allTextContents(), ['Western sword fern · 81%', 'Deer fern · 6%']);
    assert.equal(await card.locator('.draft-name').inputValue(), 'Western Sword Fern');
    assert.match(await card.locator('.draft-writeup').textContent(), /Best guess: Western sword fern \(Polystichum munitum\), 81% match.*Near here: 214 iNaturalist observations within 10 km, mostly Apr to May.*draft from the TERRA agent/s);
    const nearbyCall = calls.find(c => c.startsWith('/api/nearby'));
    assert.match(nearbyCall, /lat=37\.8&lon=-122\.4/, 'only a rounded spot is sent for nearby records');
    assert.equal(await page.locator('#home-drafts').count(), 1);
    // Switch to the second guess, then back.
    await card.locator('.draft-guess', { hasText: 'Deer fern' }).click();
    await page.waitForFunction(() => document.querySelector('.draft-card.ready .draft-name')?.value === 'Deer Fern');
    card = page.locator('.draft-card').first();
    await card.locator('.draft-guess', { hasText: 'Western sword fern' }).click();
    await page.waitForFunction(() => document.querySelector('.draft-card.ready .draft-name')?.value === 'Western Sword Fern');
    card = page.locator('.draft-card').first();
    await card.locator('.draft-notes').fill('Under alders by the creek.');
    await card.locator('.draft-approve').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('terra.observations.v1') || '[]').length === 1);
    let [rec] = await journal();
    assert.deepEqual([rec.name, rec.type, rec.date, rec.privacy, rec.notes], ['Western Sword Fern', 'plant', '2024-03-13', 'approximate', 'Under alders by the creek.']);
    assert.deepEqual(rec.location, { version: 1, space: 'terra-geo-v1', kind: 'region', x1: -122.6, y1: 37.6, x2: -122.3, y2: 37.9 });
    assert.equal(rec.taxon.scientificName, 'Polystichum munitum');
    assert.match(rec.agent.summary, /Best guess/);
    await page.waitForFunction(() => document.querySelectorAll('.draft-card').length === 0);

    // A mushroom photo without GPS: device location, no photo ID, nearby fungi to choose from.
    await page.selectOption('#field-group-active', 'fungus');
    await page.setInputFiles('#field-photos', { name: 'shroom.jpg', mimeType: 'image/jpeg', buffer: NOGPS });
    await ready(1);
    card = page.locator('.draft-card').first();
    assert.match(await card.locator('.draft-meta').textContent(), /37\.804, -122\.271 \(from device\)/);
    assert.match(await card.locator('.draft-writeup').textContent(), /No photo ID for mushroom yet.*Commonly seen nearby \(mushroom\): Fly Agaric, Turkey Tail/s);
    assert.equal(calls.filter(c => c.startsWith('/api/identify')).length, 1, 'Pl@ntNet is only asked about plant photos');
    await card.locator('.draft-guess', { hasText: 'Fly Agaric' }).click();
    await page.waitForFunction(() => document.querySelector('.draft-card.ready .draft-name')?.value === 'Fly Agaric');
    // Edit in the full form instead: the draft moves to the form and leaves the inbox once saved.
    card = page.locator('.draft-card').first();
    await card.locator('.draft-edit').click();
    assert.equal(await page.inputValue('#name'), 'Fly Agaric');
    assert.equal(await page.inputValue('#organism-choice'), 'Mushroom');
    assert.equal(await page.inputValue('#date'), new Date().toLocaleDateString('en-CA'), 'no EXIF date: today');
    assert.equal(await page.locator('#preview-wrap').isVisible(), true, 'photo carried into the form');
    await page.click('#save-button');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('terra.observations.v1')).length === 2);
    await page.waitForFunction(() => document.querySelectorAll('.draft-card').length === 0);

    // Delete, and approve all.
    await page.setInputFiles('#field-photos', [{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: NOGPS }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: NOGPS }, { name: 'c.jpg', mimeType: 'image/jpeg', buffer: NOGPS }]);
    await ready(3);
    await page.locator('.draft-card').first().locator('.draft-delete').click();
    await page.waitForFunction(() => document.querySelectorAll('.draft-card').length === 2);
    await page.click('#inbox-approve-all');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('terra.observations.v1')).length === 4);

    // Offline: drafts wait, then resume when back online.
    await page.selectOption('#field-group-active', 'plant');
    online = false;
    await page.setInputFiles('#field-photos', { name: 'fern2.jpg', mimeType: 'image/jpeg', buffer: SF });
    await page.waitForFunction(() => document.querySelector('.draft-card.waiting'));
    assert.match(await page.locator('.draft-card .draft-state').textContent(), /Waiting for connection/);
    online = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await ready(1);

    // iNaturalist: token, then Approve & post. Only your notes go; the write-up doesn't.
    await page.locator('.inat-connect summary').click();
    await page.fill('#inat-token', 'not-a-token');
    await page.click('#inat-save');
    assert.match(await page.locator('#inat-state').textContent(), /doesn't look like an iNaturalist API token/);
    await page.fill('#inat-token', TOKEN);
    await page.click('#inat-save');
    assert.match(await page.locator('#inat-state').textContent(), /Connected/);
    card = page.locator('.draft-card').first();
    await card.locator('.draft-privacy').selectOption('exact');
    await card.locator('.draft-notes').fill('Second patch, uphill.');
    await card.locator('.draft-post').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('terra.observations.v1')).some(r => r.inat));
    assert.equal(inatToken, TOKEN);
    const posted = JSON.parse(inatBody.match(/name="observation"\r\n\r\n(\{.*?\})\r\n/s)[1]);
    assert.deepEqual(posted, { name: 'Western Sword Fern', scientificName: 'Polystichum munitum', date: '2024-03-13', privacy: 'exact', notes: 'Second patch, uphill.', lat: 37.77491, lon: -122.41942, accuracy: 10 });
    assert.doesNotMatch(inatBody, /Best guess|TERRA agent/, 'machine-written text is never posted');
    assert.match(inatBody, /name="photos"; filename="photo\.jpg"/);
    rec = (await journal()).find(r => r.inat);
    assert.deepEqual(rec.inat, { id: 987654, url: 'https://www.inaturalist.org/observations/987654', posted: new Date().toLocaleDateString('en-CA') });
    await page.goto(origin + '/#journal');
    assert.equal(await page.locator('.card-inat').first().getAttribute('href'), 'https://www.inaturalist.org/observations/987654');
    assert.ok(await page.locator('.card-inat-post').count() >= 1, 'other records offer Post to iNaturalist');
    assert.match(await page.locator('.card-agent').first().textContent(), /Agent write-up/);

    // End the session; phone width.
    await page.goto(origin + '/#record');
    await page.click('#field-end');
    await page.locator('#field-idle').waitFor();
    await page.setViewportSize({ width: 360, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors.filter(e => !/Failed to load resource/.test(e)), [], errors.join(' | '));
    await context.close();
    console.log('PASS: field session — photos with EXIF GPS or device location, agent drafts (guesses, species info, rounded nearby lookup, write-up), switch guess, approve with privacy-respecting location, edit in full form, delete, approve all, offline wait and resume, iNaturalist token check and post with only your notes, journal links and write-ups, phone width.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
