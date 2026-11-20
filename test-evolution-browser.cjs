// Run with Flask on :8080. Evolution in the jar and the field guide: species residents and
// stages, evolution toast and sparkle, field-guide cards and sets, set reward decoration
// (draggable, saved), queued toasts, sandbox samples, phone width. Fixed clock, no network.
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
    await page.clock.install({ time: new Date(2024, 2, 13, 12, 0, 0) });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const rec = (id, date, name, type = 'other') => ({ id, type, name, notes: '', date, privacy: 'hidden' });
    const journal = list => page.evaluate(l => localStorage.setItem('terra.observations.v1', JSON.stringify(l)), list);
    const debug = () => page.evaluate(() => TerraTerrarium.debug());
    const base = [rec('f1', '2024-03-01', 'Pacific tree frog'), rec('b1', '2024-03-02', 'Bumble bee', 'insect'), rec('m1', '2024-03-03', 'Monarch', 'insect'), rec('p1', '2024-03-04', 'Poppy', 'plant')];

    await page.goto(origin + '/#home');
    await journal(base);
    await page.goto(origin + '/#terrarium');
    let d = await debug();
    const ids = d.residents.filter(r => r.id.startsWith('s:')).map(r => r.id).sort();
    assert.deepEqual(ids, ['s:bumble-bee', 's:monarch', 's:pacific-tree-frog', 's:poppy']);
    // Field guide: cards, sets, a completed set's reward in the jar.
    assert.match(await page.locator('#dex-summary').textContent(), /4 species · 1 of 9 sets complete/);
    assert.equal(await page.locator('.dex-card').count(), 4);
    assert.match(await page.locator('.dex-card[data-species="s:pacific-tree-frog"]').textContent(), /Pacific tree frog.*Tadpole · seen 1× · 2 to evolve/);
    assert.equal(await page.locator('.dex-set.complete[data-set="pollinators"]').count(), 1);
    assert.match(await page.locator('.dex-set[data-set="pond"]').textContent(), /Pond life1\/4.*Pacific tree frog.*\?\?\?/);
    assert.match(await page.locator('.dex-set[data-set="pond"] .dex-slot:not(.found)').first().getAttribute('aria-label'), /Not found yet\. Hint: Something that swims/);
    assert.ok(Object.keys(d.decor).includes('d:pollinators'), 'honey pot reward placed in the jar');
    assert.deepEqual(Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem('terra.dex.v1')).sets)), ['pollinators']);

    // Clicking a card selects the resident and shows its stage on the guide card.
    await page.click('.dex-card[data-species="s:pacific-tree-frog"]');
    assert.match(await page.locator('#terrarium-guide').textContent(), /Pacific tree frog.*Stage 1: Tadpole.*Seen 1 time.*2 more sightings to evolve/);

    // Two more frog sightings: it evolves (toast + sparkle), and the celebration happens once.
    await journal([...base, rec('f2', '2024-03-10', 'Pacific tree frog'), rec('f3', '2024-03-11', 'Pacific tree frog')]);
    await page.reload();
    const toasts = [await page.locator('#toast').textContent()];
    for (let i = 0; i < 4 && !toasts.some(t => /evolved/.test(t)); i++) { await page.clock.runFor(5600); toasts.push(await page.locator('#toast').textContent()); }
    assert.ok(toasts.some(t => /✨ Your Pacific tree frog evolved into a Froglet!/.test(t)), toasts.join(' | '));
    d = await debug();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('terra.dex.v1')).stages['pacific tree frog']), 1);
    assert.match(await page.locator('.dex-card[data-species="s:pacific-tree-frog"]').textContent(), /Froglet · seen 3× · 2 to evolve/);
    await page.reload();
    assert.doesNotMatch(await page.locator('#toast').textContent(), /evolved/, 'not celebrated twice');

    // Set reward decoration can be dragged; its spot is saved.
    await page.evaluate(() => TerraTerrarium.select('d:pollinators'));
    assert.match(await page.locator('#terrarium-guide').textContent(), /Honey pot.*Set reward.*completing “Pollinators”/);
    await page.locator('#terrarium-canvas').focus(); await page.keyboard.press('ArrowRight');
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('terra.dex.v1')).spots.pollinators), 'reward position saved');

    // Fully evolved (5 sightings) gets a gold card.
    await journal([...base, ...[2, 3, 4, 5].map(i => rec(`f${i}`, `2024-03-0${i + 4}`, 'Pacific tree frog'))]);
    await page.reload();
    assert.match(await page.locator('.dex-card.stage-2[data-species="s:pacific-tree-frog"]').textContent(), /Frog · seen 5× · fully evolved ★/);

    // Sandbox: sample residents at every stage; nothing saved to the field guide.
    const saved = await page.evaluate(() => localStorage.getItem('terra.dex.v1'));
    await page.click('#terrarium-sandbox');
    d = await debug();
    assert.ok(d.residents.filter(r => r.id.startsWith('s:sample-')).length >= 15);
    assert.equal(await page.evaluate(() => localStorage.getItem('terra.dex.v1')), saved);
    await page.click('#terrarium-sandbox');

    await page.setViewportSize({ width: 360, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
    console.log('PASS: one resident per species, field-guide cards and sets with ??? hints, set reward placed and draggable, evolution toast once, stage shown on card and guide, gold fully-evolved card, sandbox samples without saving, phone width, no network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
