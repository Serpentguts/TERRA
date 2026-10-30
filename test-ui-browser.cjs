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
    assert.equal(await page.locator('#home').isVisible(), true);
    assert.equal(await page.locator('.map-legend').isVisible(), false);
    assert.equal(await page.locator('.map-filters').isVisible(), false);
    assert.equal(await page.locator('#demo-feed, #feed-tab, #profile-tab, #profile-link, .discovery-tabs').count(), 0);
    assert.equal(await page.locator('#discover #profile, #discover a, #discover [role=tab]').count(), 0);
    assert.doesNotMatch(await page.locator('#discover').textContent(), /Profile/);
    assert.equal(await page.locator('#profile').evaluate(el => !el.closest('#discover')), true);
    assert.equal(await page.locator('.site-header a[href="#profile"]').count(), 1);
    const bottom = page.getByRole('navigation', { name: 'Primary', exact: true });
    const destinations = ['map', 'profile', 'feed', 'identify-title', 'genetic-title', 'projects-title'];
    assert.deepEqual(await bottom.locator('a span').allTextContents(), ['Map', 'Profile', 'Feed', 'Observation', 'Genetics', 'Projects / Journal']);
    assert.deepEqual(await bottom.locator('a').evaluateAll(links => links.map(link => link.hash.slice(1))), destinations);
    assert.equal(await bottom.locator('svg[aria-hidden="true"][focusable="false"]').count(), 6);

    // Disclosure navigation uses native buttons/links, not an incomplete ARIA menu.
    const toggle = page.getByRole('button', { name: 'Navigation', exact: true });
    await toggle.focus(); await page.keyboard.press('Enter');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#site-navigation a').count(), 9);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#site-navigation a').first().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Space');
    await page.locator('#site-navigation').getByRole('link', { name: 'Map', exact: true }).click();
    assert.equal(await page.locator('#map').isVisible(), true);
    assert.equal(await page.locator('#home').isVisible(), false);
    assert.equal(await page.locator('#map').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('#map').getAttribute('tabindex'), '-1');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click(); await page.locator('#discover-title').click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click(); await page.getByRole('link', { name: 'Record a discovery', exact: true }).click();
    assert.equal(await page.locator('#form-title').evaluate(el => el === document.activeElement), true);
    await toggle.click(); await page.locator('#site-navigation a').last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');

    // Native bottom links have visible labels, keyboard activation and one current destination.
    await bottom.locator('a').first().focus();
    await page.keyboard.press('Tab');
    assert.equal(await bottom.locator('a').nth(1).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#profile').isVisible(), true);
    assert.equal(await page.locator('.map-legend').isVisible(), false);
    for (const id of destinations) {
      await bottom.locator(`a[href="#${id}"]`).click();
      assert.equal(await page.locator(`#${id}`).evaluate(el => el === document.activeElement), true);
      assert.equal(await bottom.locator('[aria-current="location"]').count(), 1);
      assert.equal(await bottom.locator(`a[href="#${id}"]`).getAttribute('aria-current'), 'location');
      if (id !== 'map') {
        assert.equal(await page.locator('.map-legend').isVisible(), false);
        assert.equal(await page.locator('.map-filters').isVisible(), false);
      }
    }
    // Back/forward and direct links retain the right area and current indicator.
    await page.goBack();
    assert.equal(await bottom.locator('a[href="#genetic-title"]').getAttribute('aria-current'), 'location');
    await page.goForward();
    assert.equal(await bottom.locator('a[href="#projects-title"]').getAttribute('aria-current'), 'location');
    await bottom.locator('a[href="#map"]').click();
    assert.match(await page.locator('.map-legend').textContent(), /Green:.*natural setting.*Yellow:.*cultivated setting.*Red:.*for-sale listing, never an observation/s);
    assert.equal(await page.locator('.map-legend').isVisible(), true);
    assert.equal(await page.locator('#demo-map .demo-card').count(), 6);
    assert.equal(await page.locator('#demo-map .sale').count(), 0);
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
    // Both native dropdowns combine with AND, for observations AND sale listings.
    for (const [purpose, observations, listings] of [['natural', 4, 0], ['cultivated', 2, 0], ['sale', 0, 1], ['all', 6, 1]]) {
      await page.selectOption('#map-purpose', purpose);
      assert.equal(await page.locator('#demo-map .demo-card:visible').count(), observations);
      assert.equal(await page.locator('#demo-listings .demo-card:visible').count(), listings);
    }
    for (const category of ['fungus', 'plant', 'bird', 'reptile', 'mammal', 'insect']) {
      await page.selectOption('#map-organism', category);
      assert.equal(await page.locator('#demo-map .demo-card:visible').count(), 1);
      assert.equal(await page.locator('#demo-listings .demo-card:visible').count(), category === 'plant' ? 1 : 0);
    }
    await page.selectOption('#map-purpose', 'sale');
    assert.equal(await page.locator('#map-empty').isVisible(), true);
    assert.match(await page.locator('#map-results').textContent(), /0 observation markers and 0 for-sale listings/);
    await page.selectOption('#map-organism', 'plant');
    assert.equal(await page.locator('#map-empty').isVisible(), false);
    assert.equal(await page.locator('#demo-listings .demo-card:visible').count(), 1);
    await page.selectOption('#map-purpose', 'natural');
    assert.equal(await page.locator('#map-empty').isVisible(), true);
    await page.locator('#map-reset').click();
    assert.equal(await page.locator('#demo-map .demo-card:visible').count(), 6);
    assert.equal(await page.locator('#map-purpose').inputValue(), 'all');
    assert.equal(await page.locator('#map-organism').inputValue(), 'all');
    await page.locator('#map-purpose').focus();
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#map-purpose').inputValue(), 'natural');
    await page.locator('#map-reset').click();
    await page.evaluate(() => { location.hash = 'home'; });
    await page.waitForFunction(() => !document.getElementById('home').hidden);
    assert.equal(await page.locator('.map-legend').isVisible(), false);
    assert.equal(await page.locator('.map-filters').isVisible(), false);
    await page.goto(origin + '/#feed');
    assert.equal(await page.locator('#feed').isVisible(), true);
    assert.equal(await page.locator('#map').isVisible(), false);
    assert.match(await page.locator('#feed').textContent(), /not connected.*no posts, real follows, uploads, or external services/is);
    assert.equal(await bottom.locator('a[href="#feed"]').getAttribute('aria-current'), 'location');

    // Profile is temporary local UI: no auth/upload/follow backend or storage.
    await toggle.click();
    await page.locator('#site-navigation a[href="#profile"]').click();
    assert.equal(await page.locator('#profile').isVisible(), true);
    assert.equal(await page.locator('#profile').evaluate(el => el === document.activeElement), true);
    assert.match(await page.locator('#profile-help').textContent(), /MOCK profile.*no authentication, upload backend/s);
    assert.equal(await page.locator('.map-legend').isVisible(), false);
    assert.equal(await page.locator('.map-filters').isVisible(), false);
    await page.locator('#profile-observation').fill('<img src=x onerror=alert(1)>');
    const photo = { name: 'mock.png', mimeType: 'image/png', buffer: Buffer.from('local file name demo') };
    await page.setInputFiles('#profile-photos', { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('no') });
    await page.getByRole('button', { name: 'Add to mock profile · local only', exact: true }).click();
    assert.equal(await page.locator('#profile-observations li').count(), 0);
    assert.equal(await page.locator('#profile-photos').evaluate(el => el.checkValidity()), false);
    await page.setInputFiles('#profile-photos', photo);
    await page.getByRole('button', { name: 'Add to mock profile · local only', exact: true }).click();
    assert.equal(await page.locator('#profile-observations li').count(), 1);
    assert.match(await page.locator('#profile-observations').textContent(), /<img.*MOCK.*mock.png/);
    assert.equal(await page.locator('#profile-observations img').count(), 0);
    assert.match(await page.locator('#profile-status').textContent(), /Nothing uploaded or saved/);
    const follow = page.locator('button[aria-label="Mock follow River"]');
    await follow.focus(); await page.keyboard.press('Space');
    assert.equal(await follow.getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#profile-follow-status').textContent(), /1 mock follow.*nobody contacted/);
    await follow.click(); assert.equal(await follow.getAttribute('aria-pressed'), 'false');
    await follow.click();
    assert.deepEqual(await storage(), initial);
    await page.reload();
    assert.equal(await page.locator('#profile').isVisible(), true);
    assert.equal(await page.locator('#profile-observations li').count(), 0);
    assert.equal(await follow.getAttribute('aria-pressed'), 'false');
    await page.locator('#profile-observation').fill('Temporary reset check');
    await page.setInputFiles('#profile-photos', photo);
    await page.getByRole('button', { name: 'Add to mock profile · local only', exact: true }).click();
    await follow.click(); await page.locator('#profile-reset').click();
    assert.equal(await follow.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#profile-observations li').count(), 0);
    await toggle.click(); await page.getByRole('link', { name: 'Profile · local demo', exact: true }).click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await page.goto(origin + '/#home');

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
    assert.equal(await page.locator('#demo-map .demo-card').count(), 6);
    assert.doesNotMatch((await page.locator('#demo-map, #profile').allTextContents()).join(' '), /Keep my notes/);

    // Populated Profile never copies or changes an existing private journal.
    const savedStorage = await storage();
    await bottom.locator('a[href="#profile"]').click();
    await page.locator('#profile-observation').fill('A'.repeat(120));
    await page.setInputFiles('#profile-photos', { ...photo, name: 'long-private-filename-'.repeat(8) + '.png' });
    await page.getByRole('button', { name: 'Add to mock profile · local only', exact: true }).click();
    await follow.click();
    assert.deepEqual(await storage(), savedStorage);
    assert.doesNotMatch(await page.locator('#profile-observations').textContent(), /Keep my notes/);

    // Populated conditional fields, all panels and the open menu fit narrow screens.
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.selectOption('#discovery-context', 'natural');
      await page.selectOption('#discovery-region', 'North America');
      await page.selectOption('#discovery-precision', 'city');
      await page.fill('#discovery-city', 'A long temporary locality label');
      for (const id of destinations) {
        await bottom.locator(`a[href="#${id}"]`).click(); await toggle.click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px ${id}`);
        await page.keyboard.press('Escape');
        const layout = await bottom.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return { bottom: rect.bottom, height: rect.height, position: getComputedStyle(el).position,
            padding: parseFloat(getComputedStyle(document.body).paddingBottom),
            scrollPadding: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
            links: [...el.querySelectorAll('a')].map(a => { const r = a.getBoundingClientRect(); return { width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }) };
        });
        assert.equal(layout.position, 'fixed');
        assert.equal(layout.bottom, 900);
        assert.ok(layout.padding >= layout.height + 16);
        assert.ok(layout.scrollPadding >= layout.height + 16);
        for (const link of layout.links) {
          assert.ok(link.width >= 44 && link.height >= 44);
          assert.ok(link.left >= 0 && link.right <= width && link.top >= 0 && link.bottom <= 900);
        }
      }
      // The last control can scroll completely above the persistent bar.
      const lastControl = page.locator('#genetic-data button').last();
      await lastControl.focus();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      assert.ok((await lastControl.boundingBox()).y + (await lastControl.boundingBox()).height <= (await bottom.boundingBox()).y);
      // Also exercise enlarged text; ResizeObserver must reserve wrapped bar height.
      await bottom.evaluate(el => el.querySelectorAll('a').forEach(a => { a.style.fontSize = '24px'; }));
      await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.body).paddingBottom) - document.getElementById('bottom-navigation').getBoundingClientRect().height - 16) < 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await bottom.evaluate(el => el.querySelectorAll('a').forEach(a => { a.style.fontSize = ''; }));
      await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.body).paddingBottom) - document.getElementById('bottom-navigation').getBoundingClientRect().height - 16) < 1);
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
    assert.equal(await page.locator('#profile-observations li').count(), 0);
    assert.equal(await follow.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await storage(), savedStorage);
    await page.reload();
    assert.equal(await page.locator('#discovery-context-fields').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => window.outbound), []);
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    await context.close();
    console.log('PASS: native context disclosure/clearing, setting handoff/nonpersistence/export/reset, six-destination persistent navigation/hash/history/focus/spacing, Map-only legend/combined filters/empty/reset, mock Profile add/follow/reset/nonpersistence, icons/sale separation, labels/mobile, no GPS or network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
