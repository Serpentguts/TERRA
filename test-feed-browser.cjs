const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const origin = 'http://127.0.0.1:8080', external = [], errors = [];
    await context.route('**/*', route => {
      if (route.request().url().startsWith(origin + '/')) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = () => { throw Error('No GPS'); };
      for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[key] = () => { throw Error('No network APIs'); };
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const F = 'terra.feed.v1', J = 'terra.observations.v1';
    const raw = key => page.evaluate(k => localStorage.getItem(k), key);
    const feed = async () => JSON.parse(await raw(F));
    await page.goto(origin + '/#feed');
    assert.equal(await raw(F), null, 'No startup writes');
    assert.equal(await raw(J), null);
    assert.equal(await page.locator('#feed-samples > li').count(), 5);
    await page.locator('#feed-samples a[href="#demo-profile-moss"]').click();
    assert.equal(await page.locator('#demo-profile-moss').evaluate(el => el === document.activeElement), true);
    assert.match(await page.locator('#demo-profile-moss').textContent(), /Fictional woodland/);
    await page.click('[data-follow="moss"]');
    assert.deepEqual((await feed()).following, ['moss']);
    assert.equal(await page.locator('[data-follow="moss"]').getAttribute('aria-pressed'), 'true');
    await page.reload(); assert.equal(await page.locator('[data-follow="moss"]').textContent(), 'Unfollow locally');
    await page.click('[data-follow="moss"]'); assert.deepEqual((await feed()).following, []);
    await page.click('#feed .close-view');
    await page.goto(origin + '/#demo-profile-fern');
    assert(await page.locator('#feed').isVisible(), 'Deep link reopens containing feed');
    await page.selectOption('#feed-type', 'offering');
    assert(await page.locator('#feed-to-inat').isDisabled());
    await page.fill('#feed-post-title', '<img src=x onerror=alert(1)> Seed swap');
    await page.fill('#feed-body', '<script>private caption</script>');
    await page.click('#feed-save');
    assert.equal((await feed()).posts.length, 1);
    assert.equal(await page.locator('#feed-local-posts img, #feed-local-posts script').count(), 0);
    assert.match(await page.locator('#feed-local-posts').textContent(), /NOT PUBLISHED.*not available to buy/is);
    assert.equal(await raw(J), null);

    // Seed legacy and privacy-tier records: no changes/migrations or copied private details.
    const records = ['hidden', 'approximate', 'exact'].map((privacy, i) => ({ id: `o${i}`, type: 'fungus', name: `Finding ${privacy}`, date: '2024-02-01', notes: 'SECRET journal notes', privacy }));
    await page.evaluate(({ J, records }) => localStorage.setItem(J, JSON.stringify(records)), { J, records });
    await page.reload(); const journal = await raw(J);
    for (const [i, [terra, inat]] of [[true, false], [false, true], [true, true]].entries()) {
      await page.click('#bottom-navigation a[href="#projects-title"]');
      await page.locator(`[data-share-observation="o${i}"]`).click();
      assert.equal(await page.locator('#feed-type').inputValue(), 'observation');
      assert.equal(await page.locator('#feed-source').inputValue(), `o${i}`);
      assert(await page.locator('#feed').isVisible());
      assert.equal(await page.locator('#feed-post-title').evaluate(el => el === document.activeElement), true);
      await page.fill('#feed-post-title', `Share ${i}`);
      await page.locator('#feed-to-terra').setChecked(terra);
      await page.locator('#feed-to-inat').setChecked(inat);
      await page.click('#feed-save');
      assert.equal((await feed()).posts.length, i + 2);
      assert.equal(await raw(J), journal);
    }
    assert.equal(await page.locator('#feed-local-posts > li').count(), 3);
    assert.equal(await page.locator('#feed-preparations > li').count(), 2);
    assert.doesNotMatch(await raw(F), /SECRET|Finding hidden|location|privacy/);
    assert.match(await page.locator('#feed-preparations').textContent(), /NOT SUBMITTED.*not an export or an upload-ready payload/is);
    await page.reload(); assert.equal((await feed()).posts.length, 4);
    // Selection is deliberate; neither destination must fail without writing.
    await page.fill('#feed-post-title', 'Keep my draft');
    await page.uncheck('#feed-to-terra');
    await page.click('#feed-save');
    assert.match(await page.locator('#feed-form-error').textContent(), /at least one local destination/);
    assert.equal((await feed()).posts.length, 4);
    // Quota failure keeps caption and prior state. Journal writes are independent.
    const prior = await raw(F);
    await page.check('#feed-to-terra');
    await page.evaluate(() => {
      window.nativeSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v) { if (k === 'terra.feed.v1') throw Error('quota'); return window.nativeSet.call(this, k, v); };
    });
    await page.click('#feed-save');
    assert.match(await page.locator('#feed-form-error').textContent(), /could not be saved.*Draft/is);
    assert.equal(await page.locator('#feed-post-title').inputValue(), 'Keep my draft');
    assert.equal(await raw(F), prior);
    await page.evaluate(() => Storage.prototype.setItem = window.nativeSet);
    // Another tab's additions retained; storage events do not erase draft.
    const tab = await context.newPage(); await tab.goto(origin + '/#feed');
    await tab.click('[data-follow="fern"]');
    await page.waitForFunction(() => document.querySelector('[data-follow="fern"]').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('#feed-post-title').inputValue(), 'Keep my draft');
    await page.click('#feed-save');
    assert.deepEqual((await feed()).following, ['fern']);
    await tab.close();

    // Trash/missing records never reveal a stale identification snapshot; preparations survive as references.
    await page.evaluate(({ J, records }) => {
      records[2].deletedAt = new Date().toISOString();
      localStorage.setItem(J, JSON.stringify(records));
      document.dispatchEvent(new Event('terra:journal-rendered'));
    }, { J, records });
    assert.match(await page.locator('#feed-preparations [data-post-id]').first().textContent(), /Source observation unavailable/);
    assert.doesNotMatch(await page.locator('#feed-preparations [data-post-id]').first().textContent(), /Finding exact/);
    const beforeRemove = await raw(J);
    await page.locator('#feed-local-posts button').last().click();
    assert.equal(await raw(J), beforeRemove);
    // Corrupt feed fails closed without rewriting either store.
    await page.evaluate(F => localStorage.setItem(F, '{broken'), F);
    await page.reload(); await page.click('#bottom-navigation a[href="#feed"]');
    assert(await page.locator('#feed-save').isDisabled());
    assert(await page.locator('[data-follow="fern"]').isDisabled());
    assert.equal(await raw(F), '{broken'); assert.equal(await raw(J), beforeRemove);
    assert.equal(await page.locator('#feed-samples > li').count(), 5);
    // Repair only our synthetic test data, then exercise a source disappearing just before save.
    await page.evaluate(F => localStorage.removeItem(F), F); await page.reload();
    await page.selectOption('#feed-type', 'observation'); await page.selectOption('#feed-source', 'o0');
    await page.fill('#feed-post-title', 'Stale source');
    await page.evaluate(J => localStorage.setItem(J, '[]'), J);
    await page.click('#feed-save');
    assert.match(await page.locator('#feed-form-error').textContent(), /source observation is unavailable/);
    assert.equal(await raw(F), null);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `No horizontal overflow at ${width}`);
    }
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log('PASS: local mock Feed, profiles/follows, typed posts, three destinations, persistence, privacy, failures, cross-tab, Trash, responsive/no-network');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
