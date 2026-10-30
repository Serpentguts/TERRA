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
    const views = [
      ['home', 'Home'], ['map', 'Map'], ['profile', 'Profile'], ['feed', 'Feed'],
      ['identify-title', 'Explore a photo'], ['form-title', 'Record a discovery'],
      ['saved-title', 'Your observations'], ['projects-title', 'Projects / Field Summary'],
      ['genetic-title', 'Genetic Data']
    ];
    assert.equal(await page.locator('.close-view').count(), views.length);
    assert.deepEqual(await menu.locator('a').evaluateAll(links => links.map(link => link.hash.slice(1)).sort()), views.map(([id]) => id).sort());
    for (const [id, label] of views) {
      await toggle.click(); await menu.locator(`a[href="#${id}"]`).click();
      const target = page.locator(`#${id}`);
      assert.equal(await target.isVisible(), true);
      const close = page.getByRole('button', { name: `Close ${label} view`, exact: true });
      const sectionId = await close.getAttribute('aria-controls');
      assert.equal(await close.getAttribute('aria-describedby'), 'view-stack-help');
      assert.equal(await close.getAttribute('type'), 'button');
      const size = await close.boundingBox();
      assert.ok(size.width >= 44 && size.height >= 44);
      // Every control supports native keyboard activation, hides only its view,
      // and returns focus to a visible reopen control rather than hidden content.
      await close.focus(); await page.keyboard.press(id === 'profile' ? 'Space' : 'Enter');
      assert.equal(await page.locator(`#${sectionId}`).isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.closest('[hidden]') === null), true);
      assert.equal(await page.evaluate(() => document.activeElement.matches('#navigation-toggle, #bottom-navigation a')), true);
      assert.match(await page.locator('#view-stack-status').textContent(), /view closed\. No data deleted/);
      assert.equal(await bottom.isVisible(), true);
      assert.deepEqual(await storage(), initial);
      await toggle.click(); await menu.locator(`a[href="#${id}"]`).click();
      assert.equal(await target.isVisible(), true);
      assert.equal(await page.locator(`#${sectionId} .close-view`).count(), 1);
    }
    // Opening Profile adds it to the stack, rather than evicting Map.
    await bottom.locator('a[href="#map"]').click();
    await bottom.locator('a[href="#profile"]').click();
    assert.equal(await page.locator('#map').isVisible(), true);
    await page.locator('#profile-observation').fill('Unsubmitted mock draft');
    await page.getByRole('button', { name: 'Mock follow River', exact: true }).click();
    await page.getByRole('button', { name: 'Close Profile view', exact: true }).click();
    assert.equal(await page.locator('#map').isVisible(), true);
    await bottom.locator('a[href="#profile"]').click();
    assert.equal(await page.locator('#profile-observation').inputValue(), 'Unsubmitted mock draft');
    assert.equal(await page.getByRole('button', { name: 'Mock follow River', exact: true }).getAttribute('aria-pressed'), 'true');
    // Closing forms is not a reset, save, delete, project completion or image removal.
    await page.locator('#name').fill('Unsaved discovery');
    await page.locator('#notes').fill('Unsaved notes');
    await page.locator('#project-title').fill('Unsaved project edit');
    await page.locator('#genetic-query').fill('Temporary query');
    const photo = { name: 'tiny.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64') };
    await page.setInputFiles('#photo', photo);
    await page.waitForFunction(() => document.querySelector('#photo-preview').naturalWidth > 0);
    const previewUrl = await page.locator('#photo-preview').getAttribute('src');
    for (const label of ['Explore a photo', 'Record a discovery', 'Your observations', 'Projects / Field Summary', 'Genetic Data']) {
      await page.getByRole('button', { name: `Close ${label} view`, exact: true }).click();
    }
    await bottom.locator('a[href="#identify-title"]').click();
    assert.equal(await page.locator('#name').isVisible(), true); // Observation reopens both sections.
    assert.equal(await page.locator('#name').inputValue(), 'Unsaved discovery');
    assert.equal(await page.locator('#notes').inputValue(), 'Unsaved notes');
    assert.equal(await page.locator('#photo-preview').getAttribute('src'), previewUrl);
    assert.equal(await page.locator('#photo-preview').evaluate(img => img.naturalWidth > 0), true);
    await bottom.locator('a[href="#projects-title"]').click();
    assert.equal(await page.locator('#observation-list').isVisible(), true); // Projects / Journal reopens both.
    assert.equal(await page.locator('#project-title').inputValue(), 'Unsaved project edit');
    await bottom.locator('a[href="#genetic-title"]').click();
    assert.equal(await page.locator('#genetic-query').inputValue(), 'Temporary query');
    assert.deepEqual(await storage(), initial);
    // Saved discovery subsection, unknown even after a manually supplied name.
    const history = page.locator('#observation-list .identification-history');
    assert.equal(await history.count(), 1);
    assert.equal(await history.locator('summary').textContent(), 'Identification provenance');
    assert.equal(await history.locator('p').isVisible(), false);
    await history.locator('summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await history.locator('p').isVisible(), true);
    assert.equal(await history.locator('p').textContent(), 'No identification history yet');
    assert.doesNotMatch(await history.textContent(), /AI-suggested|community-identified|expert-confirmed|consensus/);
    assert.equal(await page.locator('nav a[href*="identification"], #identification-plan, #observation-form .identification-history').count(), 0);
    assert.deepEqual(await storage(), initial);
    // All views can be closed at once; all essential destinations remain reachable.
    for (const [, label] of views) await page.getByRole('button', { name: `Close ${label} view`, exact: true }).click();
    assert.equal(await page.locator('.close-view:visible').count(), 0);
    assert.equal(await bottom.locator('a:visible').count(), 6);
    for (const link of await bottom.locator('a').all()) {
      await link.click();
      assert.equal(await page.locator(await link.getAttribute('href')).isVisible(), true);
    }
    // Direct hashes and back/forward reopen closed destinations too.
    await page.getByRole('button', { name: 'Close Profile view', exact: true }).click();
    await page.evaluate(() => { location.hash = 'profile'; });
    await page.waitForFunction(() => !document.getElementById('profile').hidden);
    await bottom.locator('a[href="#feed"]').click();
    await page.goBack();
    assert.equal(await page.locator('#profile').isVisible(), true);
    await page.goForward();
    assert.equal(await page.locator('#feed').isVisible(), true);
    // Narrow layout: close controls remain within the viewport and keyboard reachable.
    await page.setViewportSize({ width: 320, height: 700 });
    for (const close of await page.locator('.close-view:visible').all()) {
      await close.focus();
      const box = await close.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 320);
    }
    assert.deepEqual(await storage(), initial);
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: all nine views close/reopen, keyboard/focus/targets/mobile, persistent grouped navigation, stack coexistence/history, drafts/images/journal/projects retained, saved-discovery neutral provenance.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
