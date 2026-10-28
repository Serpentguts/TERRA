// Optional development check: npm install --no-save --package-lock=false playwright
// Start python3 server.py, then run node test-browser.cjs.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');

async function testRestore(page, key, exported) {
  const raw = () => page.evaluate(k => localStorage.getItem(k), key);
  const stored = async () => JSON.parse(await raw());
  const choose = async (data, name = 'backup.json', mimeType = 'application/json') => {
    await page.setInputFiles('#import-file', {
      name, mimeType, buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data))
    });
    await page.waitForFunction(() => !document.querySelector('#import-error').hidden || !document.querySelector('#import-preview').hidden);
  };
  const wrapper = records => ({ format: 'terra-observations', version: 1, exportedAt: '2026-10-22T12:00:00.000Z', observations: records });
  const record = { id: 'restore-test', type: 'fungus', name: '<img src=x onerror="window.injected=true">', notes: '<script>bad()</script>', date: '2024-02-29', privacy: 'hidden' };
  const baseline = await stored();
  const before = await raw();

  // The actual downloaded wrapper can restore a deleted entry. No writes on preview/cancel.
  await choose(exported);
  assert.match(await page.locator('#import-summary').textContent(), /3 valid records: 1 to add; 2 duplicate IDs/);
  assert.equal(await raw(), before);
  await page.click('#cancel-import');
  assert.equal(await page.locator('#import-preview').isVisible(), false);
  assert.equal(await raw(), before);
  await choose(exported);
  await page.click('#confirm-import');
  assert.equal((await stored()).length, baseline.length + 1);
  for (const item of baseline) assert.deepEqual((await stored()).find(r => r.id === item.id), item);
  await page.reload();
  assert.equal(await page.locator('.observation-card').count(), baseline.length + 1);
  await choose(exported);
  assert.match(await page.locator('#import-summary').textContent(), /0 to add; 3 duplicate IDs/);
  assert.equal(await page.locator('#confirm-import').isDisabled(), true);

  // Existing IDs win over incoming values; first occurrence wins within the file.
  const existing = (await stored())[0];
  const batch = wrapper([{ ...existing, name: 'MUST NOT REPLACE' }, { ...record, coordinates: [1, 2], photo: 'ignored' }, { ...record, name: 'SECOND COPY' }]);
  const beforeBatch = await raw();
  await choose(batch);
  assert.match(await page.locator('#import-summary').textContent(), /3 valid records: 1 to add; 2 duplicate IDs/);
  assert.equal(await page.locator('#import-records img, #import-records script').count(), 0);
  assert.equal(await raw(), beforeBatch);
  await page.click('#confirm-import');
  assert.deepEqual((await stored()).find(r => r.id === existing.id), existing);
  assert.deepEqual((await stored()).find(r => r.id === record.id), record);
  assert.equal(await page.locator('.observation-card img, .observation-card script').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.match(await page.locator('#import-status').textContent(), /added 1 observations; skipped 2/);

  const protectedRaw = await raw();
  const invalidFiles = [
    '{broken', 'null', '[]', '{}',
    { ...wrapper([]), format: 'other' }, { ...wrapper([]), version: 2 },
    { ...wrapper([]), version: '1' }, { ...wrapper([]), exportedAt: 'not-a-date' },
    { ...wrapper([]), exportedAt: undefined }, { ...wrapper([]), exportedAt: '2025-02-29T12:00:00.000Z' },
    { ...wrapper([]), observations: {} },
    wrapper([record, null]), wrapper([record, []]),
    ...[
      { id: '' }, { id: 42 }, { id: ' ' }, { type: 'unrecognized' }, { type: ['plant'] },
      { name: '' }, { name: ' ' }, { name: 'a'.repeat(121) },
      { notes: null }, { notes: 'a'.repeat(3001) }, { date: '2025-02-29' },
      { date: '0000-01-01' }, { date: '2025-13-01' }, { privacy: 'public' },
      { privacy: ['hidden'] }
    ].map(fields => wrapper([{ ...record, id: 'valid-first' }, { ...record, ...fields }])),
    wrapper([{ id: 'missing-fields' }])
  ];
  for (const data of invalidFiles) {
    await choose(data);
    assert.equal(await page.locator('#import-error').isVisible(), true, JSON.stringify(data));
    assert.equal(await page.locator('#import-preview').isVisible(), false);
    assert.equal(await page.locator('#confirm-import').isDisabled(), true);
    assert.equal(await raw(), protectedRaw);
  }
  await choose(wrapper([]), 'backup.txt', 'text/plain');
  assert.match(await page.locator('#import-error').textContent(), /\.json/);
  await choose(wrapper([]), 'backup.json', 'image/png');
  assert.equal(await page.locator('#import-error').isVisible(), true);
  await choose('');
  assert.match(await page.locator('#import-error').textContent(), /non-empty/);
  await choose(' '.repeat(5 * 1024 * 1024 + 1));
  assert.match(await page.locator('#import-error').textContent(), /5 MB/);
  assert.equal(await raw(), protectedRaw);
  await choose(wrapper([]), 'empty.JSON', '');
  assert.match(await page.locator('#import-summary').textContent(), /0 valid records/);
  assert.equal(await page.locator('#confirm-import').isDisabled(), true);

  // Read failures are accessible, and a subsequent selection still works.
  await page.evaluate(() => {
    window.originalFileText = File.prototype.text;
    File.prototype.text = async () => { throw new Error('unreadable'); };
  });
  await choose(wrapper([record]));
  assert.match(await page.locator('#import-error').textContent(), /could not be read/);
  await page.evaluate(() => { File.prototype.text = window.originalFileText; });

  // Replacing a pending selection cannot resurrect its asynchronously read preview.
  await page.evaluate(() => {
    File.prototype.text = function () {
      return new Promise(resolve => { window.finishOldRead = () => window.originalFileText.call(this).then(resolve); });
    };
  });
  await page.setInputFiles('#import-file', { name: 'slow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(wrapper([record]))) });
  await choose('not-json', 'wrong.txt', 'text/plain');
  await page.evaluate(async () => {
    File.prototype.text = window.originalFileText;
    await window.finishOldRead();
  });
  assert.equal(await page.locator('#import-preview').isVisible(), false);
  assert.equal(await page.locator('#confirm-import').isDisabled(), true);
  assert.match(await page.locator('#import-error').textContent(), /\.json/);

  // Bound the DOM preview even when more entries are validated.
  const many = Array.from({ length: 25 }, (_, i) => ({ ...record, id: `many-${i}` }));
  await choose(wrapper(many));
  assert.equal(await page.locator('#import-records li').count(), 21);
  assert.match(await page.locator('#import-records').textContent(), /first 20 of 25/);
  await page.click('#cancel-import');
  assert.equal(await raw(), protectedRaw);

  // Quota and generic write failures leave bytes, rendered records, and retry preview intact.
  const retryRecord = { ...record, id: 'retry-after-quota' };
  await page.fill('#name', 'Keep this restore-time draft');
  await choose(wrapper([retryRecord]));
  const renderedCount = await page.locator('.observation-card').count();
  for (const errorName of ['QuotaExceededError', 'SecurityError']) {
    await page.evaluate(name => {
      window.originalSetItem ||= Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException('write blocked', name); };
    }, errorName);
    await page.click('#confirm-import');
    assert.equal(await raw(), protectedRaw);
    assert.equal(await page.locator('.observation-card').count(), renderedCount);
    assert.equal(await page.locator('#name').inputValue(), 'Keep this restore-time draft');
    assert.equal(await page.locator('#import-preview').isVisible(), true);
    assert.equal(await page.locator('#confirm-import').isEnabled(), true);
    assert.match(await page.locator('#import-error').textContent(), /could not be saved/);
  }
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await page.click('#confirm-import');
  assert.deepEqual((await stored()).find(r => r.id === retryRecord.id), retryRecord);

  // Changes after preview cause a fresh preview and a second explicit confirmation.
  const concurrent = { ...record, id: 'another-tab' };
  const fresh = { ...record, id: 'fresh-restore' };
  await choose(wrapper([concurrent, fresh]));
  await page.evaluate(({ key, concurrent }) => {
    localStorage.setItem(key, JSON.stringify([concurrent, ...JSON.parse(localStorage.getItem(key))]));
  }, { key, concurrent });
  const changedRaw = await raw();
  await page.click('#confirm-import');
  assert.equal(await raw(), changedRaw);
  assert.match(await page.locator('#import-status').textContent(), /journal changed/);
  assert.match(await page.locator('#import-summary').textContent(), /1 to add; 1 duplicate IDs/);
  await page.click('#confirm-import');
  assert.deepEqual((await stored()).find(r => r.id === concurrent.id), concurrent);
  assert.deepEqual((await stored()).find(r => r.id === fresh.id), fresh);

  // Corrupt or blocked current storage discovered at confirmation cannot be replaced.
  await choose(wrapper([{ ...record, id: 'never-written' }]));
  const recoverableRaw = await raw();
  await page.evaluate(k => localStorage.setItem(k, '{broken'), key);
  await page.click('#confirm-import');
  assert.equal(await raw(), '{broken');
  assert.equal(await page.locator('#confirm-import').isDisabled(), true);
  assert.match(await page.locator('#import-error').textContent(), /cannot be read/);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value: recoverableRaw });
  await page.reload();
  await choose(wrapper([{ ...record, id: 'never-written' }]));
  await page.evaluate(() => {
    window.originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
  });
  await page.click('#confirm-import');
  assert.equal(await page.locator('#confirm-import').isDisabled(), true);
  assert.equal(await page.locator('#import-error').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.getItem = window.originalGetItem; });
  assert.equal(await raw(), recoverableRaw);
  await page.reload();
  assert.equal(await page.getByLabel('Choose a TERRA JSON export', { exact: true }).count(), 1);
  assert.equal(await page.locator('#import-status').getAttribute('role'), 'status');
  assert.equal(await page.locator('#import-error').getAttribute('role'), 'alert');

  // Fresh-profile recovery: importing into an empty journal restores the full backup.
  await page.evaluate(k => localStorage.removeItem(k), key);
  await page.reload();
  await choose(exported);
  assert.equal(await raw(), null);
  await page.click('#confirm-import');
  assert.deepEqual(await stored(), exported.observations);
  await page.reload();
  assert.equal(await page.locator('.observation-card').count(), exported.observations.length);
}


