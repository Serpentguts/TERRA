const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const errors = [], outbound = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:8080') return route.continue();
      outbound.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(() => {
      for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[api] = () => { throw Error('No network'); };
      navigator.geolocation.getCurrentPosition = () => { throw Error('No GPS'); };
      navigator.geolocation.watchPosition = () => { throw Error('No background GPS'); };
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const J = 'terra.observations.v1', K = 'terra.projects.v1';
    const records = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)), J);
    const projects = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)).projects, K);
    async function map(id, values) {
      for (let i = 0; i < values.length; i++) await page.fill(`#${id}-${['x1','y1','x2','y2'][i]}`, String(values[i]));
      await page.locator(`#${id}`).getByRole('button', { name: 'Apply map selection' }).click();
    }
    async function save(name, privacy, values, date = '2024-02-29') {
      await page.fill('#name', name); await page.fill('#date', date);
      await page.selectOption('#privacy', privacy); await map('observation-map', values);
      await page.click('#save-button'); assert.equal(await page.locator('#form-error').isVisible(), false);
    }
    await page.goto('http://127.0.0.1:8080');
    assert.equal(await page.locator('#discover-title').count(), 0);
    await page.selectOption('#discovery-context', 'natural');
    assert.equal(await page.locator('#discovery-setting').isVisible(), false);
    await page.fill('#name', 'Needs location'); await page.click('#save-button');
    assert.match(await page.locator('#form-error').textContent(), /location selection is required/); assert.equal(await records(), null);
    await page.fill('#date', '9999-12-31');
    assert.equal(await page.locator('#date').evaluate(el => el.checkValidity()), false);
    await page.evaluate(() => document.querySelector('#observation-form').dispatchEvent(new Event('submit', { cancelable: true })));
    assert.equal(await records(), null);
    await page.fill('#date-picker', '9999-12-31');
    assert.equal(await page.locator('#date-picker').inputValue(), '', 'Future calendar value is rejected on synchronization');
    assert.equal(await page.locator('#date').evaluate(el => el.checkValidity()), false);
    assert.equal(await page.locator('#date-picker').getAttribute('max'), await page.locator('#identify-date').getAttribute('max'));
    // Forged photo handoff cannot inject a future date or replace the current draft.
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('terra:prefill-discovery', { detail: { name: 'Future handoff', type: 'plant', date: '9999-12-31', files: [new File(['x'], 'x.png', { type: 'image/png' })] } })));
    assert.equal(await page.locator('#name').inputValue(), 'Needs location');
    await page.selectOption('#identify-group', 'plant');
    await page.setInputFiles('#identify-files', { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
    await page.locator('#identify-previews select').selectOption('Leaf');
    await page.fill('#identify-date', '9999-12-31');
    await page.getByRole('button', { name: /Analyze — show MOCK/ }).click();
    assert.match(await page.locator('#identify-error').textContent(), /today or earlier/);
    assert.equal(await page.locator('#identify-output').isVisible(), false);
    await page.click('#identify-reset');
    await save('Oak', 'exact', [50, 50]);
    assert.deepEqual((await records())[0].location, { version: 1, space: 'terra-local-grid-v1', kind: 'point', x: 50, y: 50 });
    assert.equal(await page.locator('#location-project-site').isDisabled(), false, 'Form reset restores Hidden site-selection controls');
    await save('Birch', 'approximate', [43, 42, 49, 49], '2024-03-01');
    const approx = (await records())[0]; assert.deepEqual(approx.location, { version: 1, space: 'terra-local-grid-v1', kind: 'region', x1: 40, y1: 40, x2: 60, y2: 60 });
    await save('Private', 'hidden', [41, 42, 48, 49], '2024-03-02');
    assert.deepEqual((await records())[0].location, { version: 1, space: 'terra-local-grid-v1', kind: 'withheld' });
    // Switching tiers clears the previous precise selection, including pending UI values.
    await page.selectOption('#privacy', 'exact'); await map('observation-map', [12, 34]);
    await page.selectOption('#privacy', 'approximate');
    assert.equal(await page.locator('#observation-map-x1').inputValue(), '');
    await page.fill('#name', 'Do not save old pin'); await page.click('#save-button');
    assert.equal((await records()).length, 3);
    await map('observation-map', [20, 20, 80, 80]);
    await page.fill('#observation-map-x1', '33'); await page.click('#save-button');
    assert.equal((await records()).length, 3, 'Unapplied edits invalidate an older selection');
    const journalBytes = JSON.stringify(await records());
    await page.fill('#project-title', 'Timeframe'); await page.selectOption('#project-type', 'day');
    await page.fill('#project-date', '2024-02-29'); await page.fill('#project-endDate', '2024-03-01');
    assert.equal(await page.locator('#project-candidates input').count(), 2);
    assert.deepEqual(await page.locator('#project-group-choice option').allTextContents(), ['All dates in timeframe', '2024-02-29', '2024-03-01', 'Other / enter another day in timeframe']);
    await page.selectOption('#project-group-choice', '2024-03-01'); assert.equal(await page.locator('#project-candidates input').count(), 1);
    await page.selectOption('#project-group-choice', '__other');
    await page.click('#project-save'); assert.match(await page.locator('#project-error').textContent(), /Enter the Other day/);
    await page.fill('#project-other-day', '2024-03-02'); await page.click('#project-save');
    assert.match(await page.locator('#project-error').textContent(), /Enter a title/);
    await page.fill('#project-other-day', '2024-02-29');
    assert.equal(await page.locator('#project-candidates input').count(), 1);
    await page.selectOption('#project-group-choice', '');
    for (const checkbox of await page.locator('#project-candidates input').all()) await checkbox.check();
    await page.click('#project-save'); assert.equal((await projects())[0].observationIds.length, 2);
    assert.equal(JSON.stringify(await records()), journalBytes);
    await page.selectOption('#project-select', ''); await page.selectOption('#project-type', 'species');
    assert.ok((await page.locator('#project-group-choice option').allTextContents()).includes('Oak'));
    await page.selectOption('#project-group-choice', 'Oak'); assert.equal(await page.locator('#project-candidates input').count(), 1);
    await page.selectOption('#project-group-choice', ''); await page.fill('#project-species', '<img src=x onerror=bad()>');
    await page.fill('#project-title', 'Manual species'); await page.click('#project-save');
    assert.equal((await projects())[1].species, '<img src=x onerror=bad()>'); assert.equal(await page.locator('#projects img').count(), 0);
    await page.selectOption('#project-select', ''); await page.fill('#project-title', 'Manual day');
    await page.selectOption('#project-type', 'day'); await page.fill('#project-date', '2024-02-28'); await page.fill('#project-endDate', '2024-03-01');
    await page.selectOption('#project-group-choice', '__other'); await page.fill('#project-other-day', '2024-02-28'); await page.click('#project-save');
    const manualDay = (await projects()).at(-1); assert.equal(manualDay.groupValue, '2024-02-28');
    await page.reload(); await page.selectOption('#project-select', manualDay.id);
    assert.equal(await page.locator('#project-group-choice').inputValue(), '__other');
    assert.equal(await page.locator('#project-other-day').inputValue(), '2024-02-28');
    assert.equal(await page.locator('#project-candidates input').count(), 0);
    // New boundary site rejects unknown/hidden records; saves and edits never rewrite journal.
    await page.selectOption('#project-select', ''); await page.fill('#project-title', 'Site'); await page.selectOption('#project-type', 'site'); await page.fill('#project-site', 'Demo site');
    await page.click('#project-save'); assert.match(await page.locator('#project-error').textContent(), /Draw a site boundary/);
    await map('project-map', [20, 20, 80, 80]);
    assert.equal(await page.locator('#project-candidates input').count(), 2);
    for (const checkbox of await page.locator('#project-candidates input').all()) await checkbox.check();
    await page.click('#project-save'); const site = (await projects()).at(-1); assert.equal(site.observationIds.length, 2);
    // Approximate can reuse a site; no exact clicked point is retained.
    await page.selectOption('#privacy', 'approximate'); await page.selectOption('#location-project-site', site.id);
    assert.match(await page.locator('#observation-map').textContent(), /Local region: 20–80/);
    // Outside addition through discovery action must fail without deleting/duplicating a record.
    await save('Outside', 'exact', [95, 95]);
    await page.selectOption('#discovery-project', site.id); await page.click('#add-project-button');
    assert.match(await page.locator('#form-error').textContent(), /outside its boundary/);
    const beforeEdit = JSON.stringify(await records());
    await map('project-map', [20, 20, 55, 55]);
    assert.match(await page.locator('#project-candidate-message').textContent(), /previously selected records outside this scope/);
    await page.click('#project-save'); assert.equal((await projects()).at(-1).observationIds.length, 1);
    assert.match(await page.locator('#project-status').textContent(), /Removed 1.*NOT deleted/);
    assert.equal(JSON.stringify(await records()), beforeEdit);
    // Delete/restore is atomic in journal; project references reconnect and summaries update.
    const oak = (await records()).find(r => r.name === 'Oak');
    const beforeDelete = JSON.stringify(await records());
    await page.evaluate(J => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === J) throw Error('Quota'); return window.originalSetItem.call(this, k, v); }; }, J);
    page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Delete observation: Oak', exact: true }).click();
    assert.equal(JSON.stringify(await records()), beforeDelete, 'Failed Trash write cannot erase record');
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
    page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Delete observation: Oak', exact: true }).click();
    assert.ok((await records()).find(r => r.id === oak.id).deletedAt);
    assert.equal(await page.locator('#observation-list .observation-card').count(), 3);
    assert.match(await page.locator('#project-report').textContent(), /0 included observations/);
    assert.match(await page.locator('#trash-list').textContent(), /Recover until/);
    const trashDownload = page.waitForEvent('download'); await page.click('#export-button');
    const trashJSON = JSON.parse(await require('node:fs/promises').readFile(await (await trashDownload).path(), 'utf8'));
    assert.ok(trashJSON.observations.find(r => r.id === oak.id).deletedAt, 'Backup preserves deletion time, not resurrection');
    assert.deepEqual(trashJSON.observations.find(r => r.id === oak.id).location, oak.location);
    await page.reload();
    const beforeRestore = JSON.stringify(await records());
    await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw Error('Quota'); }; });
    await page.locator('#trash-list').getByRole('button', { name: 'Restore observation' }).click();
    assert.equal(JSON.stringify(await records()), beforeRestore, 'Failed restore preserves Trash for retry');
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
    await page.locator('#trash-list').getByRole('button', { name: 'Restore observation' }).click();
    assert.equal((await records()).find(r => r.id === oak.id).deletedAt, undefined);
    assert.match(await page.locator('#project-report').textContent(), /^$/); // project selection is not persisted
    // Isolated clock simulation: expiry blocks restore, not a silent hard delete on read.
    await page.evaluate(({ J, id }) => { const a = JSON.parse(localStorage.getItem(J)); a.find(r => r.id === id).deletedAt = new Date(Date.now() - 72 * 3600 * 1000).toISOString(); localStorage.setItem(J, JSON.stringify(a)); }, { J, id: oak.id });
    await page.reload(); assert.equal(await page.locator('#trash-list button').isDisabled(), true);
    assert.equal((await records()).length, 4);
    await save('Triggers local retention', 'hidden', [0, 0, 100, 100]);
    assert.equal((await records()).some(r => r.id === oak.id), false);
    // Backup preserves optional fields, rejects privacy leaks/future dates, reads legacy records unchanged.
    const download = page.waitForEvent('download'); await page.click('#export-button');
    const fs = require('node:fs/promises'); const exported = JSON.parse(await fs.readFile(await (await download).path(), 'utf8'));
    assert.equal(exported.version, 1); assert.deepEqual(exported.observations, await records());
    const bad = { ...exported, observations: [{ ...exported.observations[0], id: 'bad', date: '9999-12-31' }] };
    await page.setInputFiles('#import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
    await page.waitForFunction(() => !document.querySelector('#import-error').hidden); assert.match(await page.locator('#import-error').textContent(), /invalid/);
    const leak = { ...exported, observations: [{ ...exported.observations[0], id: 'leak', privacy: 'approximate', location: { version: 1, space: 'terra-local-grid-v1', kind: 'point', x: 13, y: 17 } }] };
    await page.setInputFiles('#import-file', { name: 'leak.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(leak)) });
    await page.waitForFunction(() => !document.querySelector('#import-error').hidden);
    assert.match(await page.locator('#import-error').textContent(), /privacy tier/);
    assert.equal((await records()).some(r => r.id === 'leak'), false);
    for (const width of [320, 390, 768, 1280]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
    console.log('PASS: future dates/handoff, required local map and privacy ceiling, trash restore/72h expiry, range/day/species choices, boundaries/add/edit validation, journal retention, optional backup fields, mobile and zero network.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
