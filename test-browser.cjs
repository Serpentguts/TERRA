// Optional development check: npm install --no-save --package-lock=false playwright
// Start python3 server.py, then run node test-browser.cjs.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    const key = 'terra.observations.v1';
    await page.goto('http://127.0.0.1:8080');
    assert.equal(await page.locator('#empty-state').isVisible(), true);
    assert.equal(await page.locator('#date').inputValue(), await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }));
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
    await second.close();
    // Simulate quota exhaustion; form and saved records must survive.
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
    await page.fill('#name', 'Keep this draft');
    await page.click('#save-button');
    assert.equal(await page.locator('#form-error').isVisible(), true);
    assert.equal(await page.locator('#name').inputValue(), 'Keep this draft');
    assert.equal(await page.locator('.observation-card').count(), 3);
    await page.reload();
    // Corrupt storage must not be silently overwritten.
    await page.evaluate(k => localStorage.setItem(k, '{broken'), key);
    await page.reload();
    assert.equal(await page.locator('#storage-error').isVisible(), true);
    assert.equal(await page.locator('#save-button').isDisabled(), true);
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
    }
    assert.equal(await page.getByLabel('Observation date', { exact: true }).count(), 1);
    assert.equal(await page.getByLabel('Location privacy preference', { exact: true }).count(), 1);
    assert.deepEqual(errors, []);
    assert.equal(requests.every(url => url.startsWith('http://127.0.0.1:8080/') || url.startsWith('blob:')), true);
    await context.close();
    console.log('PASS: save/reload, Unknown, safe text, previews, privacy, JSON export, confirmed deletion, cross-tab updates, quota/corrupt/blocked storage, labels, mobile widths, no external requests.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
