// Run with Flask on :8080. Two people, two browsers: Ada shares her jar, Ben visits it from the
// link and leaves a seed gift; Ada opens the gift link and plants it once. Also: visiting changes
// nothing in Ben's own jar, one gift per friend per day, wrong-jar and broken links. No network.
require('./test-screens.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const origin = 'http://127.0.0.1:8080', errors = [], outbound = [];
    const person = async name => {
      const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
      await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : (outbound.push(route.request().url()), route.abort()));
      await context.addInitScript(() => { for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[api] = () => { throw Error('No network'); }; });
      const page = await context.newPage();
      await page.clock.install({ time: new Date(2024, 2, 13, 12, 0, 0) });
      page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
      page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
      return { context, page };
    };
    const rec = (id, date, nm, type = 'other') => ({ id, type, name: nm, notes: 'Secret note: behind the old mill', date, privacy: 'exact', location: { version: 1, space: 'terra-geo-v1', kind: 'point', x: -122.41234, y: 37.77654 } });
    const debug = page => page.evaluate(() => TerraTerrarium.debug());

    // Ada's jar.
    const ada = await person('Ada');
    await ada.page.goto(origin + '/#home');
    await ada.page.evaluate(r => {
      localStorage.setItem('terra.observations.v1', JSON.stringify(r));
      localStorage.setItem('terra.profile.v1', JSON.stringify({ version: 1, name: 'Ada', bio: '', credentials: '', avatar: 'fern' }));
    }, [rec('a1', '2024-03-10', 'Pacific tree frog'), rec('a2', '2024-03-11', 'Pacific tree frog'), rec('a3', '2024-03-12', 'Pacific tree frog'), rec('a4', '2024-03-13', 'Bumble bee', 'insect')]);
    await ada.page.goto(origin + '/#terrarium');
    await ada.page.click('#share-jar');
    await ada.page.locator('#link-dialog[open]').waitFor();
    assert.match(await ada.page.locator('#link-text').textContent(), /never includes locations, notes, dates or photos/);
    const jarLink = await ada.page.inputValue('#link-input');
    assert.match(jarLink, /^http:\/\/127\.0\.0\.1:8080\/\?visit=[zp]1\.[A-Za-z0-9_-]+#terrarium$/);
    const adaJarId = await ada.page.evaluate(() => JSON.parse(localStorage.getItem('terra.gifts.v1')).jarId);
    await ada.page.keyboard.press('Escape');

    // Ben visits from the link.
    const ben = await person('Ben');
    await ben.page.goto(origin + '/#home');
    await ben.page.evaluate(r => localStorage.setItem('terra.observations.v1', JSON.stringify(r)), [{ ...rec('b1', '2024-03-12', 'Turkey tail', 'fungus'), notes: "Ben's own note", location: { version: 1, space: 'terra-geo-v1', kind: 'point', x: 2.35, y: 48.85 } }]);
    await ben.page.goto(origin + '/#terrarium');
    const benBefore = await ben.page.evaluate(() => JSON.stringify({ ...localStorage }));
    await ben.page.goto(jarLink);
    await ben.page.locator('#visit-banner:not([hidden])').waitFor();
    assert.match(await ben.page.locator('#visit-banner').textContent(), /Visiting Ada's jar.*Level \d · .* · 2 species · \d items? · shared 2024-03-13/);
    let d = await debug(ben.page);
    assert.deepEqual(d.residents.filter(r => r.id.startsWith('s:visit-')).map(r => r.kind).sort(), ['bee', 'frog']);
    assert.equal(await ben.page.locator('#share-row').isVisible(), false, "Ben's own controls are hidden while visiting");
    assert.equal(await ben.page.locator('#dex-cards').isVisible(), false);
    const page = await ben.page.content();
    assert.doesNotMatch(page.replace(/<script[\s\S]*?<\/script>/g, ''), /old mill|-122\.41234/, 'no notes or locations travel in the link');
    // Leave a gift.
    await ben.page.click('#visit-gift');
    await ben.page.locator('#gift-dialog[open]').waitFor();
    await ben.page.check('#gift-seeds input[value="tulip"]', { force: true });
    await ben.page.fill('#gift-from', 'Ben');
    await ben.page.fill('#gift-note', 'Loved your frogs! 🐸');
    await ben.page.click('#gift-create');
    await ben.page.locator('#link-dialog[open]').waitFor();
    const giftLink = await ben.page.inputValue('#link-input');
    assert.match(giftLink, /\?gift=[zp]1\./);
    await ben.page.keyboard.press('Escape');
    // One gift per friend per day.
    await ben.page.click('#visit-gift');
    await ben.page.click('#gift-create');
    assert.match(await ben.page.locator('#gift-status').textContent(), /already left Ada a gift today/);
    await ben.page.keyboard.press('Escape');
    // Back home: Ben's own jar is untouched (only his gift log changed).
    await ben.page.click('#visit-leave');
    assert.equal(await ben.page.locator('#visit-banner').isVisible(), false);
    d = await debug(ben.page);
    assert.deepEqual(d.residents.filter(r => r.id.startsWith('s:')).map(r => r.kind), ['shelf']);
    const benAfter = JSON.parse(await ben.page.evaluate(() => JSON.stringify({ ...localStorage })));
    const before = JSON.parse(benBefore);
    for (const k of Object.keys(before)) if (!['terra.gifts.v1', 'terra.terrarium.v1'].includes(k)) assert.equal(benAfter[k], before[k], k);
    assert.equal(JSON.parse(benAfter['terra.gifts.v1']).sent[adaJarId], '2024-03-13');
    // A gift for Ada can't be planted in Ben's jar.
    await ben.page.goto(giftLink);
    await ben.page.locator('#gift-received[open]').waitFor();
    assert.equal(await ben.page.locator('#received-plant').isDisabled(), true);
    assert.match(await ben.page.locator('#received-status').textContent(), /made for someone else's jar/);

    // Ada opens the gift and plants it, once.
    await ada.page.goto(giftLink);
    await ada.page.locator('#gift-received[open]').waitFor();
    assert.match(await ada.page.locator('#received-title').textContent(), /Ben sent you a tulip seed!/);
    assert.match(await ada.page.locator('#received-note').textContent(), /“Loved your frogs! 🐸”/);
    await ada.page.click('#received-plant');
    assert.match(await ada.page.locator('#received-status').textContent(), /Planted!/);
    const gifts = await ada.page.evaluate(() => JSON.parse(localStorage.getItem('terra.gifts.v1')));
    assert.equal(Object.values(gifts.received)[0].from, 'Ben');
    await ada.page.keyboard.press('Escape');
    d = await debug(ada.page);
    const giftId = d.garden.find(id => id.startsWith('g:gift'));
    assert.ok(giftId, 'gift flower in the garden');
    await ada.page.evaluate(id => TerraTerrarium.select(id), giftId);
    assert.match(await ada.page.locator('#terrarium-guide').textContent(), /Tulip.*Gift.*A gift from Ben, planted 2024-03-13\..*Loved your frogs/);
    await ada.page.goto(giftLink);
    await ada.page.locator('#gift-received[open]').waitFor();
    assert.match(await ada.page.locator('#received-status').textContent(), /already planted/);
    assert.equal(await ada.page.locator('#received-plant').isDisabled(), true);
    await ada.page.keyboard.press('Escape');

    // Paste box and broken links.
    await ada.page.goto(origin + '/#terrarium');
    await ada.page.click('#open-link');
    await ada.page.fill('#link-input', 'not a link');
    await ada.page.click('#link-open');
    assert.match(await ada.page.locator('#link-status').textContent(), /doesn't look like a TERRA jar or gift link/);
    await ada.page.keyboard.press('Escape');
    await ada.page.goto(origin + '/?visit=z1.AAAA#terrarium');
    await ada.page.waitForFunction(() => /couldn't be opened|isn't a valid/.test(document.getElementById('toast').textContent));
    assert.equal(await ada.page.locator('#visit-banner').isVisible(), false);

    await ada.page.setViewportSize({ width: 360, height: 800 });
    assert.ok(await ada.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await ada.context.close(); await ben.context.close();
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, [], errors.join(' | '));
    console.log('PASS: share jar link (no notes/locations), friend visits snapshot with own controls hidden, seed gift link with note, one gift per friend per day, gift refused in the wrong jar, planted once in the right jar with sender on the guide card, own jar untouched by visiting, paste box and broken links, phone width, no network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
