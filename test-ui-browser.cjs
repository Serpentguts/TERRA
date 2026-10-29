// Start python server.py, then run node test-ui-browser.cjs (Playwright test-only).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const errors = [], network = [];
    const origin = 'http://127.0.0.1:8080';
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(origin + '/') || url.startsWith('blob:')) return route.continue();
      network.push(url); return route.abort();
    });
    await context.addInitScript(() => {
      window.outbound = [];
      for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
        window[api] = function () { window.outbound.push(api); throw Error('No network API expected'); };
      }
      navigator.sendBeacon = () => { window.outbound.push('sendBeacon'); return false; };
      navigator.geolocation.getCurrentPosition = () => { window.outbound.push('GPS'); };
      navigator.geolocation.watchPosition = () => { window.outbound.push('GPS watch'); };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    const storage = () => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    const initial = await storage();

    // Disclosure navigation uses native buttons/links, not an incomplete ARIA menu.
    const toggle = page.getByRole('button', { name: 'Navigation', exact: true });
    await toggle.focus(); await page.keyboard.press('Enter');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#site-navigation a').count(), 8);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#site-navigation a').first().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Space');
    await page.getByRole('link', { name: 'Map · demo', exact: true }).click();
    assert.equal(await page.locator('#map').isVisible(), true);
    assert.equal(await page.locator('#feed').isVisible(), false);
    assert.equal(await page.locator('#map').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('#map').getAttribute('tabindex'), '0');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click(); await page.locator('#discover-title').click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click(); await page.getByRole('link', { name: 'Record a discovery', exact: true }).click();
    assert.equal(await page.locator('#form-title').evaluate(el => el === document.activeElement), true);
    await toggle.click(); await page.locator('#site-navigation a').last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');

    // Tabs support arrows, Home/End, selected state and a single Tab stop.
    await page.locator('#map-tab').focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#feed-tab').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#map-tab').getAttribute('tabindex'), '0');
    assert.equal(await page.locator('#feed-tab').getAttribute('tabindex'), '-1');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#feed').isVisible(), true);
    await page.keyboard.press('Home');
    await page.locator('#map-tab').click();
    assert.match(await page.locator('.map-legend').textContent(), /Green:.*natural setting.*Yellow:.*cultivated setting.*Red:.*for-sale listing, never an observation/s);
    assert.equal(await page.locator('#demo-feed .demo-card').count(), 6);
    assert.equal(await page.locator('#demo-map .demo-card').count(), 6);
    assert.equal(await page.locator('#demo-map .sale, #demo-feed .sale').count(), 0);
    const icons = await page.locator('#demo-map .organism-icon').allTextContents();
    assert.deepEqual(icons, ['🍄', '🌿', '🐦', '🐍', '🐁', '🐞']);
    for (const marker of await page.locator('#demo-map .demo-card').all()) {
      assert.match(await marker.textContent(), /DEMO OBSERVATION/);
      assert.equal(await marker.locator('.organism-icon').getAttribute('aria-hidden'), 'true');
    }
    assert.equal(await page.locator('#demo-listings .sale').count(), 1);
    assert.match(await page.locator('#demo-listings').textContent(), /FOR-SALE LISTING · NOT AN OBSERVATION/);
    assert.equal(await page.locator('#demo-listings a, #demo-listings button').count(), 0);
    assert.equal(new Set(await page.locator('#demo-map .natural, #demo-map .cultivated, #demo-listings .sale').evaluateAll(els => els.map(el => getComputedStyle(el).borderLeftColor))).size, 3);
    assert.deepEqual(await page.evaluate(() => window.outbound), []);
    await page.goto(origin + '/#map');
    assert.equal(await page.locator('#map').isVisible(), true);
    await page.evaluate(() => { location.hash = 'feed'; });
    await page.waitForFunction(() => !document.getElementById('feed').hidden);

    // Both forms start with a single native dropdown. All other location fields
    // are hidden, disabled, unnamed (absent from FormData), and empty.
    for (const prefix of ['identify', 'discovery']) {
      const fieldset = page.locator(`#${prefix}-location`);
      assert.equal(await fieldset.locator('select:visible, input:visible').count(), 1);
      const select = (key, value) => page.selectOption(`#${prefix}-${key}`, value);
      const value = key => page.locator(`#${prefix}-${key}`).inputValue();
      const literal = '<img src=x onerror="window.injected=true">';
      await page.locator(`#${prefix}-context`).focus();
      await page.keyboard.press('n'); await page.keyboard.press('Enter');
      await select('context', 'natural');
      assert.match(await page.locator(`#${prefix}-setting-label`).textContent(), /Habitat/);
      await page.fill(`#${prefix}-setting`, literal);
      await select('region', 'North America'); await select('precision', 'city');
      await page.fill(`#${prefix}-country`, 'Canada'); await page.fill(`#${prefix}-state`, 'Ontario');
      await page.fill(`#${prefix}-city`, 'Private locality');
      await select('precision', 'state');
      assert.equal(await value('city'), '');
      assert.equal(await page.locator(`#${prefix}-city`).isDisabled(), true);
      await select('region', 'Europe');
      for (const key of ['precision', 'country', 'state', 'city']) assert.equal(await value(key), '');
      await select('context', 'cultivated');
      for (const key of ['setting', 'region', 'precision', 'country', 'state', 'city']) assert.equal(await value(key), '');
      assert.match(await page.locator(`#${prefix}-setting-label`).textContent(), /Garden/);
      await page.fill(`#${prefix}-setting`, 'Raised bed');
      await select('context', 'broad');
      assert.equal(await value('setting'), '');
      assert.equal(await page.locator(`#${prefix}-setting`).isVisible(), false);
      await select('region', 'Asia'); await select('precision', 'city');
      await page.fill(`#${prefix}-city`, 'Temporary city');
      await select('context', '');
      assert.equal(await fieldset.locator('select:visible, input:visible').count(), 1);
      for (const key of ['setting', 'region', 'precision', 'country', 'state', 'city']) {
        assert.equal(await value(key), '');
        assert.equal(await page.locator(`#${prefix}-${key}`).isDisabled(), true);
      }
      assert.equal(await fieldset.locator('img').count(), 0);
      assert.equal(await page.evaluate(() => window.injected), undefined);
      assert.equal(await page.evaluate(prefix => {
        const form = document.getElementById(prefix === 'identify' ? 'identification-form' : 'observation-form');
        return [...new FormData(form).keys()].some(key => /context|setting|region|precision|country|state|city/.test(key));
      }, prefix), false);
    }
    assert.deepEqual(await storage(), initial);

    // Confirmed photo handoff carries only active context; changing context
    // invalidates mock results and reset retains an independent discovery draft.
    await page.selectOption('#identify-group', 'plant');
    await page.setInputFiles('#identify-files', { name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1cAAAAASUVORK5CYII=', 'base64') });
    await page.waitForFunction(() => [...document.querySelectorAll('#identify-previews img')].every(img => img.complete && img.naturalWidth));
    await page.locator('#identify-previews select').selectOption('Leaf');
    await page.fill('#identify-date', '2024-02-29');
    await page.selectOption('#identify-context', 'natural');
    await page.fill('#identify-setting', 'Temporary woodland');
    await page.getByRole('button', { name: /Analyze — show MOCK/ }).click();
    await page.selectOption('#identify-context', 'cultivated');
    assert.equal(await page.locator('#identify-output').isVisible(), false);
    assert.equal(await page.locator('#identify-setting').inputValue(), '');
    await page.fill('#identify-setting', 'Temporary greenhouse');
    await page.selectOption('#identify-region', 'Europe');
    await page.selectOption('#identify-precision', 'city');
    await page.fill('#identify-city', 'Temporary locality');
    await page.getByRole('button', { name: /Analyze — show MOCK/ }).click();
    await page.locator('#identify-candidates button').first().click();
    await page.selectOption('#privacy', 'exact'); await page.fill('#notes', 'Keep my notes');
    page.once('dialog', dialog => dialog.accept());
    await page.click('#identify-record');
    assert.equal(await page.locator('#discovery-context').inputValue(), 'cultivated');
    assert.equal(await page.locator('#discovery-setting').inputValue(), 'Temporary greenhouse');
    assert.equal(await page.locator('#discovery-city').inputValue(), 'Temporary locality');
    assert.equal(await page.locator('#privacy').inputValue(), 'exact');
    await page.click('#identify-reset');
    assert.equal(await page.locator('#discovery-city').inputValue(), 'Temporary locality');
    assert.equal(await page.locator('#identify-context-fields').isVisible(), false);
    await page.click('#save-button');
    const records = await page.evaluate(() => JSON.parse(localStorage.getItem('terra.observations.v1')));
    assert.equal(records.length, 1);
    assert.deepEqual(Object.keys(records[0]).sort(), ['date', 'id', 'name', 'notes', 'privacy', 'type']);
    assert.equal(records[0].notes, 'Keep my notes'); assert.equal(records[0].privacy, 'exact');
    assert.equal(await page.locator('#discovery-context-fields').isVisible(), false);
    const downloadPromise = page.waitForEvent('download'); await page.click('#export-button');
    const download = await downloadPromise;
    const fs = require('node:fs/promises');
    const exported = await fs.readFile(await download.path(), 'utf8');
    assert.doesNotMatch(exported, /Temporary greenhouse|Temporary locality|cultivated|"context"|"city"/);
    assert.equal(await page.locator('#demo-feed .demo-card').count(), 6);
    assert.doesNotMatch(await page.locator('#demo-feed').textContent(), /Keep my notes/);

    // Populated conditional fields, both panels and the open menu fit narrow screens.
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.selectOption('#discovery-context', 'natural');
      await page.selectOption('#discovery-region', 'North America');
      await page.selectOption('#discovery-precision', 'city');
      await page.fill('#discovery-city', 'A long temporary locality label');
      for (const id of ['map', 'feed']) {
        await page.click(`#${id}-tab`); await toggle.click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px ${id}`);
        await page.keyboard.press('Escape');
      }
    }
    // Dynamic controls keep unique IDs and explicit accessible labels.
    assert.equal(await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
      return ids.length === new Set(ids).size && [...document.querySelectorAll('label[for]')].every(el => document.getElementById(el.htmlFor));
    }), true);
    assert.deepEqual(await page.evaluate(() => window.outbound), []);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.locator('#discovery-context').inputValue(), '');
    assert.equal(await page.locator('#discovery-city').inputValue(), '');
    await page.reload();
    assert.equal(await page.locator('#discovery-context-fields').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => window.outbound), []);
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    await context.close();
    console.log('PASS: native context disclosure/clearing, setting handoff/nonpersistence/export/reset, keyboard navigation/tabs/hash/focus, demo isolation/icons/legend/sale separation, labels/mobile, no GPS or network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
