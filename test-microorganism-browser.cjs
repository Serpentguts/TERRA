// Run with Flask on :8080. "What did you find?" offers Microorganism; saving one shows it in the
// Journal, the jar (microbe colony), the field guide's Tiny world set and exports.
require('./test-screens.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const origin = 'http://127.0.0.1:8080', errors = [], outbound = [];
    const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : (outbound.push(route.request().url()), route.abort()));
    await context.addInitScript(() => { for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[api] = () => { throw Error('No network'); }; });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(origin + '/#record');
    assert.deepEqual(await page.locator('#organism-options option').evaluateAll(o => o.map(x => x.value)),
      ['Plant', 'Mushroom', 'Reptile', 'Insect', 'Fish', 'Microorganism', 'Mammal', 'Bird', 'Other']);
    await page.fill('#organism-choice', 'microorganism');
    assert.equal(await page.evaluate(() => document.getElementById('organism-choice').validity.valid), true, 'accepted case-insensitively');
    await page.fill('#name', 'Pond diatoms');
    await page.selectOption('#privacy', 'hidden');
    await page.evaluate(() => { if (!TerraMaps.observation.read()) TerraMaps.observation.select(20, 20, 80, 80); });
    await page.click('#save-button');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('terra.observations.v1') || '[]').length === 1);
    const [saved] = await page.evaluate(() => JSON.parse(localStorage.getItem('terra.observations.v1')));
    assert.equal(saved.type, 'microorganism');

    await page.goto(origin + '/#journal');
    assert.match(await page.locator('.category').first().textContent(), /Microorganism/);
    await page.goto(origin + '/#terrarium');
    const d = await page.evaluate(() => TerraTerrarium.debug());
    assert.deepEqual(d.residents.filter(r => r.id.startsWith('s:')).map(r => r.kind), ['microbe']);
    assert.match(await page.locator('.dex-set[data-set="tiny"]').textContent(), /Tiny world1\/4.*Pond diatoms/);
    await page.goto(origin + '/#home');
    assert.match(await page.locator('#home-recent').textContent(), /Pond diatoms/);

    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
    console.log('PASS: Microorganism in "What did you find?" (order as requested), saved, shown in Journal, Home, jar (microbe colony) and the Tiny world field-guide set, no network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
