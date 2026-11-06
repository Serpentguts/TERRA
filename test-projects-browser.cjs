// Run with Flask on :8080. Fresh isolated storage; no external/network APIs permitted.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const errors = [], unexpected = [];
    const origin = 'http://127.0.0.1:8080';
    await context.route('**/*', route => {
      const url = route.request().url();
      if (new URL(url).origin === origin) return route.continue();
      unexpected.push(url); return route.abort();
    });
    await context.exposeBinding('networkAttempt', (_source, api) => unexpected.push(api));
    await context.addInitScript(() => {
      for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[api] = function () { window.networkAttempt(api); throw Error('Network forbidden'); };
      navigator.sendBeacon = () => { window.networkAttempt('sendBeacon'); return false; };
      navigator.geolocation.getCurrentPosition = () => { throw Error('No GPS'); };
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const K = 'terra.projects.v1', J = 'terra.observations.v1';
    const raw = key => page.evaluate(key => localStorage.getItem(key), key);
    const projects = async () => JSON.parse(await raw(K)).projects;
    // IDs in this test are controlled; real IDs are always rendered as text/value properties.
    const choose = id => page.locator(`#project-candidates input[value="${id}"]`).check();
    const save = () => page.click('#project-save');
    const report = () => page.locator('#project-report').textContent();
    await page.goto(origin);
    assert.equal(await raw(K), null);
    assert.match(await page.locator('#project-candidate-message').textContent(), /No suitable observations/);
    await save(); assert.match(await page.locator('#project-error').textContent(), /Enter a title/); assert.equal(await raw(K), null);
    await page.fill('#project-title', 'Empty collection'); await save();
    assert.match(await report(), /0 included observations/); assert.match(await report(), /No included observations/);
    const emptyDownload = page.waitForEvent('download'); await page.click('#project-csv');
    assert.match(await fs.readFile(await (await emptyDownload).path(), 'utf8'), /"empty"/);
    const records = [
      { id: 'a', type: 'plant', name: 'Oak', date: '2024-02-29', notes: 'A', privacy: 'hidden' },
      { id: 'b', type: 'plant', name: 'Oak', date: '2024-02-29', notes: 'B', privacy: 'hidden' },
      { id: 'c', type: 'other', name: 'Unknown', date: '2025-01-01', notes: '=CMD()', privacy: 'exact', location: { version: 1, space: 'terra-local-grid-v1', kind: 'point', x: 50, y: 50 } },
      { id: 'd', type: 'fungus', name: '<img src=x onerror="window.injected=1">', date: '2025-01-01', notes: '<script>bad()</script>', privacy: 'approximate' }
    ];
    const journalBytes = JSON.stringify(records);
    await page.evaluate(({ J, journalBytes }) => localStorage.setItem(J, journalBytes), { J, journalBytes });
    await page.reload();
    await page.fill('#project-title', '=Field "day", test');
    await page.fill('#project-site', '<img src=x onerror="window.injected=1">');
    await page.fill('#project-species', 'Oak');
    await page.fill('#project-notes', 'Notes\nsecond line');
    for (const id of ['a', 'b', 'c', 'd']) await choose(id);
    assert.match(await report(), /^$/); // Unsaved selection is not a report.
    await save();
    const custom = (await projects()).at(-1);
    assert.deepEqual(custom.observationIds, ['a', 'b', 'c', 'd']);
    assert.equal(custom.site, '<img src=x onerror="window.injected=1">');
    assert.equal(custom.species, 'Oak');
    assert.match(await report(), /species\/name: Oak; site label: <img/);
    assert.equal(Object.hasOwn(custom, 'observations'), false);
    assert.match(await report(), /4 included observations · 2 unique taxa labels/);
    assert.equal(await page.locator('#project-report table').count(), 3);
    assert.equal(await page.locator('#projects img, #projects script').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await raw(J), journalBytes);
    const download = page.waitForEvent('download'); await page.click('#project-csv');
    const csv = await fs.readFile(await (await download).path(), 'utf8');
    assert.match(csv, /"'=Field ""day"", test"/); assert.match(csv, /"'=CMD\(\)"/);
    assert.match(csv, /<img src=x/); assert.match(csv, /"4","4","2","0"/);
    assert.match(csv, /species\/name: Oak; site label: <img/);
    // Membership edits and completion/reopening persist, without altering observations.
    await page.locator('#project-candidates input[value="b"]').uncheck(); await save();
    assert.match(await report(), /3 included observations/);
    await page.click('#project-toggle'); assert.equal(await page.locator('#project-title').isDisabled(), true);
    assert.equal(await page.locator('#project-save').isDisabled(), true);
    await page.reload(); await page.selectOption('#project-select', custom.id);
    assert.match(await report(), /Complete/); await page.click('#project-toggle'); await choose('b'); await save();
    assert.match(await report(), /4 included observations/);
    // Saving a new day scope removes nonmatching selection, explicitly disclosed in UI.
    await page.selectOption('#project-type', 'day');
    await page.fill('#project-date', '2025-02-29'); await save();
    assert.match(await page.locator('#project-error').textContent(), /valid optional/);
    await page.fill('#project-date', '2024-02-29');
    assert.equal(await page.locator('#project-candidates input').count(), 2);
    assert.match(await page.locator('#project-candidate-message').textContent(), /2 previously selected records outside/);
    await save(); assert.deepEqual((await projects()).at(-1).observationIds, ['a', 'b']);
    // Species grouping is exact and never auto-selects matching records.
    await page.selectOption('#project-select', ''); await page.fill('#project-title', 'Species collection');
    await page.selectOption('#project-type', 'species'); await save(); assert.equal(await page.locator('#project-error').isVisible(), true);
    await page.fill('#project-species', 'oak'); assert.equal(await page.locator('#project-candidates input').count(), 0);
    assert.match(await page.locator('#project-candidate-message').textContent(), /No records match/);
    await page.fill('#project-species', 'Oak'); assert.equal(await page.locator('#project-candidates input:checked').count(), 0);
    await choose('a'); await save(); const species = (await projects()).at(-1);
    // Site group requires a manual label, offers journal records, and never implies geographic matching.
    await page.selectOption('#project-select', ''); await page.fill('#project-title', 'Site collection'); await page.selectOption('#project-type', 'site'); await save();
    assert.equal(await page.locator('#project-error').isVisible(), true);
    await page.fill('#project-site', 'North garden');
    await page.evaluate(() => TerraMaps.project.select(0, 0, 100, 100));
    await choose('c'); await save();
    const site = (await projects()).at(-1); assert.match(await report(), /North garden/); assert.match(await report(), /1 included observations · 0 unique taxa labels/);
    assert.equal(await raw(J), journalBytes);
    // Completed projects remain live: deleted records become retained missing IDs, then reconnect on restore.
    await page.selectOption('#project-select', species.id); await page.click('#project-toggle');
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Delete observation: Oak', exact: true }).first().click();
    assert.match(await report(), /0 included observations/); assert.match(await report(), /Missing record IDs: a/);
    assert.deepEqual((await projects()).find(p => p.id === species.id).observationIds, ['a']);
    await page.locator('#trash-list').getByRole('button', { name: 'Restore observation' }).click();
    assert.match(await report(), /1 included observations/);
    // Project write failures preserve draft and both stores; retry succeeds.
    await page.selectOption('#project-select', site.id); await page.fill('#project-notes', 'Keep this draft');
    const beforeFailure = await raw(K), beforeJournal = await raw(J);
    for (const name of ['QuotaExceededError', 'SecurityError']) {
      await page.evaluate(name => { window.originalSet ||= Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('blocked', name); }; }, name);
      await save(); assert.equal(await raw(K), beforeFailure); assert.equal(await raw(J), beforeJournal);
      assert.equal(await page.locator('#project-notes').inputValue(), 'Keep this draft');
      assert.match(await page.locator('#project-error').textContent(), /could not be saved/);
    }
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSet; }); await save();
    // Another tab's changes refresh reports but never overwrite a draft or allow a stale write.
    const second = await context.newPage(); await second.goto(origin); await second.selectOption('#project-select', site.id);
    await page.fill('#project-notes', 'Unsaved first-tab draft');
    await second.fill('#project-notes', 'Other tab saved'); await second.click('#project-save');
    await page.waitForFunction(() => document.querySelector('#project-report').textContent.includes('Other tab saved'));
    assert.equal(await page.locator('#project-notes').inputValue(), 'Unsaved first-tab draft');
    const concurrentRaw = await raw(K); await save(); assert.equal(await raw(K), concurrentRaw);
    assert.match(await page.locator('#project-error').textContent(), /changed in another tab/);
    await page.click('#project-refresh'); assert.equal(await page.locator('#project-notes').inputValue(), 'Other tab saved');
    await second.close();
    // Populated responsive tables, keyboard checkbox interaction and accessible labels.
    await page.selectOption('#project-select', custom.id);
    const checkbox = page.locator('#project-candidates input').first(); await checkbox.focus(); await page.keyboard.press('Space'); assert.equal(await checkbox.isChecked(), false);
    assert.equal(await page.getByLabel('Project title', { exact: true }).count(), 1);
    assert.equal(await page.locator('#project-title').getAttribute('required'), '');
    assert.equal(await page.locator('#projects label').evaluateAll(labels => labels.some(label => /\(required/i.test(label.textContent))), false);
    assert.equal(await page.getByRole('group', { name: 'Site and species names', exact: true }).count(), 1);
    assert.equal(await page.locator('.project-site-species #project-site, .project-site-species #project-species').count(), 2);
    assert.equal(await page.locator('#project-site').inputValue(), custom.site);
    assert.equal(await page.locator('#project-species').inputValue(), custom.species);
    assert.equal(await page.locator('#project-status').getAttribute('role'), 'status');
    assert.equal(await page.locator('#project-error').getAttribute('role'), 'alert');
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `project overflow at ${width}`);
      const siteBox = await page.locator('#project-site').boundingBox();
      const speciesBox = await page.locator('#project-species').boundingBox();
      assert.equal(siteBox.x, speciesBox.x, `shared column at ${width}`);
      assert.equal(siteBox.width, speciesBox.width);
      assert.ok(speciesBox.y > siteBox.y, 'both values remain visible in one column');
    }
    // Malformed, duplicate and future versions are never overwritten; the journal remains usable.
    const good = await raw(K);
    for (const bad of ['{broken', JSON.stringify({ format: 'terra-projects', version: 2, projects: [] }), JSON.stringify({ format: 'terra-projects', version: 1, projects: [custom, custom] })]) {
      await page.evaluate(({ K, bad }) => localStorage.setItem(K, bad), { K, bad }); await page.reload();
      assert.equal(await page.locator('#project-save').isDisabled(), true); assert.equal(await page.locator('#project-csv').isDisabled(), true);
      assert.match(await page.locator('#project-error').textContent(), /cannot be read/); assert.equal(await raw(K), bad);
      assert.equal(await page.locator('#save-button').isEnabled(), true);
    }
    await page.evaluate(({ K, good }) => localStorage.setItem(K, good), { K, good });
    const goodJournal = await raw(J);
    await page.evaluate(J => localStorage.setItem(J, '{broken'), J); await page.reload();
    assert.equal(await page.locator('#project-save').isDisabled(), true); assert.equal(await raw(J), '{broken'); assert.equal(await raw(K), good);
    await page.evaluate(({ J, goodJournal }) => localStorage.setItem(J, goodJournal), { J, goodJournal });
    await page.addInitScript(() => { Storage.prototype.getItem = () => { throw Error('blocked'); }; }); await page.reload();
    assert.equal(await page.locator('#project-save').isDisabled(), true); assert.match(await page.locator('#project-error').textContent(), /cannot be read/);
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: project CRUD/membership, all grouping modes, deterministic traceable counts, unknown labels, missing/restored references, completion/reopen, CSV safety, no journal schema writes, quota/blocked/corrupt/future JSON, concurrent drafts, keyboard/labels, responsive tables, zero external/network APIs.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
