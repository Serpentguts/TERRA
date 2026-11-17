// Run with Flask on :8080. TERRA agent on the Record form, with the agent API mocked:
// photo → prepare → Pl@ntNet suggestions → species info → form filled → saved with taxon.
// Also: not-configured server, non-plant groups, typed-name lookup, auto-identify, and that
// nothing but the re-encoded photo is sent. No outside network.
require('./test-screens.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAOklEQVR4Xu3QMQ0AMAzEwDS4MhddQVch4V98BCz5zLuV0InoMoxxNcbVGFdjXI1xNcbVGFdjXI2Jrf6q4AFK2wTUPQAAAABJRU5ErkJggg==', 'base64');
const IDENTIFY = { source: 'plantnet', remaining: 497, results: [
  { scientificName: 'Polystichum munitum', commonNames: ['Western sword fern'], family: 'Dryopteridaceae', genus: 'Polystichum', score: 0.8123, gbifKey: 5274864 },
  { scientificName: 'Blechnum spicant', commonNames: ['Deer fern'], family: 'Blechnaceae', genus: 'Blechnum', score: 0.05, gbifKey: null }
] };
const SPECIES = name => ({
  query: name, sources: ['GBIF', 'iNaturalist', 'Wikipedia'],
  gbif: name.startsWith('Amanita') || name === 'Fly agaric'
    ? { key: 2526528, canonicalName: 'Amanita muscaria', rank: 'SPECIES', kingdom: 'Fungi', class: 'Agaricomycetes', family: 'Amanitaceae', matchType: 'EXACT' }
    : { key: 5274864, canonicalName: 'Polystichum munitum', rank: 'SPECIES', kingdom: 'Plantae', phylum: 'Tracheophyta', class: 'Polypodiopsida', order: 'Polypodiales', family: 'Dryopteridaceae', matchType: 'EXACT' },
  inat: { id: 52611, commonName: name.startsWith('Amanita') || name === 'Fly agaric' ? 'Fly Agaric' : 'Western Sword Fern', observations: 61234, iconic: name.startsWith('Amanita') || name === 'Fly agaric' ? 'Fungi' : 'Plantae', conservation: null, photo: null, url: 'https://www.inaturalist.org/taxa/52611' },
  wikipedia: { title: name, extract: 'An evergreen fern native to western North America.', url: 'https://en.wikipedia.org/wiki/Polystichum_munitum' }
});

