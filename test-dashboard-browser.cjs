// Run with Flask on :8080. Dashboard (citizen/professional, remembered), Home's professional
// data-quality card, export from the dashboard, and the résumé (preview, print mode, text download).
require('./test-screens.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

(async () => {
  const browser = await chromium.launch();
  try {
    const origin = 'http://127.0.0.1:8080', errors = [], outbound = [];
    const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, acceptDownloads: true });
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : (outbound.push(route.request().url()), route.abort()));
    await context.addInitScript(() => {
      for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[api] = () => { throw Error('No network'); };
      window.__printed = 0; window.print = () => { window.__printed++; window.__printClass = document.body.classList.contains('print-resume'); };
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(2024, 2, 13, 12, 0, 0) });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const geo = { version: 1, space: 'terra-geo-v1', kind: 'point', x: -122.41, y: 37.77 };
    const records = [
      { id: 'a', type: 'plant', name: 'Western sword fern', notes: 'Twenty fronds under alders in deep shade beside the creek with moss covering the rocks nearby.', date: '2024-03-12', privacy: 'exact', location: geo, taxon: { scientificName: 'Polystichum munitum', source: 'plantnet', score: 0.8 } },
      { id: 'b', type: 'fungus', name: 'Turkey tail', notes: 'Private: behind 12 Elm St', date: '2024-03-11', privacy: 'hidden', location: { version: 1, space: 'terra-geo-v1', kind: 'withheld' } },
      { id: 'c', type: 'bird', name: 'Robin', notes: '', date: '2024-02-02', privacy: 'hidden' }
    ];
    await page.goto(origin + '/#home');
    await page.evaluate(r => {
      localStorage.setItem('terra.observations.v1', JSON.stringify(r));
      localStorage.setItem('terra.projects.v1', JSON.stringify({ format: 'terra-projects', version: 1, projects: [{ id: 'p1', title: 'Creek survey', type: 'custom', date: '2024-03-01', endDate: '2024-03-31', site: '', species: '', notes: '', complete: true, observationIds: ['a', 'b', 'gone'] }] }));
      localStorage.setItem('terra.profile.v1', JSON.stringify({ version: 1, name: 'Ada Field', bio: 'Weekend naturalist and volunteer.', credentials: 'BSc Ecology', avatar: 'fern' }));
    }, records);
    await page.reload();
    assert.equal(await page.locator('#home-quests').isVisible(), true);
    assert.equal(await page.locator('#home-quality').isVisible(), false, 'citizen view by default');

    // Citizen dashboard.
    await page.goto(origin + '/#profile');
    await page.click('#dashboard-tab');
    assert.equal(await page.locator('[data-dashboard-mode="citizen"]').getAttribute('aria-pressed'), 'true');
    const citizen = await page.locator('#dashboard-view').textContent();
    assert.match(citizen, /Level.*Field XP.*Streak.*Species3/);
    assert.match(citizen, /What you've observed.*Plants1.*Fungi1.*Birds1/);
    assert.equal(await page.locator('.dash-month').count(), 12);
    assert.match(await page.locator('.dash-month').last().getAttribute('title'), /Mar 2024: 2/);
    assert.match(await page.locator('.dash-months table').textContent(), /2024-03.*2/, 'table view for screen readers');
    assert.match(citizen, /Most observed.*Western sword fern Polystichum munitum × 1/);

    // Professional dashboard: remembered, readiness checks, projects, export.
    await page.click('[data-dashboard-mode="professional"]');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('terra.workspace.v1')).mode), 'professional');
    const pro = await page.locator('#dashboard-view').textContent();
    assert.match(pro, /Records3.*2024-02-02 → 2024-03-12.*Scientific names33%.*Map locations33%.*Exact 1 · Approx 0 · Hidden 2/);
    assert.deepEqual(await page.locator('.dash-checks li').evaluateAll(l => l.map(x => x.className)), ['ok', 'todo', 'todo', 'todo', 'todo']);
    assert.match(await page.locator('.dash-projects').textContent(), /Creek survey.*Complete.*2024-03-01 → 2024-03-31.*2.*1.*50%.*50%/);
    await page.click('#dash-export');
    assert.equal(await page.locator('#sheet-export').isVisible(), true, 'export dialog opens from the dashboard');
    await page.keyboard.press('Escape');
    await page.reload();
    await page.click('#dashboard-tab');
    assert.equal(await page.locator('[data-dashboard-mode="professional"]').getAttribute('aria-pressed'), 'true', 'remembered');
    await page.goto(origin + '/#home');
    assert.equal(await page.locator('#home-quests').isVisible(), false, 'professional Home swaps quests…');
    assert.match(await page.locator('#home-quality').textContent(), /Data quality.*33% scientific names · 33% located · 1\/5 readiness checks/, '…for data quality');

    // Résumé.
    await page.goto(origin + '/#profile');
    await page.click('#resume-tab');
    const sheet = await page.locator('#resume-sheet').textContent();
    assert.match(sheet, /Ada Field.*field naturalist · Level.*Credentials \(self-described\): BSc Ecology.*Weekend naturalist/);
    assert.match(sheet, /Observations3.*Species3.*Field days3/);
    assert.match(sheet, /Creek survey \(2024-03-01 – 2024-03-31\): 2 records/);
    assert.match(sheet, /not yet community- or expert-verified\. Locations are not included\./);
    assert.doesNotMatch(sheet, /Elm St|alders|-122|37\.77/, 'no notes or coordinates');
    assert.equal(await page.locator('#resume-sheet .resume-avatar svg').count(), 1);
    await page.click('#resume-print');
    assert.deepEqual(await page.evaluate(() => [window.__printed, window.__printClass]), [1, true], 'prints with résumé-only print styles');
    const wait = page.waitForEvent('download');
    await page.click('#resume-download');
    const file = await wait;
    assert.equal(file.suggestedFilename(), 'terra-resume-2024-03-13.txt');
    const text = await fs.readFile(await file.path(), 'utf8');
    assert.match(text, /^Ada Field\n.*\n/);
    assert.match(text, /FIELD RECORD\n- Observations: 3/);
    assert.doesNotMatch(text, /Elm St|alders/);

    // Phone width: dashboard and résumé fit.
    await page.setViewportSize({ width: 360, height: 800 });
    for (const tab of ['#dashboard-tab', '#resume-tab']) {
      await page.click(tab);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tab);
    }

    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
    console.log('PASS: citizen dashboard (tiles, group bars, 12-month chart with table, favourites), professional dashboard (quality, readiness, projects, export) remembered, professional Home data-quality card, résumé preview without notes/locations, print mode, text download, phone width, no network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
