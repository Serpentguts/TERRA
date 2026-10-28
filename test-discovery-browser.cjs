// Flask on :8080; isolated Chromium profile; all application network APIs forbidden.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const origin = 'http://127.0.0.1:8080', errors = [], network = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      network.push(route.request().url()); return route.abort();
    });
    await context.exposeBinding('networkAttempt', (_source, api) => network.push(api));
    await context.addInitScript(() => {
      for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[api] = function () { window.networkAttempt(api); throw Error('No network'); };
      navigator.sendBeacon = () => { window.networkAttempt('beacon'); return false; };
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const J = 'terra.observations.v1', K = 'terra.projects.v1';
    const raw = key => page.evaluate(key => localStorage.getItem(key), key);
    const records = async () => JSON.parse(await raw(J));
    const projects = async () => JSON.parse(await raw(K)).projects;
    const select = id => page.selectOption('#discovery-project', id);
    const add = () => page.click('#add-project-button');
    await page.goto(origin);
    assert.equal(await page.locator('#add-project-button').isDisabled(), true);
    assert.match(await page.locator('#add-project-state').textContent(), /No projects yet/);
    await page.fill('#project-title', 'Created through existing Projects UI'); await page.click('#project-save');
    assert.equal(await page.locator('#add-project-button').isEnabled(), true);
    const customId = (await projects())[0].id;
    const base = (await projects())[0];
    const extra = [
      { ...base, id: 'day', title: 'Leap day', type: 'day', date: '2024-02-29' },
      { ...base, id: 'species', title: 'Exact Oak', type: 'species', species: 'Oak' },
      { ...base, id: 'site', title: 'Manual site', type: 'site', site: 'North garden' },
      { ...base, id: 'done', title: 'Completed', complete: true }
    ];
    await page.evaluate(({ K, extra }) => { const data = JSON.parse(localStorage.getItem(K)); data.projects.push(...extra); localStorage.setItem(K, JSON.stringify(data)); }, { K, extra });
    await page.reload();
    // Missing target and mismatched scope must not create a journal entry.
    await page.fill('#name', 'Oak'); await page.fill('#date', '2024-03-01');
    await add(); assert.match(await page.locator('#form-error').textContent(), /Choose an existing/); assert.equal(await raw(J), null);
    await select('day'); await add(); assert.match(await page.locator('#form-error').textContent(), /scope/); assert.equal(await raw(J), null);
    await select('species'); await page.fill('#name', 'oak'); await add(); assert.equal(await raw(J), null);
    await page.fill('#name', 'Oak'); await page.fill('#date', '2024-02-29');
    await select('day'); await add();
    assert.equal((await records()).length, 1); const first = (await records())[0];
    assert.deepEqual((await projects()).find(p => p.id === 'day').observationIds, [first.id]);
    assert.equal(await page.locator('#project-observation').inputValue(), first.id);
    await add(); await add(); assert.equal((await records()).length, 1);
    assert.deepEqual((await projects()).find(p => p.id === 'day').observationIds, [first.id]);
    // Reuse one saved record across projects, preserving a new, unsaved form draft.
    await page.fill('#name', 'Unsaved other draft'); await select('species'); await add();
    assert.equal(await page.locator('#name').inputValue(), 'Unsaved other draft');
    await select('site'); await add(); await select(customId); await add();
    assert.equal((await records()).length, 1);
    assert.equal(await page.locator('#discovery-project option[value="done"]').isDisabled(), true);
    // Ordinary Save then Add also reuses the saved ID; no duplicate journal records.
    await page.fill('#name', 'Birch'); await page.click('#save-button');
    const second = (await records())[0]; await add();
    assert.equal((await records()).length, 2);
    assert.deepEqual((await projects()).find(p => p.id === customId).observationIds, [first.id, second.id]);
    // Failed journal write: no project write; preserve form. Retry succeeds exactly once.
    await page.selectOption('#project-observation', ''); await page.fill('#name', 'Quota draft');
    const beforeJ = await raw(J), beforeK = await raw(K);
    await page.evaluate(J => { window.originalSet = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === J) throw Error('Journal quota'); return window.originalSet.call(this, key, value); }; }, J);
    await add(); assert.equal(await raw(J), beforeJ); assert.equal(await raw(K), beforeK);
    assert.equal(await page.locator('#name').inputValue(), 'Quota draft');
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSet; }); await add();
    assert.equal((await records()).length, 3);
    // Two-key partial failure is explicit and retry-safe, never silently rolled back.
    await page.selectOption('#project-observation', ''); await page.fill('#name', 'Partial project failure');
    await page.evaluate(K => { Storage.prototype.setItem = function (key, value) { if (key === K) throw Error('Project quota'); return window.originalSet.call(this, key, value); }; }, K);
    const partialK = await raw(K); await add();
    assert.equal((await records()).length, 4); assert.equal(await raw(K), partialK);
    assert.match(await page.locator('#form-error').textContent(), /Observation saved.*project add failed/);
    assert.equal(await page.locator('#name').inputValue(), 'Partial project failure');
    const partialId = (await records())[0].id;
    await add(); assert.equal((await records()).length, 4);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSet; }); await add();
    assert.equal((await records()).length, 4);
    assert.equal((await projects()).find(p => p.id === customId).observationIds.filter(id => id === partialId).length, 1);
    // Existing project draft is never overwritten by this second UI; stale save fails closed.
    await page.selectOption('#project-select', customId); await page.fill('#project-notes', 'Unsaved project notes');
    await page.selectOption('#project-observation', second.id); await select('site'); await add();
    assert.equal(await page.locator('#project-notes').inputValue(), 'Unsaved project notes');
    await page.click('#project-save'); assert.match(await page.locator('#project-error').textContent(), /changed in another tab/);
    await page.click('#project-refresh');
    // Fresh project reads honor another tab's completed state and malformed data.
    const tab = await context.newPage(); await tab.goto(origin);
    await tab.selectOption('#project-select', 'site'); await tab.click('#project-toggle');
    await page.waitForFunction(() => document.querySelector('#discovery-project option[value="site"]').disabled);
    const lockedJ = await raw(J), lockedK = await raw(K); await add();
    assert.match(await page.locator('#form-error').textContent(), /complete/);
    assert.equal(await raw(J), lockedJ); assert.equal(await raw(K), lockedK);
    await tab.close();
    // Exact labels, no assignable/automatic statuses or fake validation.
    const definitions = await page.locator('#identification-plan').textContent();
    for (const label of ['AI-suggested', 'community-identified', 'expert-confirmed']) assert.ok(definitions.includes(label));
    assert.equal(await page.locator('#identification-plan select, #identification-plan input').count(), 0);
    assert.equal(await page.locator('#observation-list a[href="#identification-plan"]').count(), 4);
    assert.match(await page.locator('#observation-list').textContent(), /not recorded/);
    // Genetic paths produce plans, never results, persistence or outbound calls.
    const journalBeforeDNA = await raw(J), projectsBeforeDNA = await raw(K);
    await page.click('#bold-preview'); assert.match(await page.locator('#genetic-error').textContent(), /Enter a taxon/);
    await page.fill('#genetic-query', '<img src=x onerror="window.injected=1">');
    await page.fill('#genetic-sequence', '>private header\nACGTNN');
    await page.click('#bold-preview'); assert.match(await page.locator('#genetic-preview').textContent(), /BOLD — UNCONNECTED.*6 bases, 2 ambiguous/);
    assert.equal(await page.locator('#genetic-preview img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await page.click('#genbank-preview'); assert.match(await page.locator('#genetic-preview').textContent(), /GenBank — UNCONNECTED.*NOT GenBank submission/);
    for (const bad of ['ACGU', '>one\nAC\n>two\nGT', '>header', 'AC-GT']) {
      await page.fill('#genetic-sequence', bad); assert.equal(await page.locator('#genetic-preview').textContent(), '');
      await page.click('#genbank-preview'); assert.equal(await page.locator('#genetic-error').isVisible(), true);
    }
    await page.fill('#genetic-sequence', 'ACGTRYSWKMBDHVN'); await page.click('#genbank-preview');
    assert.equal(await raw(J), journalBeforeDNA); assert.equal(await raw(K), projectsBeforeDNA);
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).sort()), [J, K].sort());
    const download = page.waitForEvent('download'); await page.click('#export-button');
    const exported = JSON.parse(await fs.readFile(await (await download).path(), 'utf8'));
    assert.equal(exported.version, 1);
    for (const record of exported.observations) assert.deepEqual(Object.keys(record).sort(), ['id', 'type', 'name', 'notes', 'date', 'privacy'].sort());
    await page.click('#genetic-clear'); assert.equal(await page.locator('#genetic-sequence').inputValue(), ''); assert.equal(await page.locator('#genetic-query').inputValue(), '');
    await page.fill('#genetic-sequence', 'ACGT'); await page.reload(); assert.equal(await page.locator('#genetic-sequence').inputValue(), '');
    await select(customId); assert.equal((await records()).length, 4);
    // Journal export/import is unchanged: duplicates skip; no metadata enters version 1.
    await page.setInputFiles('#import-file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.waitForSelector('#import-preview:visible'); assert.match(await page.locator('#import-summary').textContent(), /0 to add; 4 duplicate/);
    await page.click('#cancel-import');
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
    }
    await page.getByLabel('TERRA project', { exact: true }).focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'add-project-button');
    // New organism categories use the same local add/idempotency path as legacy records.
    const beforeCategories = (await records()).length;
    for (const [index, type] of ['plant', 'fungus', 'insect', 'mammal', 'bird', 'fish', 'reptile'].entries()) {
      await page.selectOption('#project-observation', '');
      await page.check(`#observation-form input[name="type"][value="${type}"]`);
      await page.fill('#name', `Local ${type} discovery`); await select(customId); await add();
      const record = (await records())[0];
      assert.equal(record.type, type);
      await add();
      assert.equal((await records()).length, beforeCategories + index + 1);
      assert.equal((await projects()).find(p => p.id === customId).observationIds.filter(id => id === record.id).length, 1);
    }
    // Integration: photo review targets a new draft, preserving every organism category.
    const photo = { name: 'local.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=', 'base64') };
    const transfer = async () => {
      const dialogPromise = page.waitForEvent('dialog');
      const click = page.click('#identify-record');
      await (await dialogPromise).accept(); await click;
      await page.waitForFunction(() => [...document.querySelectorAll('#discovery-previews img')].every(img => img.complete && img.naturalWidth));
    };
    const beforePhotos = (await records()).length;
    for (const [index, type] of ['plant', 'fungus', 'insect', 'mammal', 'bird', 'fish', 'reptile', 'unsure'].entries()) {
      const previousId = (await records())[0].id;
      await page.selectOption('#project-observation', previousId);
      await page.click('#identify-reset'); await page.selectOption('#identify-group', type);
      await page.setInputFiles('#identify-files', photo);
      await page.waitForFunction(() => [...document.querySelectorAll('#identify-previews img')].every(img => img.complete && img.naturalWidth));
      await page.locator('#identify-previews select').selectOption('Whole organism');
      await page.fill('#identify-date', '2024-02-29');
      await page.selectOption('#identify-region', 'North America'); await page.selectOption('#identify-precision', 'city');
      await page.fill('#identify-city', 'Temporary site');
      await page.locator('#identification-form button[type=submit]').click();
      assert.equal(await page.locator('#identify-candidates > li').count(), 3);
      assert.equal(await page.locator('#identify-remaining > li').count(), 3);
      await page.locator('#identify-more summary').click();
      await page.locator('#identify-remaining button').last().click();
      const selectedName = await page.locator('#identify-remaining h4').last().textContent();
      const beforeTransfer = await raw(J);
      await transfer();
      assert.equal(await raw(J), beforeTransfer, 'Photo confirmation must not save');
      assert.equal(await page.locator('#project-observation').inputValue(), '', 'New photo draft must not add a previously selected saved record');
      assert.equal(await page.locator('input[name=type]:checked').inputValue(), type === 'unsure' ? 'other' : type);
      await select(customId);
      if (type === 'plant') {
        // Project-write failure keeps independent previews/context and reuses the journal ID.
        await page.evaluate(K => {
          const set = Storage.prototype.setItem; window.photoSet = set;
          Storage.prototype.setItem = function (key, value) { if (key === K) throw Error('Photo project quota'); return set.call(this, key, value); };
        }, K);
        await add(); const partialPhotoId = (await records())[0].id;
        assert.match(await page.locator('#form-error').textContent(), /Observation saved.*project add failed/);
        assert.equal(await page.locator('#discovery-previews img').count(), 1);
        assert.equal(await page.locator('#discovery-city').inputValue(), 'Temporary site');
        await page.click('#identify-reset');
        assert.equal(await page.locator('#discovery-previews img').count(), 1);
        await add(); assert.equal((await records()).length, beforePhotos + 1);
        await page.evaluate(() => { Storage.prototype.setItem = window.photoSet; });
        await add(); assert.equal((await records())[0].id, partialPhotoId);
      } else { await add(); }
      const record = (await records())[0];
      assert.notEqual(record.id, previousId);
      assert.equal(record.name, selectedName);
      assert.equal(record.type, type === 'unsure' ? 'other' : type);
      assert.deepEqual(Object.keys(record).sort(), ['date', 'id', 'name', 'notes', 'privacy', 'type']);
      await add(); assert.equal((await records()).length, beforePhotos + index + 1);
      assert.equal((await projects()).find(p => p.id === customId).observationIds.filter(id => id === record.id).length, 1);
      assert.equal(await page.locator('#discovery-previews img').count(), 0);
      assert.equal(await page.locator('#discovery-city').inputValue(), '');
    }
    await page.reload(); await page.selectOption('#project-select', customId);
    assert.match(await page.locator('#project-report').textContent(), /Local reptile discovery/);
    const goodK = await raw(K);
    for (const bad of ['{broken', JSON.stringify({ format: 'terra-projects', version: 99, projects: [] })]) {
      await page.evaluate(({ K, bad }) => localStorage.setItem(K, bad), { K, bad }); await page.reload();
      assert.equal(await page.locator('#add-project-button').isDisabled(), true); assert.equal(await raw(K), bad);
      assert.equal(await page.locator('#save-button').isEnabled(), true);
    }
    await page.evaluate(({ K, goodK }) => localStorage.setItem(K, goodK), { K, goodK });
    await page.addInitScript(() => { Storage.prototype.getItem = () => { throw Error('blocked'); }; }); await page.reload();
    assert.equal(await page.locator('#add-project-button').isDisabled(), true);
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    await context.close();
    console.log('PASS: all-group photo-to-project draft targeting and partial-write preview/context retry, discovery project creation/reuse/idempotency, scope/completion, retries/partial failures, stale drafts/cross-tab, unchanged JSON, staged provenance, separate no-network genetic previews/DNA validation/nonpersistence, labels/keyboard/mobile.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
