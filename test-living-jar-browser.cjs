// Run with Flask on :8080. Streaks and field quests on Home; journal finds living in the jar;
// seasons/day-night preview, rain after new finds, care taps, food webs, field-guide cards and
// rare sightings. Clock is fixed so quests and streaks are deterministic. No network APIs.
require('./test-screens.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const origin = 'http://127.0.0.1:8080', errors = [], outbound = [];
    const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
    await context.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      outbound.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(() => {
      for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[api] = () => { throw Error('No network'); };
    });
    const page = await context.newPage();
    // Wednesday 13 March 2024, midday local time.
    await page.clock.install({ time: new Date(2024, 2, 13, 12, 0, 0) });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const debug = () => page.evaluate(() => TerraTerrarium.debug());
    const J = 'terra.observations.v1', QK = 'terra.quests.v1', TK = 'terra.terrarium.v1';
    const rec = (id, date, type, name, notes = '') => ({ id, type, name, notes, date, privacy: 'hidden' });
    const setJournal = list => page.evaluate(({ J, list }) => localStorage.setItem(J, JSON.stringify(list)), { J, list });

    // A fresh journal: no streak card, quests waiting.
    await page.goto(origin + '/#home');
    assert.equal(await page.locator('#home-streak').isVisible(), false);
    assert.equal(await page.locator('#home-quests').isVisible(), true);
    assert.equal(await page.locator('#quest-daily .quest').count(), 3);
    assert.equal(await page.locator('#quest-weekly .quest').count(), 2);
    assert.equal(await page.locator('#quest-daily .quest.done').count(), 0);
    assert.equal(await page.evaluate(QK => localStorage.getItem(QK), QK), null);

    // Four days in a row ending yesterday: streak alive but "at risk"; nothing is lost.
    const run = [rec('a', '2024-03-09', 'plant', 'Sword fern'), rec('b', '2024-03-10', 'other', 'Pacific tree frog'), rec('c', '2024-03-11', 'fungus', 'Turkey tail'), rec('d', '2024-03-12', 'insect', 'Ladybug')];
    await setJournal(run);
    await page.reload();
    assert.match(await page.locator('#home-streak').textContent(), /4-day streak.*Record a find today to keep it going.*Next: 🐝 Honeybee at 5 days/);
    assert.equal(await page.locator('#home-streak.at-risk').count(), 1);

    // Record today: streak lit, base quest done, seed packet claimed exactly once.
    await setJournal([...run, rec('e', '2024-03-13', 'plant', 'Purple lupine', 'A purple spike of flowers by the trail.')]);
    await page.reload();
    assert.match(await page.locator('#home-streak').textContent(), /5-day streak.*You recorded today/);
    assert.equal(await page.locator('#home-streak.at-risk').count(), 0);
    assert.equal(await page.locator('#quest-daily [data-quest="any"].done').count(), 1);
    assert.match(await page.locator('#toast').textContent(), /Quest complete! .* for your jar\./);
    const quests = JSON.parse(await page.evaluate(QK => localStorage.getItem(QK), QK));
    assert.equal(quests.claimed['2024-03-13/daily/any'].type, 'seed');
    const claimedCount = Object.keys(quests.claimed).length;
    await page.reload();
    assert.equal(Object.keys(JSON.parse(await page.evaluate(QK => localStorage.getItem(QK), QK)).claimed).length, claimedCount, 'reload never re-awards');
    assert.match(await page.locator('#quest-days').textContent(), /1 quest day/);

    // A missed day resets the streak gently and keeps every reward.
    await page.clock.setFixedTime(new Date(2024, 2, 15, 12, 0, 0));
    await page.reload();
    assert.match(await page.locator('#home-streak').textContent(), /Start a new streak today.*best streak: 5 days/);
    assert.equal(Object.keys(JSON.parse(await page.evaluate(QK => localStorage.getItem(QK), QK)).claimed).length, claimedCount);
    await page.clock.setFixedTime(new Date(2024, 2, 13, 12, 0, 0));

    // The jar: finds become residents, the seed is a flower in the garden.
    await page.goto(origin + '/#terrarium');
    let d = await debug();
    assert.deepEqual(d.residents.filter(r => r.id.startsWith('r:')).map(r => r.kind).sort(), ['fern', 'flower', 'frog', 'ladybug', 'shelf']);
    assert.ok(d.residents.some(r => r.id === 'streak3' && r.kind === 'caterpillar'), 'streak reward creature lives in the jar');
    assert.ok(d.residents.some(r => r.id === 'streak5' && r.kind === 'bee'));
    assert.equal(d.garden.length, Object.values(quests.claimed).filter(r => r.type === 'seed').length);
    assert.deepEqual([d.env.season, d.env.phase], ['spring', 'day'], 'real season and time of day (northern hemisphere)');
    assert.match(await page.locator('#terrarium-sky').textContent(), /Spring · day/);
    assert.equal(await page.locator('#terrarium-preview').isVisible(), false, 'season preview is for the sandbox');

    // Tapping a find opens its field-guide card.
    await page.evaluate(() => TerraTerrarium.select('r:b'));
    assert.equal(await page.locator('#terrarium-guide').isVisible(), true);
    assert.match(await page.locator('#terrarium-guide').textContent(), /Pacific tree frog.*Your find from 2024-03-10.*frog.*Frogs absorb water/);
    await page.evaluate(() => TerraTerrarium.select('followers10'));
    assert.equal(await page.locator('#terrarium-guide').isVisible(), false, 'Songbird not earned: no card');
    await page.locator('#decor-list [data-achievement="first"] .collection-find').click();
    assert.match(await page.locator('#terrarium-guide').textContent(), /Sprout.*Unlocked by “First observation”.*cotyledons/);
    await page.keyboard.press('Escape');

    // Rain after new finds (not on a plain reload), and it stops.
    assert.equal(d.raining, false, 'the very first look at the jar does not rain');
    await page.evaluate(({ J, r }) => localStorage.setItem(J, JSON.stringify([...JSON.parse(localStorage.getItem(J)), r])), { J, r: rec('f', '2024-03-13', 'fungus', 'Chanterelle') });
    await page.reload();
    d = await debug();
    assert.equal(d.raining, true, 'new journal finds water the jar');
    assert.equal(JSON.parse(await page.evaluate(TK => localStorage.getItem(TK), TK)).seen, 6);
    await page.evaluate(() => TerraTerrarium.step(60));
    assert.equal((await debug()).raining, false);
    await page.reload();
    assert.equal((await debug()).raining, false, 'no rain without new finds');

    // Care taps.
    await page.click('[data-care="mist"]');
    assert.match(await page.locator('#terrarium-caption').textContent(), /misted the jar/);
    await page.click('[data-care="seed"]');
    assert.ok((await debug()).seeds > 0);
    assert.match(await page.locator('#terrarium-caption').textContent(), /scattered seed/);

    // Sandbox: preview seasons and night, make it rain, food webs, everything selectable.
    await page.click('#terrarium-sandbox');
    assert.equal(await page.locator('#terrarium-preview').isVisible(), true);
    await page.selectOption('#terrarium-season', 'summer'); await page.selectOption('#terrarium-time', 'night');
    await page.evaluate(() => TerraTerrarium.step(1));
    d = await debug();
    assert.deepEqual([d.env.season, d.env.phase], ['summer', 'night']);
    assert.ok(d.fireflies > 0, 'fireflies on warm nights');
    assert.match(await page.locator('#terrarium-sky').textContent(), /Summer · night \(preview\)/);
    await page.selectOption('#terrarium-season', 'winter');
    await page.evaluate(() => TerraTerrarium.step(1));
    assert.equal((await debug()).fireflies, 0, 'no fireflies in winter');
    await page.click('#terrarium-preview [data-care="rain"]');
    assert.equal((await debug()).raining, true);
    assert.ok((await debug()).residents.length >= 12, 'sample finds in the sandbox');
    assert.equal((await debug()).garden.length, 5);
    let crunch = false, snap = false;
    for (let i = 0; i < 400 && !(crunch && snap); i++) {
      if (i % 40 === 0) await page.click('#terrarium-preview [data-care="rain"]');
      await page.evaluate(() => TerraTerrarium.step(1.5));
      const caption = await page.locator('#terrarium-caption').textContent();
      crunch ||= /ladybug ate an aphid/.test(caption); snap ||= /frog caught a fly/.test(caption);
    }
    assert.ok(crunch, 'ladybugs eat aphids on the sprout');
    assert.ok(snap, 'frogs catch flies after rain');
    const sandboxRares = await page.evaluate(TK => JSON.parse(localStorage.getItem(TK)).rare, TK);
    assert.deepEqual(sandboxRares, {}, 'sandbox sightings are not logged');
    // A quest decoration can be moved in the sandbox without saving.
    const qid = Object.keys((await debug()).decor).find(id => id.startsWith('q:'));
    await page.evaluate(id => TerraTerrarium.select(id), qid);
    assert.match(await page.locator('#terrarium-guide').textContent(), /Weekly field-quest reward/);
    await page.locator('#terrarium-canvas').focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(JSON.stringify(JSON.parse(await page.evaluate(QK => localStorage.getItem(QK), QK)).spots), '{}');
    await page.click('#terrarium-sandbox');
    assert.deepEqual([(await debug()).env.season], ['spring'], 'leaving the sandbox returns to the real season');

    // Rare sightings list: ??? until seen, then the name and date.
    assert.equal(await page.locator('#rare-list .rare-card').count(), 5);
    assert.equal(await page.locator('#rare-list .rare-card.legendary.unseen').count(), 2, 'legendaries start as ???');
    assert.match(await page.locator('#rare-list').textContent(), /\?\?\?.*Not spotted yet/);
    await page.evaluate(TK => { const s = JSON.parse(localStorage.getItem(TK)); s.rare['luna-moth'] = '2024-03-01'; localStorage.setItem(TK, JSON.stringify(s)); }, TK);
    await page.reload();
    assert.equal(await page.locator('#rare-list .rare-card.seen.legendary').count(), 1);
    assert.match(await page.locator('#rare-list .rare-card.seen.legendary').textContent(), /Legendary.*Moonlight moth.*First seen 2024-03-01/);

    // Southern hemisphere: the latest located find flips the seasons.
    await page.evaluate(({ J, r }) => localStorage.setItem(J, JSON.stringify([...JSON.parse(localStorage.getItem(J)), r])), { J, r: { ...rec('g', '2024-03-13', 'plant', 'Kauri'), privacy: 'exact', location: { version: 1, space: 'terra-geo-v1', kind: 'point', x: 174.7, y: -36.8 } } });
    await page.reload();
    assert.equal((await debug()).env.season, 'autumn');

    // Narrow phone width: cards fit.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(origin + '/#home');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll on Home');
    await page.goto(origin + '/#terrarium');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll in the terrarium');

    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
    console.log('PASS: streak card (alive/at-risk/reset gently), daily+weekly quests claimed once, finds and streak creatures living in the jar, quest garden and decor, field-guide cards, rain after new finds, care taps, season/night preview with fireflies, ladybug-aphid and frog-fly food webs, rare sightings log (sandbox not logged), southern seasons, phone width, no network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
