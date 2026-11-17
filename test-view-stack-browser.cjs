// Start python server.py, then run node test-view-stack-browser.cjs (Playwright test-only).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const origin = 'http://127.0.0.1:8080';
    const journal = [{ id: 'legacy', type: 'plant', name: 'Manual name', notes: 'Keep my notes', date: '2026-10-01', privacy: 'hidden' }];
    const projects = [{ id: 'project', title: 'Keep project', type: 'custom', date: '', species: '', site: '', notes: '', observationIds: ['legacy'], complete: false }];
    const errors = [], outbound = [];
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(origin + '/') || url.startsWith('blob:')) return route.continue();
      // Map images are expected while a map is on screen; answer them with a blank tile.
      if (/^https:\/\/([abc]\.)?tile\.(openstreetmap|opentopomap)\.org\//.test(url)) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
      outbound.push(url); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.evaluate(({ journal, projects }) => {
      localStorage.setItem('terra.observations.v1', JSON.stringify(journal));
      localStorage.setItem(FieldSummary.KEY, FieldSummary.encode(projects));
    }, { journal, projects });
    await page.reload();
    const storage = () => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    const initial = await storage();
    const menu = page.locator('#site-navigation');
    const toggle = page.getByRole('button', { name: 'Navigation', exact: true });
    const bottom = page.getByRole('navigation', { name: 'Primary', exact: true });
    const onScreen = selector => page.locator(selector).first().evaluate(el => el.checkVisibility());
    const screens = { home: '#page-title', journal: '#saved-title', projects: '#projects-title', record: '#form-title', photo: '#identify-title',
      map: '#map-title', profile: '#profile-title', feed: '#feed-title', genetics: '#genetic-title' };
    // Opens on Home, with no other screen showing.
    assert.equal(await onScreen('#home-dashboard'), true);
    for (const [name, heading] of Object.entries(screens)) if (name !== 'home') assert.equal(await onScreen(heading), false, name);
    assert.equal(await page.locator('.close-view, .minimize-view, #workspace').count(), 0, 'Old view-stack controls removed');
    // Every screen in the menu shows exactly its own content, starting at the top.
    for (const [name, heading] of Object.entries(screens)) {
      await page.evaluate(() => window.scrollTo(0, 400));
      await toggle.click(); await menu.locator(`a[href="#${name}"]`).click();
      for (const [other, otherHeading] of Object.entries(screens)) assert.equal(await onScreen(otherHeading), other === name, `${name} shows ${other}?`);
      assert.equal(await page.locator(heading).evaluate(el => el === document.activeElement), true, `${name} focuses its heading`);
      assert.equal(await page.evaluate(() => scrollY), 0, `${name} starts at the top`);
      assert.equal(await onScreen('#screen-bar'), name !== 'home');
      if (name !== 'home') assert.equal(await page.locator('#view-stack-status').textContent(), `${(await page.title()).replace(' · TERRA', '')} screen`);
      assert.equal(await bottom.isVisible(), true);
      assert.deepEqual(await storage(), initial);
    }
    // The terrarium link opens Profile on the Terrarium tab.
    await toggle.click(); await menu.locator('a[href="#terrarium"]').click();
    assert.equal(await onScreen('#profile-awards'), true);
    assert.equal(await page.locator('#awards-tab').getAttribute('aria-selected'), 'true');
    // Switching screens is not a reset, save, delete, project completion or image removal.
    await bottom.locator('a[href="#profile"]').click();
    await page.locator('#profile-edit > summary').click();
    await page.locator('#profile-description').fill('Unsubmitted local profile draft');
    await bottom.locator('a[href="#record"]').click();
    await page.locator('#name').fill('Unsaved discovery');
    await page.locator('#notes').fill('Unsaved notes');
    const photo = { name: 'tiny.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64') };
    await page.setInputFiles('#photo', photo);
    await page.waitForFunction(() => document.querySelector('#photo-preview').naturalWidth > 0);
    const previewUrl = await page.locator('#photo-preview').getAttribute('src');
    await bottom.locator('a[href="#journal"]').click();
    await page.locator('.segmented a[href="#projects"]').first().click();
    await page.locator('#project-title').fill('Unsaved project edit');
    await toggle.click(); await menu.locator('a[href="#genetics"]').click();
    await page.locator('#genetic-query').fill('Temporary query');
    for (const name of ['map', 'home', 'profile']) await bottom.locator(`a[href="#${name}"]`).click();
    assert.equal(await page.locator('#profile-description').inputValue(), 'Unsubmitted local profile draft');
    await bottom.locator('a[href="#record"]').click();
    assert.equal(await page.locator('#name').inputValue(), 'Unsaved discovery');
    assert.equal(await page.locator('#notes').inputValue(), 'Unsaved notes');
    assert.equal(await page.locator('#photo-preview').getAttribute('src'), previewUrl);
    assert.equal(await page.locator('#photo-preview').evaluate(img => img.naturalWidth > 0), true);
    await page.goto(origin + '/#projects');
    assert.equal(await page.locator('#project-title').inputValue(), 'Unsaved project edit');
    // Saved discovery subsection, unknown even after a manually supplied name.
    await page.goto(origin + '/#journal');
    const history = page.locator('#observation-list .identification-history');
    assert.equal(await history.count(), 1);
    assert.equal(await history.locator('summary').textContent(), 'Identification provenance');
    assert.equal(await history.locator('p').isVisible(), false);
    await history.locator('summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await history.locator('p').isVisible(), true);
    assert.equal(await history.locator('p').textContent(), 'No identification history yet');
    assert.doesNotMatch(await history.textContent(), /AI-suggested|community-identified|expert-confirmed|consensus/);
    assert.equal(await page.locator('nav a[href*="identification"], #identification-plan, #observation-form .identification-history').count(), 0);
    // Direct hashes, back/forward and the in-app back link.
    await page.goto(origin + '/#profile');
    assert.equal(await onScreen('#profile'), true);
    await bottom.locator('a[href="#map"]').click();
    await page.goBack();
    assert.equal(await onScreen('#profile'), true);
    assert.equal(await onScreen('#map'), false);
    await page.goForward();
    assert.equal(await onScreen('#map'), true);
    // The back link is labelled with its parent screen and goes there.
    assert.equal(await page.locator('#screen-back').textContent(), '← Home');
    await page.click('#screen-back');
    assert.equal(await onScreen('#home-dashboard'), true);
    // When the previous screen is the parent, it steps back through history instead.
    await bottom.locator('a[href="#journal"]').click();
    await page.locator('.segmented a[href="#projects"]').first().click();
    const depth = await page.evaluate(() => history.length);
    await page.click('#screen-back');
    await page.waitForFunction(() => location.hash === '#journal');
    assert.equal(await onScreen('#saved-title'), true);
    await page.goForward();
    assert.equal(await onScreen('#projects-title'), true, 'Forward still returns to Projects');
    assert.equal(await page.evaluate(() => history.length), depth);
    await page.goto(origin + '/#photo');
    await page.click('#screen-back');
    assert.equal(await onScreen('#form-title'), true, 'Without history, back goes up to the parent screen');
    // Saving shows a confirmation with a way to the journal.
    await page.locator('#name').fill('Toast check');
    await page.selectOption('#privacy', 'exact');
    await page.fill('#observation-map-x1', '12'); await page.fill('#observation-map-y1', '34');
    await page.locator('#observation-map').getByRole('button', { name: 'Apply map selection' }).click();
    await page.locator('#observation-form [type="submit"]').click();
    assert.equal(await onScreen('#toast'), true);
    assert.match(await page.locator('#toast').textContent(), /Saved “Toast check” to your journal\.\s+View journal/);
    await page.locator('#toast a').click();
    assert.equal(await onScreen('#saved-title'), true);
    // Home summarizes the journal and points at the next terrarium item.
    await bottom.locator('a[href="#home"]').click();
    assert.equal(await page.locator('#home-count').textContent(), '2');
    assert.equal(await page.locator('#home-recent li').count(), 2);
    assert.match(await page.locator('#home-next').textContent(), /Next for your terrarium/);
    // Location context: County sits between State and City.
    await bottom.locator('a[href="#record"]').click();
    await page.selectOption('#discovery-context', 'natural'); await page.selectOption('#discovery-region', 'North America');
    await page.selectOption('#discovery-precision', 'county');
    assert.deepEqual([await onScreen('#discovery-state'), await onScreen('#discovery-county'), await onScreen('#discovery-city')], [true, true, false]);
    await page.selectOption('#discovery-precision', 'city');
    assert.deepEqual([await onScreen('#discovery-county'), await onScreen('#discovery-city')], [true, true]);
    assert.deepEqual(await page.locator('#discovery-manual-location label').allTextContents(),
      ['Country / territory (optional, temporary)', 'State / province (optional, temporary)', 'County / district (optional, temporary)', 'City / locality (optional, temporary)']);
    await page.selectOption('#discovery-precision', 'state');
    assert.equal(await onScreen('#discovery-county'), false);
    // The location picker is a real map with a style switch.
    await page.waitForFunction(() => document.querySelector('#observation-map .leaflet-container'));
    assert.equal(await page.locator('#observation-map .basemap-switch button').count(), 3);
    // Narrow layout: tab bar fits and no screen scrolls sideways.
    await page.setViewportSize({ width: 320, height: 700 });
    for (const name of ['home', 'journal', 'record', 'map', 'profile']) {
      await bottom.locator(`a[href="#${name}"]`).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name);
      for (const box of await bottom.locator('a').evaluateAll(links => links.map(a => a.getBoundingClientRect().toJSON()))) assert.ok(box.left >= 0 && box.right <= 320 && box.width >= 44);
    }
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: one screen at a time, every screen/heading/focus/scroll, tab and menu routing, Terrarium link, drafts/images kept across screens, deep links/back/forward/back link, saved toast, Home summary, saved-discovery neutral provenance, narrow layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
