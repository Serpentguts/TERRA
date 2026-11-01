const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const errors = [], outbound = [];
    const origin = 'http://127.0.0.1:8080';
    await context.route('**/*', route => {
      if (route.request().url().startsWith(origin + '/')) return route.continue();
      outbound.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = () => { throw Error('No GPS allowed'); };
      for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[key] = () => { throw Error('No external API'); };
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const J = 'terra.observations.v1', P = 'terra.projects.v1', R = 'terra.rewards.v1', U = 'terra.profile.v1';
    const state = key => page.evaluate(k => localStorage.getItem(k), key);
    const rewards = async () => JSON.parse(await state(R));
    const record = day => ({ id: `r${day}`, type: 'fungus', name: `Local <plant> ${day}`, date: `2024-02-0${day}`, notes: 'Private notes', privacy: 'hidden' });
    const project = { id: 'p1', title: 'My collection', type: 'custom', date: '', site: '', species: '', notes: '', complete: false, observationIds: ['r1'] };
    await page.goto(origin);
    assert.equal(await state(R), null, 'No empty-store startup rewrite');
    assert.equal(await state(U), null);
    await page.click('#bottom-navigation a[href="#map"]');
    assert.equal(await page.evaluate(() => {
      const before = (a, b) => Boolean(document.querySelector(a).compareDocumentPosition(document.querySelector(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
      return before('#map-canvas', '.map-filters') && before('.map-filters', '.map-legend');
    }), true);
    await page.selectOption('#map-organism', ['fungus', 'plant']);
    await page.selectOption('#map-purpose', ['natural', 'cultivated']);
    assert.equal(await page.locator('#demo-map .demo-card:visible').count(), 2);
    assert.equal(await page.locator('#demo-listings .demo-card:visible').count(), 0);
    assert.match(await page.locator('#map-selected').textContent(), /natural, cultivated.*fungus, plant/);
    await page.selectOption('#map-purpose', ['cultivated', 'sale']);
    assert.equal(await page.locator('#demo-map .demo-card:visible').count(), 1);
    assert.equal(await page.locator('#demo-listings .demo-card:visible').count(), 1);
    await page.selectOption('#map-organism', []); await page.selectOption('#map-purpose', []);
    assert.equal(await page.locator('#demo-map .demo-card:visible').count(), 6);
    await page.selectOption('#map-purpose', ['all', 'sale']);
    assert.equal(await page.locator('#demo-map .demo-card:visible').count(), 6, 'All explicitly overrides individual choices');
    await page.click('#map-reset');
    assert.match(await page.locator('#map-selected').textContent(), /colors: all.*organisms: all/);
    assert.equal(await state(J), null);

    // One native searchable dropdown; old schema keys survive all eight labels.
    assert.equal(await page.locator('#observation-form input[type="radio"]').count(), 0);
    assert.equal(await page.locator('#organism-options option').count(), 8);
    await page.fill('#organism-choice', 'invented');
    assert.equal(await page.locator('#organism-choice').evaluate(el => el.checkValidity()), false);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('terra:prefill-discovery', { detail: {
      name: 'Reviewed label', type: 'fungus', date: '2024-02-01', location: {},
      files: [new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0))], 'review.png', { type: 'image/png' })]
    } })));
    assert.equal(await page.locator('#organism-choice').inputValue(), 'Mushroom');
    assert.equal(await page.locator('#organism-choice').evaluate(el => el.checkValidity()), true, 'Handoff clears previous invalid dropdown state');
    await page.fill('#organism-choice', 'mushroom');
    await page.fill('#name', 'First local entry'); await page.fill('#date', '2024-02-01');
    await page.selectOption('#privacy', 'exact');
    await page.evaluate(() => TerraMaps.observation.select(20, 20));
    await page.click('#save-button');
    assert.equal(JSON.parse(await state(J))[0].type, 'fungus');
    assert.equal((await rewards()).grants.length, 1);
    assert.match(await page.locator('#profile-observations').textContent(), /First local entry/);
    const first = await state(R);
    for (let n = 0; n < 5; n++) await page.evaluate(() => document.dispatchEvent(new Event('terra:journal-rendered')));
    assert.equal(await state(R), first);
    await page.reload(); assert.equal(await state(R), first);

    // Profile tabs, unverified text and persistence; never copy journal or project records.
    await page.click('#bottom-navigation a[href="#profile"]');
    await page.locator('#profile > details > summary').click();
    await page.fill('#profile-display-name', '<img src=x> Explorer');
    await page.fill('#profile-description', 'My local fieldbook');
    await page.fill('#profile-credential-input', 'Self-described botanist');
    await page.selectOption('#profile-avatar-input', '🍄');
    await page.click('#profile-form button');
    assert.equal(await page.locator('#profile-name img').count(), 0);
    assert.match(await page.locator('#profile-credentials').textContent(), /Self-described botanist.*user-entered \/ unverified/);
    const profile = await state(U);
    assert.doesNotMatch(profile, /First local entry|observationIds|location|Private notes/);
    await page.locator('#posts-tab').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#projects-tab').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#awards-tab').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#profile-posts').isVisible(), false);
    assert.match(await page.locator('#profile-awards').textContent(), /no genuine verification evidence/);
    assert.match(await page.locator('#profile-awards').textContent(), /No cash, trade, NFT, blockchain or financial value/);
    await page.locator('#decor-list button').click();
    assert.equal((await rewards()).grants[0].placed, false);
    assert.equal(await page.locator('#decor-list button').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('#rewards-terrarium span').count(), 0);
    await page.reload(); assert.equal(await state(U), profile);
    await page.click('#awards-tab');
    assert.equal((await rewards()).grants[0].placed, false);
    await page.locator('#decor-list button').click();
    assert.equal((await rewards()).grants[0].token, JSON.parse(first).grants[0].token);

    // Legacy six-field journal + ID-only projects unchanged; dates count once, not events.
    const week = Array.from({ length: 7 }, (_, i) => record(i + 1));
    await page.evaluate(({ J, P, week, project }) => {
      localStorage.setItem(J, JSON.stringify(week));
      localStorage.setItem(P, JSON.stringify({ format: 'terra-projects', version: 1, projects: [project] }));
    }, { J, P, week, project });
    const journalRaw = await state(J), projectRaw = await state(P);
    await page.reload();
    assert.equal(await state(J), journalRaw); assert.equal(await state(P), projectRaw);
    assert.deepEqual((await rewards()).grants.map(g => g.badge), ['first', 'week']);
    assert.equal(await page.locator('#profile-observations li').count(), 7);
    assert.equal(await page.locator('#profile-observations plant').count(), 0);
    assert.doesNotMatch(await page.locator('#profile-observations').textContent(), /Private notes/);
    await page.selectOption('#project-select', 'p1'); await page.click('#project-toggle');
    assert.equal((await rewards()).grants.length, 3);
    const completeRewards = await state(R);
    await page.click('#project-toggle'); await page.click('#project-toggle');
    assert.equal(await state(R), completeRewards, 'Reopen/complete cannot farm rewards');
    page.on('dialog', d => d.accept());
    await page.locator('#observation-list > li').first().getByRole('button', { name: /Delete/ }).click();
    assert.equal(await page.locator('#profile-observations li').count(), 6);
    await page.locator('#trash-list').getByRole('button', { name: /Restore/ }).click();
    assert.equal(await page.locator('#profile-observations li').count(), 7);
    assert.equal(await state(R), completeRewards, 'Delete/restore cannot farm rewards');

    // Non-destructive minimized stack, overview states, repeated same-hash reopening.
    await page.fill('#notes', 'Unsaved workspace draft');
    const formView = page.locator('#form-title').locator('xpath=ancestor::section[1]');
    await formView.locator('.minimize-view').click();
    assert.equal(await page.locator('#notes').isVisible(), false);
    await page.click('#bottom-navigation a[href="#workspace"]');
    assert.match(await page.locator('#workspace-views').textContent(), /Record a discovery · minimized/);
    await page.click('#workspace-views a[href="#form-title"]');
    assert.equal(await page.locator('#notes').inputValue(), 'Unsaved workspace draft');
    assert.equal(await page.locator('#notes').isVisible(), true);
    await formView.locator('.close-view').click();
    assert.match(await page.locator('#workspace-views').textContent(), /Record a discovery · closed/);
    await page.click('#workspace-views a[href="#form-title"]');
    await formView.locator('.minimize-view').click();
    await page.click('#bottom-navigation a[href="#identify-title"]');
    assert.equal(await page.locator('#notes').isVisible(), true, 'Grouped destinations expand minimized related draft');
    assert.equal(await page.locator('#notes').inputValue(), 'Unsaved workspace draft');
    await page.click('#workspace-close');
    assert.equal(await page.locator('#workspace').isVisible(), false);
    assert.equal(await page.locator('#bottom-navigation a:visible').count(), 7);
    assert.equal(await state(R), completeRewards);

    // Cross-tab changes refresh derived views and profile without duplicate grants.
    const other = await context.newPage(); await other.goto(origin);
    await other.evaluate(({ J, U }) => {
      const records = JSON.parse(localStorage.getItem(J)); records.pop(); localStorage.setItem(J, JSON.stringify(records));
      const p = JSON.parse(localStorage.getItem(U)); p.name = 'Other tab'; localStorage.setItem(U, JSON.stringify(p));
    }, { J, U });
    await page.waitForFunction(() => document.querySelector('#profile-name').textContent === 'Other tab');
    assert.equal(await page.locator('#profile-observations li').count(), 6);
    assert.equal(await state(R), completeRewards);
    await other.close();

    // Failure isolation: failed reward write cannot undo journal; retry does not duplicate.
    const failureContext = await browser.newContext();
    const failure = await failureContext.newPage(); await failure.goto(origin);
    await failure.evaluate(({ J, P, U, journal, projects, profile }) => {
      localStorage.setItem(J, journal); localStorage.setItem(P, projects); localStorage.setItem(U, profile);
    }, { J, P, U, journal: await state(J), projects: await state(P), profile: await state(U) });
    await failure.evaluate(({ R, U }) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if ([R, U].includes(key)) throw Error('Quota'); return original.call(this, key, value); };
      document.dispatchEvent(new Event('terra:journal-rendered'));
    }, { R, U });
    assert.match(await failure.locator('#rewards-status').textContent(), /could not be saved/);
    assert.equal(await failure.evaluate(k => localStorage.getItem(k), R), null);
    assert.equal(JSON.parse(await state(J)).length, 6);
    await failure.goto(origin + '/#profile'); await failure.reload();
    assert.equal(await failure.evaluate(R => JSON.parse(localStorage.getItem(R)).grants.length, R), 2, 'Six remaining days + complete project: first and project only');
    await failure.locator('#profile > details > summary').click();
    await failure.fill('#profile-description', 'Kept failed draft');
    await failure.evaluate(U => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === U) throw Error('Quota'); return original.call(this, key, value); }; }, U);
    await failure.click('#profile-form button');
    assert.match(await failure.locator('#profile-status').textContent(), /could not be saved.*Draft kept/);
    assert.equal(await failure.locator('#profile-description').inputValue(), 'Kept failed draft');
    await failureContext.close();

    // Corruption is never silently reset. Forged verification metadata gets no badge.
    await page.evaluate(({ R, U }) => { localStorage.setItem(R, '{bad'); localStorage.setItem(U, '{bad'); }, { R, U });
    await page.reload();
    assert.equal(await state(R), '{bad'); assert.equal(await state(U), '{bad');
    assert.match(await page.locator('#rewards-status').textContent(), /unavailable/);
    assert.equal(await page.locator('#profile-form button').isDisabled(), true);
    assert.equal(await page.locator('#rewards-terrarium span').count(), 0);
    await page.goto(origin + '/#workspace'); await page.reload();
    assert.equal(await page.locator('#workspace').isVisible(), true);
    assert.equal(await page.locator('#bottom-navigation a[href="#workspace"]').getAttribute('aria-current'), 'location');
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
    await context.close();
    console.log('PASS: multi-select union/intersection/order/reset, searchable groups, same-source profile/tabs/credentials, three awards/random decor/placement/reload, duplicate-event/completion/trash farming prevention, legacy schema, cross-tab updates, nav minimize/close/reopen, quota/corrupt-store isolation, no network/GPS.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