async function testIdentification(page, key) {
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const photo = (name = 'view.png', buffer = image, mimeType = 'image/png') => ({ name, buffer, mimeType });
  const snapshot = () => page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const before = await snapshot();
  const requests = [];
  const capture = request => requests.push(request.url());
  page.on('request', capture);
  // Count URLs as well as DOM images to verify reset/removal/decode-failure cleanup.
  await page.evaluate(() => {
    window.mockUrls = { created: [], revoked: [] };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = value => { const url = create(value); window.mockUrls.created.push(url); return url; };
    URL.revokeObjectURL = url => { window.mockUrls.revoked.push(url); revoke(url); };
    navigator.geolocation.getCurrentPosition = () => { throw new Error('GPS must not be requested'); };
    navigator.geolocation.watchPosition = () => { throw new Error('GPS must not be requested'); };
  });
  const analyze = () => page.getByRole('button', { name: /Analyze — show MOCK/ }).click();
  const ready = () => page.waitForFunction(() => Array.from(document.querySelectorAll('#identify-previews img')).every(img => img.complete && img.naturalWidth > 0));
  const error = async pattern => assert.match(await page.locator('#identify-error').textContent(), pattern);
  await analyze();
  await error(/Choose an organism group/);
  assert.equal(await page.locator('#identify-group').evaluate(el => el === document.activeElement), true);
  await page.selectOption('#identify-group', 'plant');
  await analyze();
  await error(/at least one photo/);
  await page.setInputFiles('#identify-files', photo('bad.txt', Buffer.from('bad'), 'text/plain'));
  await error(/JPEG, PNG/);
  await page.setInputFiles('#identify-files', photo('empty.png', Buffer.alloc(0)));
  await error(/non-empty/);
  await page.setInputFiles('#identify-files', photo('large.png', Buffer.alloc(10 * 1024 * 1024 + 1)));
  await error(/10 MB/);
  await page.setInputFiles('#identify-files', photo('broken.png', Buffer.from('not an image')));
  await page.waitForFunction(() => document.querySelector('#identify-error').textContent.includes('could not be decoded'));
  assert.equal(await page.locator('#identify-previews img').count(), 0);
  await page.setInputFiles('#identify-files', photo('<img src=x onerror=alert(1)>.png'));
  await ready();
  assert.equal(await page.locator('#identify-previews img').count(), 1);
  assert.equal(await page.locator('#identify-previews script').count(), 0);
  await analyze();
  await error(/photographed part for every image/);
  await page.locator('#identify-previews select').selectOption('Leaf');
  await page.setInputFiles('#identify-files', photo('another.png'));
  await error(/enable multiple views/);
  assert.equal(await page.locator('#identify-previews img').count(), 1);
  await page.evaluate(() => {
    const date = document.querySelector('#identify-date');
    date.value = '10000-01-01';
    date.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await analyze();
  await error(/valid optional date/);
  await page.fill('#identify-date', '2024-02-29');
  await page.selectOption('#identify-region', 'North America');
  await analyze();
  assert.equal(await page.locator('#identify-output').isVisible(), true);
  assert.equal(await page.locator('#identification-form [aria-invalid="true"]').count(), 0);
  assert.equal(await page.locator('#identify-candidates li').count(), 3);
  assert.match(await page.locator('#identify-output').textContent(), /not calibrated probabilities/);
  assert.match(await page.locator('#identify-candidates').textContent(), /Demo data · Illustrative confidence/);
  assert.match(await page.locator('#identify-caveat').textContent(), /edible or medicinal/);
  assert.equal(await page.locator('#identify-results-title').evaluate(el => el === document.activeElement), true);
  await page.locator('#identify-candidates button').first().click();
  assert.match(await page.locator('#identify-review-status').textContent(), /Accepted MOCK candidate: Common dandelion/);
  await page.click('#identify-correct');
  assert.equal(await page.locator('#identify-review-error').isVisible(), true);
  const literal = '<img src=x onerror="window.mockInjected=true">';
  await page.fill('#identify-correction', literal);
  await page.click('#identify-correct');
  assert.match(await page.locator('#identify-review-status').textContent(), /Your corrected label: <img/);
  assert.equal(await page.locator('#identify-review-status img').count(), 0);
  assert.equal(await page.evaluate(() => window.mockInjected), undefined);
  await page.click('#identify-uncertain');
  assert.match(await page.locator('#identify-review-status').textContent(), /Left uncertain/);
  assert.equal(await snapshot(), before);

  // Every group has its own part vocabulary, drops stale parts/results, and supplies a caveat.
  const expectedParts = {
    plant: ['Leaf', 'Flower', 'Fruit', 'Bark', 'Whole organism', 'Other'],
    fungus: ['Cap', 'Gills / underside', 'Stem', 'Whole organism', 'Other'],
    insect: ['Dorsal / top', 'Ventral / underside', 'Wing', 'Leg', 'Whole organism', 'Other'],
    mammal: ['Head', 'Body', 'Tracks', 'Whole organism', 'Other'],
    bird: ['Head', 'Wing', 'Plumage', 'Whole organism', 'Other'],
    fish: ['Side', 'Fin', 'Head', 'Whole organism', 'Other'],
    reptile: ['Head', 'Scales', 'Body', 'Whole organism', 'Other'],
    unsure: ['Whole organism', 'Detail / close-up', 'Other']
  };
  for (const [group, part, caveat, candidate] of [
    ['fungus', 'Gills / underside', /deadly/, /Fly agaric/], ['insect', 'Dorsal / top', /safe distance/, /Seven-spot ladybird/],
    ['mammal', 'Tracks', /safe distance/, /Red fox/], ['bird', 'Plumage', /nests/, /European robin/],
    ['fish', 'Fin', /Do not capture/, /Atlantic salmon/], ['reptile', 'Scales', /never handle/, /Green iguana/],
    ['unsure', 'Detail / close-up', /group is unresolved/, /Unresolved plant/], ['plant', 'Bark', /look-alike/i, /Common dandelion/]
  ]) {
    await page.selectOption('#identify-group', group);
    assert.equal(await page.locator('#identify-output').isVisible(), false);
    assert.equal(await page.locator('#identify-previews select').inputValue(), '');
    assert.deepEqual(await page.locator('#identify-previews select option').evaluateAll(options => options.slice(1).map(option => option.value)), expectedParts[group]);
    await page.locator('#identify-previews select').selectOption(part);
    await analyze();
    assert.match(await page.locator('#identify-caveat').textContent(), caveat);
    assert.equal(await page.locator('#identify-candidates li').count(), 3);
    assert.match(await page.locator('#identify-candidates').textContent(), candidate);
  }
  await page.check('#identify-multiple');
  await page.setInputFiles('#identify-files', [photo('second.png'), photo('third.png')]);
  await ready();
  assert.equal(await page.locator('#identify-previews img').count(), 3);
  await analyze();
  await error(/photographed part for every image/);
  for (const select of await page.locator('#identify-previews select').all()) await select.selectOption('Whole organism');
  await analyze();
  assert.match(await page.locator('#identify-status').textContent(), /3 local photo/);
  await page.click('#identify-multiple'); // App intentionally keeps multi-view mode on until extras are removed.
  assert.equal(await page.locator('#identify-multiple').isChecked(), true);
  await error(/Remove extra views/);
  await page.setInputFiles('#identify-files', [photo('four.png'), photo('five.png'), photo('six.png')]);
  await ready();
  assert.equal(await page.locator('#identify-previews img').count(), 6);
  await page.setInputFiles('#identify-files', photo('seven.png'));
  await error(/at most 6/);
  await page.locator('#identify-previews button').last().click();
  assert.equal(await page.locator('#identify-output').isVisible(), false);
  assert.equal(await page.locator('#identify-previews img').count(), 5);
  for (const select of await page.locator('#identify-previews select').all()) await select.selectOption('Other');
  await analyze();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `populated mock overflow at ${width}`);
  }
  await page.selectOption('#identify-region', 'Europe');
  assert.equal(await page.locator('#identify-output').isVisible(), false);
  assert.equal(await page.locator('#identify-review-status').textContent(), '');
  await page.click('#identify-reset');
  assert.equal(await page.locator('#identify-previews img').count(), 0);
  assert.equal(await page.locator('#identify-group').inputValue(), '');
  assert.equal(await page.locator('#identify-date').inputValue(), '');
  assert.equal(await page.locator('#identify-region').inputValue(), '');
  assert.equal(await page.locator('#identify-multiple').isChecked(), false);
  assert.equal(await page.locator('#identify-group').evaluate(el => el === document.activeElement), true);
  const urls = await page.evaluate(() => window.mockUrls);
  assert.deepEqual([...urls.created].sort(), [...urls.revoked].sort());
  assert.equal(await snapshot(), before);
  assert.equal(requests.every(url => url.startsWith('blob:')), true, `Unexpected mock network: ${requests}`);
  page.off('request', capture);

  // Reload also discards previews/context/review, without changing persisted observations.
  await page.selectOption('#identify-group', 'unsure');
  await page.setInputFiles('#identify-files', photo());
  await ready();
  await page.locator('#identify-previews select').selectOption('Other');
  await analyze();
  await page.click('#identify-uncertain');
  await page.reload();
  assert.equal(await page.locator('#identify-previews img').count(), 0);
  assert.equal(await page.locator('#identify-output').isVisible(), false);
  assert.equal(await snapshot(), before);
  assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).every(item => Object.keys(item).sort().join() === 'date,id,name,notes,privacy,type'), key), true);
  console.log('PASS: local mock identification, all groups/parts/caveats, single/multi-image limits, invalid files, URL cleanup, review controls, safe text, reset/reload, storage isolation, zero mock network calls, populated responsive widths.');
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    const externalRequests = [];
    const networkAttempts = [];
    await context.exposeBinding('reportNetworkAttempt', (_source, api) => networkAttempts.push(api));
    const origin = 'http://127.0.0.1:8080';
    context.on('request', request => requests.push(request.url()));
    // Fail closed: a new remote dependency cannot silently pass the suite.
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      externalRequests.push(route.request().url());
      return route.abort();
    });
    await context.addInitScript(() => {
      window.networkAttempts = [];
      for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
        window[api] = function () {
          window.networkAttempts.push(api);
          window.reportNetworkAttempt(api);
          throw new Error(`Unexpected network API: ${api}`);
        };
      }
      navigator.sendBeacon = () => {
        window.networkAttempts.push('sendBeacon');
        window.reportNetworkAttempt('sendBeacon');
        return false;
      };
    });
    page.on('pageerror', error => errors.push(error.message));
    const key = 'terra.observations.v1';
    await page.goto('http://127.0.0.1:8080');
    assert.equal(await page.locator('#empty-state').isVisible(), true);
    assert.equal(await page.locator('#date').inputValue(), await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }));
    // Starter suggestions match any part of every local name, never forced replacements.
    const name = page.getByRole('combobox', { name: 'Species or common name' });
    const suggestionList = page.getByRole('listbox', { name: 'Starter species suggestions and custom name' });
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('#save-button').isEnabled(), true);
    const speciesOptions = () => suggestionList.getByRole('option').allTextContents().then(items => items.slice(0, -1));
    const both = ['Trichocereus bridgesii', 'Trichoderma harzianum'];
    // Real typing filters every keystroke; deleting broadens the list again.
    await name.fill('');
    for (const letter of 'Trich') {
      await name.pressSequentially(letter);
      assert.deepEqual(await speciesOptions(), both);
    }
    await name.pressSequentially('oc');
    assert.deepEqual(await speciesOptions(), [both[0]]);
    await name.press('Backspace');
    assert.deepEqual(await speciesOptions(), both);
    await name.fill('RICH');
    assert.deepEqual(await speciesOptions(), both);
    assert.equal(await name.getAttribute('aria-controls'), await suggestionList.getAttribute('id'));
    assert.equal(await name.getAttribute('aria-autocomplete'), 'list');
    assert.equal(await page.locator('#name-status').getAttribute('role'), 'status');
    assert.equal(await page.locator('#name-status').getAttribute('aria-live'), 'polite');
    assert.match(await page.locator('#name-help').textContent(), /not all real species/);
    await name.fill('harz');
    await suggestionList.getByRole('option', { name: both[1], exact: true }).tap();
    assert.equal(await name.inputValue(), both[1]);
    assert.equal(await page.locator('.observation-card').count(), 0, 'Touch fills without submitting');
    assert.equal(await name.evaluate(el => document.activeElement === el), true);
    assert.equal(await name.getAttribute('aria-expanded'), 'false');
    await name.fill('  tRiCh');
    assert.deepEqual(await suggestionList.getByRole('option').allTextContents(), [
      'Trichocereus bridgesii', 'Trichoderma harzianum', 'Keep “tRiCh” as my manual name'
    ]);
    assert.equal(await name.getAttribute('aria-expanded'), 'true');
    await name.press('ArrowDown');
    assert.equal(await name.getAttribute('aria-activedescendant'), 'name-option-0');
    await name.press('ArrowDown');
    assert.equal(await suggestionList.getByRole('option', { selected: true }).textContent(), 'Trichoderma harzianum');
    await name.press('Enter');
    assert.equal(await name.inputValue(), 'Trichoderma harzianum');
    assert.equal(await page.locator('.observation-card').count(), 0, 'Enter selects without submitting');
    await page.click('#save-button');
    assert.equal(await page.locator('.observation-card h3').textContent(), 'Trichoderma harzianum');
    assert.match(await page.locator('#status').textContent(), /local journal.*Nothing was published to iNaturalist/);
    await name.fill('Trichoc');
    assert.equal(await suggestionList.getByRole('option').count(), 2);
    await suggestionList.getByRole('option', { name: 'Trichocereus bridgesii', exact: true }).click();
    assert.equal(await name.inputValue(), 'Trichocereus bridgesii');
    assert.equal(await page.locator('.observation-card').count(), 1, 'Mouse fills without submitting');
    await page.click('#save-button');
    await name.fill('Trich');
    await name.press('ArrowUp'); // Last option is the explicit manual choice.
    await name.press('Enter');
    assert.equal(await name.inputValue(), 'Trich');
    await page.click('#save-button');
    await name.fill('My unlisted organism');
    assert.equal(await suggestionList.getByRole('option').count(), 1);
    assert.match(await page.locator('#name-status').textContent(), /No matching starter species/);
    assert.equal(await page.locator('#name-status').isVisible(), true);
    await suggestionList.getByRole('option').tap();
    assert.equal(await name.inputValue(), 'My unlisted organism');
    assert.equal(await page.locator('.observation-card').count(), 3, 'Manual choice does not submit');
    await page.click('#save-button');
    const featureRecords = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    assert.deepEqual(featureRecords.map(item => item.name), [
      'My unlisted organism', 'Trich', 'Trichocereus bridgesii', 'Trichoderma harzianum'
    ]);
    for (const [query, expected] of [
      ['harz', ['Trichoderma harzianum']],
      ['BRIDGESII', ['Trichocereus bridgesii']],
      ['  ICHO  ', ['Trichocereus bridgesii', 'Trichoderma harzianum']],
      ['tricho', ['Trichocereus bridgesii', 'Trichoderma harzianum']],
      ['not in the starter list', []], ['   ', []]
    ]) {
      await name.fill(query);
      const options = await suggestionList.getByRole('option').allTextContents();
      assert.deepEqual(query.trim() ? options.slice(0, -1) : options, expected, query);
      assert.equal(await name.inputValue(), query, 'Filtering preserves manual text');
    }
    await name.fill('harz');
    assert.equal(await suggestionList.getByRole('option').count(), 2, 'Substring matches plus manual option');
    await name.press('Escape');
    assert.equal(await name.getAttribute('aria-expanded'), 'false');
    assert.equal(await name.getAttribute('aria-activedescendant'), null);
    await name.press('ArrowDown');
    await name.press('Tab');
    assert.equal(await name.inputValue(), 'harz', 'Tab does not replace custom text');
    assert.equal(await name.getAttribute('aria-expanded'), 'false');
    await name.fill('<img src=x onerror="window.injected=true">');
    assert.equal(await page.locator('#name-suggestions img').count(), 0);
    await name.fill('unlisted manual text');
    await name.press('Tab');
    assert.equal(await name.inputValue(), 'unlisted manual text');
    await name.fill('');
    assert.equal(await name.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#name-status').textContent(), '');
    // Real keyboard input, invalid calendar days, leap years, bounds, and calendar sync.
    const date = page.getByLabel('Observation date', { exact: true });
    const calendar = page.getByLabel('Choose observation date with calendar', { exact: true });
    assert.equal(await page.locator('.date-bar').count(), 1);
    assert.equal(await page.locator('.date-bar #date, .date-bar #date-picker').count(), 2);
    await date.focus();
    await date.press('Tab');
    assert.equal(await calendar.evaluate(el => el === document.activeElement), true);
    // Exercise real user-gesture activation of the native picker with Enter and Space.
    await calendar.evaluate(el => {
      const nativeShowPicker = el.showPicker.bind(el);
      window.pickerActivations = 0;
      el.showPicker = () => { window.pickerActivations++; nativeShowPicker(); };
    });
    for (const key of ['Enter', ' ']) {
      await calendar.focus();
      await calendar.press(key);
      await page.keyboard.press('Escape');
    }
    assert.equal(await page.evaluate(() => window.pickerActivations), 2);
    const beforeInvalid = await page.evaluate(k => localStorage.getItem(k), key);
    for (const invalid of ['', '1900-02-29', '2100-02-29', '2025-02-29', '2024-02-30', '2025-04-31', '0000-01-01', '10000-01-01', '04/02/2025', '2025-4-2', 'not a date']) {
      await date.fill(invalid);
      await page.click('#save-button');
      assert.equal(await date.evaluate(el => el.checkValidity()), false, invalid);
      assert.equal(await page.evaluate(k => localStorage.getItem(k), key), beforeInvalid);
      assert.equal(await page.locator('#date-picker').inputValue(), '');
    }
    for (const valid of ['2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31']) {
      await date.fill('');
      await date.pressSequentially(valid);
      assert.equal(await date.evaluate(el => el.checkValidity()), true, valid);
      assert.equal(await page.locator('#date-picker').inputValue(), valid);
    }
    // Native picker input and change both synchronize the one visible text value.
    await calendar.fill('2024-02-29');
    await calendar.dispatchEvent('input');
    assert.equal(await date.inputValue(), '2024-02-29');
    await page.locator('#date-picker').fill('2025-04-02');
    await page.locator('#date-picker').dispatchEvent('change');
    assert.equal(await date.inputValue(), '2025-04-02');
    await name.fill('Calendar date');
    await page.click('#save-button');
    assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k))[0].date, key), '2025-04-02');
    await date.fill('2024-02-29');
    await name.fill('Typed leap day');
    await page.click('#save-button');
    await page.reload();
    assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k))[0].date, key), '2024-02-29');
    assert.equal(await page.locator('#date-picker').inputValue(), await date.inputValue());
    await page.evaluate(k => localStorage.removeItem(k), key);
    await page.reload();
    // Blank names become Unknown, and each privacy option is only a preference.
    await page.click('#save-button');
    assert.equal(await page.locator('.observation-card h3').textContent(), 'Unknown');
    await page.reload();
    assert.equal(await page.locator('.observation-card').count(), 1);
    const injection = '<img src=x onerror="window.injected=true">';
    await page.fill('#name', injection);
    await page.fill('#notes', '<script>alert(1)</script>\nA second line.');
    await page.check('input[value="fungus"]');
    await page.selectOption('#privacy', 'exact');
    await page.fill('#date', '2025-04-02');
    await page.click('#save-button');
    assert.equal(await page.locator('.observation-card h3').last().textContent(), injection);
    assert.equal(await page.locator('.observation-card img, .observation-card script').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    await page.setInputFiles('#photo', { name: 'sample.png', mimeType: 'image/png', buffer: image });
    await page.waitForFunction(() => document.querySelector('#photo-preview').naturalWidth > 0);
    assert.equal(await page.locator('#preview-wrap').isVisible(), true);
    await page.fill('#name', 'Dandelion');
    await page.selectOption('#privacy', 'approximate');
    await page.click('#save-button');
    assert.equal(await page.locator('#preview-wrap').isVisible(), false);
    const stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    assert.equal(stored.length, 3);
    assert.deepEqual(Object.keys(stored[0]).sort(), ['date', 'id', 'name', 'notes', 'privacy', 'type']);
    assert.equal(stored[0].privacy, 'approximate');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-button');
    const download = await downloadPromise;
    const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.deepEqual(exported.observations, stored);
    assert.equal(exported.version, 1);
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('.observation-card button').first().click();
    assert.equal(await page.locator('.observation-card').count(), 3);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.observation-card button').first().click();
    assert.equal(await page.locator('.observation-card').count(), 2);
    await page.setInputFiles('#photo', { name: 'not-image.txt', mimeType: 'text/plain', buffer: Buffer.from('no') });
    assert.equal(await page.locator('#photo-error').isVisible(), true);
    await page.setInputFiles('#photo', { name: 'too-big.png', mimeType: 'image/png', buffer: Buffer.alloc(11 * 1024 * 1024) });
    assert.match(await page.locator('#photo-error').textContent(), /10 MB/);
    // A second tab observes additions through the storage event.
    const second = await context.newPage();
    await second.goto('http://127.0.0.1:8080');
    await page.fill('#name', 'Second-tab check');
    await page.click('#save-button');
    await second.waitForFunction(() => document.querySelector('#count').textContent === '3');
    assert.deepEqual(await second.evaluate(() => window.networkAttempts), []);
    await second.close();
    // Simulate quota exhaustion; form and saved records must survive.
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
    await page.fill('#name', 'Keep this draft');
    await page.click('#save-button');
    assert.equal(await page.locator('#form-error').isVisible(), true);
    assert.equal(await page.locator('#name').inputValue(), 'Keep this draft');
    assert.equal(await page.locator('.observation-card').count(), 3);
    await page.reload();
    await testRestore(page, key, exported);
    await testIdentification(page, key);
    // All seven choices save and round-trip using the unchanged six-field v1 schema.
    const choices = { plant: 'Plant', fungus: 'Mushroom', insect: 'Insect', mammal: 'Mammal', bird: 'Bird', fish: 'Fish', reptile: 'Reptile' };
    assert.deepEqual(await page.locator('#identify-group option').evaluateAll(options => options.slice(1, -1).map(o => o.textContent)), Object.values(choices));
    for (const [type, label] of Object.entries(choices)) {
      await page.getByRole('radio', { name: label, exact: true }).check();
      await name.fill('Trich');
      assert.deepEqual(await page.locator('#name-suggestions li').allTextContents(), ['Trichocereus bridgesii', 'Trichoderma harzianum', 'Keep “Trich” as my manual name']);
      await name.fill(`${label} manual record`);
      await page.click('#save-button');
      const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k))[0], key);
      assert.equal(saved.type, type);
      assert.equal(saved.name, `${label} manual record`);
      assert.deepEqual(Object.keys(saved).sort(), ['date', 'id', 'name', 'notes', 'privacy', 'type']);
      assert.equal(await page.locator('.observation-card').filter({ hasText: `${label} manual record` }).locator('.category').textContent(), label);
    }
    const categoryDownload = page.waitForEvent('download'); await page.click('#export-button');
    const categoryBackup = await fs.readFile(await (await categoryDownload).path(), 'utf8');
    const categoryRecords = JSON.parse(categoryBackup).observations;
    await page.evaluate(k => localStorage.removeItem(k), key); await page.reload();
    await page.setInputFiles('#import-file', { name: 'categories.json', mimeType: 'application/json', buffer: Buffer.from(categoryBackup) });
    await page.waitForSelector('#import-preview:visible'); await page.click('#confirm-import'); await page.reload();
    assert.deepEqual(await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key), categoryRecords);
    // Corrupt storage must not be silently overwritten.
    await page.evaluate(k => localStorage.setItem(k, '{broken'), key);
    await page.reload();
    assert.equal(await page.locator('#storage-error').isVisible(), true);
    assert.equal(await page.locator('#save-button').isDisabled(), true);
    assert.equal(await page.locator('#import-file').isDisabled(), true);
    assert.equal(await page.locator('#confirm-import').isDisabled(), true);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), '{broken');
    await page.evaluate(k => localStorage.removeItem(k), key);
    await page.reload();
    // Blocked storage has an explicit error state.
    await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('blocked'); }; });
    await page.reload();
    assert.equal(await page.locator('#save-button').isDisabled(), true);
    assert.equal(await page.locator('#storage-error').isVisible(), true);
    // Mobile overflow and accessible form labels.
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `overflow at ${width}`);
      await name.fill('Trich');
      assert.equal(await page.locator('#name-suggestions').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `open suggestions overflow at ${width}`);
      await name.fill('x'.repeat(120));
      const textBounds = await date.boundingBox();
      const iconBounds = await calendar.boundingBox();
      assert.ok(Math.abs(textBounds.y - iconBounds.y) <= 1, `one date bar at ${width}`);
      assert.ok(textBounds.x + textBounds.width <= iconBounds.x + 1, 'Icon does not cover typed text');
      assert.ok(iconBounds.width >= 44 && iconBounds.height >= 44, 'Calendar touch target');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `custom name overflow at ${width}`);
      await name.press('Escape');
    }
    assert.equal(await page.getByLabel('Observation date', { exact: true }).count(), 1);
    assert.equal(await page.getByLabel('Location privacy preference', { exact: true }).count(), 1);
    assert.equal(await page.getByLabel('Choose observation date with calendar', { exact: true }).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.networkAttempts), []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(networkAttempts, []);
    assert.deepEqual(errors, []);
    assert.equal(requests.every(url => url.startsWith('http://127.0.0.1:8080/') || url.startsWith('blob:')), true);
    await context.close();
    console.log('PASS: integrated date bar, native keyboard activation, manual/calendar sync, strict/leap dates, substring autocomplete, custom names; save/reload, safe text, previews, privacy, export/restore round-trip, preview/cancel/confirm, duplicate IDs, invalid files/schema/records, storage-write preservation and retry, corrupt/blocked storage, changed-journal reconfirmation, cross-tab updates, labels, mobile widths, no external requests.');

  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