(async () => {
  const browser = await chromium.launch();
  try {
    const origin = 'http://127.0.0.1:8080', errors = [], outbound = [], sent = [];
    let configured = true;
    const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (!url.startsWith(origin)) { outbound.push(url); return route.abort(); }
      const path = new URL(url).pathname;
      if (path === '/api/agent/status') return route.fulfill({ json: { plantnet: configured, inat_vision: false, species: true } });
      if (path === '/api/identify') {
        sent.push(route.request().postDataBuffer());
        return configured ? route.fulfill({ json: IDENTIFY }) : route.fulfill({ status: 503, json: { error: 'not_configured', message: 'Plant identification isn\'t set up on this TERRA server.' } });
      }
      if (path === '/api/species') return route.fulfill({ json: SPECIES(new URL(url).searchParams.get('name')) });
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const save = async () => { await page.selectOption('#privacy', 'hidden'); await page.evaluate(() => { if (!TerraMaps.observation.read()) TerraMaps.observation.select(20, 20, 80, 80); }); await page.click('#save-button'); };
    const photo = () => page.setInputFiles('#photo', { name: 'fern.png', mimeType: 'image/png', buffer: PNG });

    await page.goto(origin + '/#record');
    assert.equal(await page.locator('#agent-card').isVisible(), false, 'hidden until there is a photo or a lookup');
    assert.equal(await page.locator('#agent-auto').isChecked(), false, 'nothing is sent automatically by default');

    // Photo → Identify → suggestions.
    await photo();
    assert.equal(await page.locator('#agent-card').isVisible(), true);
    assert.equal(sent.length, 0, 'not sent until asked');
    await page.click('#agent-identify');
    await page.locator('.agent-result').first().waitFor();
    assert.equal(await page.locator('.agent-result').count(), 2);
    assert.match(await page.locator('.agent-result').first().textContent(), /Western sword fern.*Polystichum munitum.*Dryopteridaceae.*81%/);
    assert.match(await page.locator('#agent-status').textContent(), /suggests 2 species.*497 identifications left today/);
    assert.deepEqual(await page.locator('.agent-step.done').evaluateAll(s => s.map(x => x.dataset.step)), ['prepare', 'identify']);
    // Only the re-encoded photo and the organ went out: a JPEG, not the original PNG, and no form fields.
    const body = sent[0].toString('latin1');
    assert.match(body, /name="image"; filename="photo\.jpg"\r\nContent-Type: image\/jpeg/);
    assert.match(body, /name="organ"\r\n\r\nauto/);
    assert.doesNotMatch(body, /PNG/, 'original file not sent');
    assert.doesNotMatch(body, /name="(name|notes|date|privacy|location)"/);

    // Use the top suggestion: species info, form filled, saved with taxon.
    await page.click('.agent-result >> nth=0 >> button');
    await page.locator('#agent-species:not([hidden])').waitFor();
    assert.equal(await page.inputValue('#name'), 'Western Sword Fern');
    assert.equal(await page.inputValue('#organism-choice'), 'Plant');
    const card = await page.locator('#agent-species').textContent();
    assert.match(card, /Polystichum munitum.*Family.*Dryopteridaceae.*Observations on iNaturalist.*61,234.*evergreen fern/s);
    assert.deepEqual(await page.locator('#agent-species .agent-links a').evaluateAll(a => a.map(x => [x.textContent, x.href, x.rel])), [
      ['GBIF', 'https://www.gbif.org/species/5274864', 'noopener noreferrer'], ['iNaturalist', 'https://www.inaturalist.org/taxa/52611', 'noopener noreferrer'],
      ['Wikipedia', 'https://en.wikipedia.org/wiki/Polystichum_munitum', 'noopener noreferrer']]);
    assert.match(await page.locator('#agent-status').textContent(), /Filled in “Western Sword Fern” \(Plant\)/);
    await save();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('terra.observations.v1') || '[]').length === 1);
    const [saved] = await page.evaluate(() => JSON.parse(localStorage.getItem('terra.observations.v1')));
    assert.equal(saved.name, 'Western Sword Fern');
    assert.deepEqual(saved.taxon, { scientificName: 'Polystichum munitum', source: 'plantnet', gbifKey: 5274864, score: 0.8123, rank: 'species', family: 'Dryopteridaceae', kingdom: 'Plantae', class: 'Polypodiopsida' });
    assert.equal(await page.locator('#agent-card').isVisible(), false, 'agent resets after saving');
    await page.goto(origin + '/#journal');
    assert.match(await page.locator('.card-taxon').first().textContent(), /Polystichum munitum/);
    assert.match(await page.locator('.identification-history').first().textContent(), /Suggested by Pl@ntNet photo ID \(81% confidence\) and chosen by you; matched to GBIF species 5274864\. Not yet reviewed/);

    // Editing the name drops the identification (it no longer matches what the agent filled in).
    await page.goto(origin + '/#record');
    await photo();
    await page.click('#agent-identify');
    await page.click('.agent-result >> nth=1 >> button');
    await page.locator('#agent-species:not([hidden])').waitFor();
    assert.equal(await page.locator('.agent-result').count(), 0, 'suggestions collapse once one is picked');
    await page.fill('#name', 'Some other fern');
    await save();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('terra.observations.v1')).length === 2);
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('terra.observations.v1'))))[0].taxon, undefined);

    // Non-plant groups skip Pl@ntNet and say why; typed-name lookup works for any group.
    await page.fill('#organism-choice', 'Mushroom');
    await photo();
    await page.click('#agent-identify');
    await page.waitForFunction(() => /identifies plants/.test(document.getElementById('agent-status').textContent));
    assert.equal(await page.locator('.agent-step.skipped').count(), 1);
    assert.equal(sent.length, 2, 'nothing sent for a mushroom photo');
    await page.fill('#name', 'Fly agaric');
    await page.click('#agent-lookup');
    await page.locator('#agent-species:not([hidden])').waitFor();
    assert.equal(await page.inputValue('#name'), 'Fly Agaric');
    assert.equal(await page.inputValue('#organism-choice'), 'Mushroom');
    await save();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('terra.observations.v1')).length === 3);
    assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('terra.observations.v1'))))[0].taxon,
      { scientificName: 'Amanita muscaria', source: 'gbif', gbifKey: 2526528, rank: 'species', family: 'Amanitaceae', kingdom: 'Fungi', class: 'Agaricomycetes' });

    // Auto-identify: remembered, and runs as soon as a plant photo is added.
    await page.fill('#organism-choice', 'Plant');
    await photo();
    await page.check('#agent-auto'); // Turning it on identifies the current photo straight away.
    await page.locator('.agent-result').first().waitFor();
    assert.equal(sent.length, 3);
    await page.reload();
    assert.equal(await page.locator('#agent-auto').isChecked(), true, 'preference remembered');
    await photo();
    await page.waitForFunction(() => document.querySelectorAll('.agent-result').length === 2);
    assert.equal(sent.length, 4, 'runs as soon as a photo is added');

    // Server without a key: a clear setup message, nothing breaks.
    configured = false;
    await page.reload();
    await photo(); // Auto-identify is still on.
    await page.waitForFunction(() => /PLANTNET_API_KEY/.test(document.getElementById('agent-status').textContent));
    assert.equal(await page.locator('.agent-step.failed').count(), 1);

    // Phone width: no sideways scroll.
    await page.setViewportSize({ width: 360, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
    console.log('PASS: TERRA agent — photo prepared (re-encoded JPEG only), Pl@ntNet suggestions, species info from GBIF/iNat/Wikipedia, form filled and saved with taxon, provenance shown, edited names drop the ID, non-plant groups skipped, typed-name lookup, auto-identify preference, unconfigured server message, phone width, no outside network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
